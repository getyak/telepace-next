"""Billing REST endpoints: summary, checkout, portal, Stripe webhook.

All authenticated endpoints operate on the caller's org (`AuthUser.org_id`)
— there is no org id in the URL, so cross-tenant access is impossible by
construction. The webhook is unauthenticated but signature-verified.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict

from core.billing import PlanKind
from core.billing.gateway import (
    WebhookVerificationError,
    subscription_state_from_stripe,
)
from core.billing.service import BillingService
from core.constants import API_VERSION_PREFIX
from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.config import Settings
from interfaces.rest_api.deps import get_settings_dep, get_state
from interfaces.rest_api.errors import ErrorMessages

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_VERSION_PREFIX}/billing", tags=["billing"])

# Plans a user can buy through checkout. Free is the default, never purchased.
_PURCHASABLE = {PlanKind.PRO, PlanKind.TEAM}


def get_billing(request: Request) -> BillingService:
    service = getattr(get_state(request), "billing", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorMessages.BILLING_UNAVAILABLE,
        )
    return service


class CheckoutBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: PlanKind


@router.get("/summary")
async def billing_summary(
    user: AuthUser = Depends(require_current_user),
    billing: BillingService = Depends(get_billing),
) -> dict:
    summary = await billing.summary(user.org_id)
    return {
        "plan": summary.plan.value,
        "status": summary.status,
        "quota": summary.quota,
        "qualified_used": summary.qualified_used,
        "disqualified": summary.disqualified,
        "voice_seconds": summary.voice_seconds,
        "period_key": summary.period_key,
        "current_period_end": (
            summary.current_period_end.isoformat() if summary.current_period_end else None
        ),
        "has_subscription": summary.has_subscription,
    }


@router.post("/checkout")
async def create_checkout(
    body: CheckoutBody,
    request: Request,
    user: AuthUser = Depends(require_current_user),
    billing: BillingService = Depends(get_billing),
    settings: Settings = Depends(get_settings_dep),
) -> dict:
    if body.plan not in _PURCHASABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorMessages.INVALID_PLAN
        )
    state = get_state(request)
    repo = state.billing_repo
    gateway = state.billing_gateway
    await repo.get_or_create_account(user.org_id)
    customer_id = await gateway.ensure_customer(org_id=str(user.org_id), email=user.email)
    await repo.set_stripe_customer(user.org_id, customer_id)
    base = settings.public_base_url.rstrip("/")
    url = await gateway.create_checkout_session(
        customer_id=customer_id,
        plan=body.plan,
        success_url=f"{base}/settings?billing=success",
        cancel_url=f"{base}/settings?billing=canceled",
    )
    return {"url": url}


@router.post("/portal")
async def create_portal(
    request: Request,
    user: AuthUser = Depends(require_current_user),
    billing: BillingService = Depends(get_billing),
    settings: Settings = Depends(get_settings_dep),
) -> dict:
    state = get_state(request)
    account = await state.billing_repo.get_or_create_account(user.org_id)
    if account.stripe_customer_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.BILLING_UNAVAILABLE,
        )
    url = await state.billing_gateway.create_portal_session(
        customer_id=account.stripe_customer_id,
        return_url=f"{settings.public_base_url.rstrip('/')}/settings",
    )
    return {"url": url}


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    """Sync subscription lifecycle from Stripe. Unauthenticated; the HMAC
    signature is the trust boundary. Unknown event types are acknowledged so
    Stripe stops retrying them."""
    state = get_state(request)
    gateway = getattr(state, "billing_gateway", None)
    repo = getattr(state, "billing_repo", None)
    if gateway is None or repo is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorMessages.BILLING_UNAVAILABLE,
        )
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = gateway.parse_webhook(payload, signature)
    except WebhookVerificationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.WEBHOOK_SIGNATURE_INVALID,
        ) from None

    event_dict: dict = event if isinstance(event, dict) else event.to_dict()  # type: ignore[union-attr]
    event_type = str(event_dict.get("type", ""))
    data = (event_dict.get("data") or {}).get("object") or {}

    if event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        sub = subscription_state_from_stripe(data)
        account = await repo.find_by_customer(sub.customer_id)
        if account is None:
            # Customer created outside our checkout flow — nothing to bind to.
            logger.warning("webhook for unknown customer %s", sub.customer_id)
            return {"received": True}
        if event_type == "customer.subscription.deleted":
            await repo.apply_subscription(
                account.org_id,
                plan=PlanKind.FREE,
                status="canceled",
                stripe_subscription_id=None,
                current_period_start=None,
                current_period_end=None,
            )
        else:
            await repo.apply_subscription(
                account.org_id,
                plan=sub.plan,
                status=sub.status,
                stripe_subscription_id=sub.subscription_id,
                current_period_start=sub.current_period_start,
                current_period_end=sub.current_period_end,
            )
    return {"received": True}

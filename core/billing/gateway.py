"""Payment gateway protocol + Stripe implementation + in-memory mock.

The router and metering hook depend only on `PaymentGateway`, so tests (and
dev environments without a Stripe key) run against `MockPaymentGateway`.
`StripeGateway` wraps the official SDK; all calls run in a thread because the
stripe-python client is synchronous.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from core.billing.plans import PlanKind


@dataclass(frozen=True, slots=True)
class SubscriptionState:
    """The subset of a Stripe subscription that billing_accounts persists."""

    plan: PlanKind
    status: str
    subscription_id: str | None
    customer_id: str
    current_period_start: datetime | None
    current_period_end: datetime | None


class WebhookVerificationError(Exception):
    """Signature check failed — the payload must not be trusted."""


class PaymentGateway(Protocol):
    async def ensure_customer(self, *, org_id: str, email: str) -> str:
        """Return a Stripe customer id for the org, creating one if needed."""
        ...

    async def create_checkout_session(
        self, *, customer_id: str, plan: PlanKind, success_url: str, cancel_url: str
    ) -> str:
        """Start a subscription Checkout for the plan. Returns the session URL."""
        ...

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> str:
        """Return a Customer Portal URL for managing the subscription."""
        ...

    async def report_overage(self, *, customer_id: str, quantity: int) -> None:
        """Report metered overage usage (qualified interviews beyond quota)."""
        ...

    def parse_webhook(self, payload: bytes, signature: str) -> object:
        """Verify + parse a webhook payload. Raises WebhookVerificationError."""
        ...


# --------------------------------------------------------------------------
# Stripe implementation
# --------------------------------------------------------------------------


class StripeGateway:
    """Official-SDK gateway. Price ids come from Settings (created by
    scripts/stripe_bootstrap.py). Overage uses Stripe Billing Meters — the
    meter event name is shared by the pro/team metered prices."""

    def __init__(
        self,
        *,
        secret_key: str,
        webhook_secret: str,
        price_ids: dict[PlanKind, str],
        meter_event_name: str,
        overage_price_ids: dict[PlanKind, str] | None = None,
    ) -> None:
        import stripe

        self._stripe = stripe
        self._client = stripe.StripeClient(secret_key)
        self._webhook_secret = webhook_secret
        self._price_ids = price_ids
        self._meter_event_name = meter_event_name
        self._overage_price_ids = overage_price_ids or {}

    async def ensure_customer(self, *, org_id: str, email: str) -> str:
        def _run() -> str:
            found = self._client.customers.search(
                params={"query": f"metadata['org_id']:'{org_id}'", "limit": 1}
            )
            if found.data:
                return found.data[0].id
            created = self._client.customers.create(
                params={"email": email, "metadata": {"org_id": org_id}}
            )
            return created.id

        return await asyncio.to_thread(_run)

    async def create_checkout_session(
        self, *, customer_id: str, plan: PlanKind, success_url: str, cancel_url: str
    ) -> str:
        price_id = self._price_ids[plan]
        # The metered overage price must ride on the SAME subscription as the
        # base price, or meter events for this customer have nothing to bill
        # against. Metered line items must not carry a quantity.
        line_items: list[dict] = [{"price": price_id, "quantity": 1}]
        overage_price = self._overage_price_ids.get(plan)
        if overage_price:
            line_items.append({"price": overage_price})

        def _run() -> str:
            session = self._client.checkout.sessions.create(
                params={
                    "mode": "subscription",
                    "customer": customer_id,
                    "line_items": line_items,
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                    "subscription_data": {"metadata": {"plan": plan.value}},
                    "allow_promotion_codes": True,
                }
            )
            assert session.url is not None
            return session.url

        return await asyncio.to_thread(_run)

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> str:
        def _run() -> str:
            session = self._client.billing_portal.sessions.create(
                params={"customer": customer_id, "return_url": return_url}
            )
            return session.url

        return await asyncio.to_thread(_run)

    async def report_overage(self, *, customer_id: str, quantity: int) -> None:
        def _run() -> None:
            self._client.billing.meter_events.create(
                params={
                    "event_name": self._meter_event_name,
                    "payload": {
                        "stripe_customer_id": customer_id,
                        "value": str(quantity),
                    },
                }
            )

        await asyncio.to_thread(_run)

    def parse_webhook(self, payload: bytes, signature: str) -> object:
        try:
            return self._stripe.Webhook.construct_event(
                payload, signature, self._webhook_secret
            )
        except (ValueError, self._stripe.error.SignatureVerificationError) as exc:
            raise WebhookVerificationError(str(exc)) from exc


def subscription_state_from_stripe(subscription: object) -> SubscriptionState:
    """Map a Stripe Subscription object (from a webhook) to our state.

    Plan resolution order: subscription metadata (set at checkout) → price
    lookup_key (set by the bootstrap script) → free as a conservative
    fallback (an unrecognized subscription must never grant paid quota).
    """
    sub: dict = subscription if isinstance(subscription, dict) else dict(subscription)  # type: ignore[arg-type]

    plan_raw = (sub.get("metadata") or {}).get("plan")
    if plan_raw is None:
        items = ((sub.get("items") or {}).get("data")) or []
        for item in items:
            lookup = ((item.get("price") or {}).get("lookup_key")) or ""
            # bootstrap lookup keys: telepace_pro_base / telepace_team_base
            for kind in (PlanKind.PRO, PlanKind.TEAM):
                if kind.value in lookup:
                    plan_raw = kind.value
                    break
            if plan_raw:
                break
    plan = PlanKind(plan_raw) if plan_raw in {p.value for p in PlanKind} else PlanKind.FREE

    def _ts(key: str) -> datetime | None:
        # Stripe API ≥ 2025-03 moved period bounds onto subscription items.
        value = sub.get(key)
        if value is None:
            items = ((sub.get("items") or {}).get("data")) or []
            if items:
                value = items[0].get(key)
        return datetime.fromtimestamp(value, tz=UTC) if value else None

    return SubscriptionState(
        plan=plan,
        status=str(sub.get("status") or "active"),
        subscription_id=sub.get("id"),
        customer_id=str(sub.get("customer") or ""),
        current_period_start=_ts("current_period_start"),
        current_period_end=_ts("current_period_end"),
    )


# --------------------------------------------------------------------------
# Mock implementation (tests + keyless dev)
# --------------------------------------------------------------------------


@dataclass(slots=True)
class MockPaymentGateway:
    """Deterministic in-memory gateway. Records every call for assertions."""

    customers: dict[str, str] = field(default_factory=dict)  # org_id -> customer_id
    checkouts: list[tuple[str, PlanKind]] = field(default_factory=list)
    portals: list[str] = field(default_factory=list)
    overage_reports: list[tuple[str, int]] = field(default_factory=list)
    webhook_events: list[object] = field(default_factory=list)

    async def ensure_customer(self, *, org_id: str, email: str) -> str:
        return self.customers.setdefault(org_id, f"cus_mock_{org_id[:8]}")

    async def create_checkout_session(
        self, *, customer_id: str, plan: PlanKind, success_url: str, cancel_url: str
    ) -> str:
        self.checkouts.append((customer_id, plan))
        return f"https://checkout.stripe.mock/session/{customer_id}/{plan.value}"

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> str:
        self.portals.append(customer_id)
        return f"https://portal.stripe.mock/{customer_id}"

    async def report_overage(self, *, customer_id: str, quantity: int) -> None:
        self.overage_reports.append((customer_id, quantity))

    def parse_webhook(self, payload: bytes, signature: str) -> object:
        import orjson

        if signature != "mock-signature":
            raise WebhookVerificationError("bad mock signature")
        event = orjson.loads(payload)
        self.webhook_events.append(event)
        return event

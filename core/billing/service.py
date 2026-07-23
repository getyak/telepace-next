"""Billing service: quota decisions + usage metering on interview completion.

This is the one place that combines the plan catalog, the quality gate, the
billing repo, and the payment gateway. Routers and the event tail loop call
into this module and stay free of billing logic themselves.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from core.billing.gateway import PaymentGateway
from core.billing.plans import Plan, PlanKind, plan_for
from core.billing.quality_gate import QualityGateConfig, evaluate_quality
from storage.billing import BillingAccount, BillingRepo, period_key_for

logger = logging.getLogger(__name__)

# Channels whose duration counts as voice minutes (a distinct cost line).
VOICE_CHANNELS = {"web_voice", "phone_outbound", "phone_inbound"}


@dataclass(frozen=True, slots=True)
class QuotaDecision:
    allowed: bool
    plan: PlanKind
    quota: int
    used: int
    # True when the org may continue past the quota on metered overage.
    overage: bool


@dataclass(frozen=True, slots=True)
class UsageSummary:
    plan: PlanKind
    status: str
    quota: int
    qualified_used: int
    disqualified: int
    voice_seconds: int
    period_key: str
    current_period_end: datetime | None
    has_subscription: bool


class BillingService:
    def __init__(
        self,
        *,
        repo: BillingRepo,
        gateway: PaymentGateway,
        quality_config: QualityGateConfig,
        quota_overrides: dict[str, int] | None = None,
    ) -> None:
        self._repo = repo
        self._gateway = gateway
        self._quality = quality_config
        self._quota_overrides = quota_overrides or {}

    # --- plan resolution ----------------------------------------------------

    def _resolve_plan(self, account: BillingAccount) -> Plan:
        plan = plan_for(account.plan, quota_overrides=self._quota_overrides)
        if account.quota_override is not None:
            plan = Plan(
                kind=plan.kind,
                monthly_quota=account.quota_override,
                allows_overage=plan.allows_overage,
                overage_cents=plan.overage_cents,
            )
        # A paid plan whose subscription lapsed falls back to free-tier limits.
        if plan.kind is not PlanKind.FREE and account.status in {
            "canceled",
            "unpaid",
            "incomplete_expired",
        }:
            plan = plan_for(PlanKind.FREE, quota_overrides=self._quota_overrides)
        return plan

    # --- quota --------------------------------------------------------------

    async def check_quota(self, org_id: UUID) -> QuotaDecision:
        account = await self._repo.get_or_create_account(org_id)
        plan = self._resolve_plan(account)
        usage = await self._repo.period_usage(org_id, period_key_for(datetime.now(tz=UTC)))
        within = usage.qualified < plan.monthly_quota
        return QuotaDecision(
            allowed=within or plan.allows_overage,
            plan=plan.kind,
            quota=plan.monthly_quota,
            used=usage.qualified,
            overage=plan.allows_overage,
        )

    async def summary(self, org_id: UUID) -> UsageSummary:
        account = await self._repo.get_or_create_account(org_id)
        plan = self._resolve_plan(account)
        key = period_key_for(datetime.now(tz=UTC))
        usage = await self._repo.period_usage(org_id, key)
        return UsageSummary(
            plan=plan.kind,
            status=account.status,
            quota=plan.monthly_quota,
            qualified_used=usage.qualified,
            disqualified=usage.disqualified,
            voice_seconds=usage.voice_seconds,
            period_key=key,
            current_period_end=account.current_period_end,
            has_subscription=account.stripe_subscription_id is not None,
        )

    # --- metering -----------------------------------------------------------

    async def record_completion(
        self,
        *,
        org_id: UUID,
        campaign_id: UUID,
        interview_id: UUID,
        duration_seconds: int,
        goal_coverage: float,
        channel: str | None,
        occurred_at: datetime,
    ) -> None:
        """Meter one completed interview. Idempotent per interview_id.

        Qualified interviews beyond the plan's included quota are reported to
        Stripe as metered overage (paid plans only). Failures to reach Stripe
        are logged, never raised — metering must not break the event loop, and
        `stripe_reported` stays false so a reconciliation job can retry.
        """
        verdict = evaluate_quality(
            duration_seconds=duration_seconds,
            goal_coverage=goal_coverage,
            config=self._quality,
        )
        voice_seconds = duration_seconds if (channel or "") in VOICE_CHANNELS else 0
        inserted = await self._repo.record_interview(
            org_id=org_id,
            campaign_id=campaign_id,
            interview_id=interview_id,
            qualified=verdict.qualified,
            fail_reasons=verdict.reasons,
            duration_seconds=duration_seconds,
            voice_seconds=voice_seconds,
            channel=channel,
            occurred_at=occurred_at,
        )
        if not inserted or not verdict.qualified:
            return

        account = await self._repo.get_or_create_account(org_id)
        plan = self._resolve_plan(account)
        usage = await self._repo.period_usage(org_id, period_key_for(occurred_at))
        beyond_quota = usage.qualified > plan.monthly_quota
        if beyond_quota and plan.allows_overage and account.stripe_customer_id:
            try:
                await self._gateway.report_overage(
                    customer_id=account.stripe_customer_id, quantity=1
                )
                await self._repo.mark_stripe_reported(interview_id)
            except Exception:
                logger.exception(
                    "stripe overage report failed org=%s interview=%s",
                    org_id,
                    interview_id,
                )

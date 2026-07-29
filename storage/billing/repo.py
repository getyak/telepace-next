"""Postgres billing repository: accounts, usage records, period aggregates.

Schema is created on startup via `BILLING_SCHEMA_SQL` (same pattern as
`storage.projections` / users repo). Two tables:

- billing_accounts — one row per org: current plan + Stripe linkage. Every
  org implicitly starts on the free plan; a row is only written when the org
  first touches billing (checkout, quota check, usage record).
- usage_records — one row per completed interview, idempotent on
  interview_id. `qualified` marks whether the interview passed the quality
  gate (T-613) and therefore counts against quota; disqualified interviews
  are stored too so the account page can show why something wasn't billed.

Period accounting uses a `period_key` of the form YYYY-MM (UTC calendar
month). Stripe subscription periods may drift a few days from calendar
months; the calendar month is the product-facing quota window while Stripe's
own metering settles actual overage money — the two do not need to agree to
the day.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import asyncpg

from core.billing import PlanKind

BILLING_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS billing_accounts (
    org_id                 UUID PRIMARY KEY,
    plan                   TEXT NOT NULL DEFAULT 'free',
    status                 TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,
    current_period_start   TIMESTAMPTZ,
    current_period_end     TIMESTAMPTZ,
    quota_override         INTEGER,
    created_at             TIMESTAMPTZ NOT NULL,
    updated_at             TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_customer_idx
    ON billing_accounts (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS usage_records (
    id               UUID PRIMARY KEY,
    org_id           UUID NOT NULL,
    campaign_id      UUID NOT NULL,
    interview_id     UUID NOT NULL UNIQUE,
    qualified        BOOLEAN NOT NULL,
    fail_reasons     TEXT[] NOT NULL DEFAULT '{}',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    voice_seconds    INTEGER NOT NULL DEFAULT 0,
    channel          TEXT,
    period_key       TEXT NOT NULL,
    stripe_reported  BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at      TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_records_org_period_idx
    ON usage_records (org_id, period_key, qualified);
"""


@dataclass(slots=True, frozen=True)
class BillingAccount:
    org_id: UUID
    plan: PlanKind
    status: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    current_period_start: datetime | None
    current_period_end: datetime | None
    quota_override: int | None


@dataclass(slots=True, frozen=True)
class PeriodUsage:
    qualified: int
    disqualified: int
    voice_seconds: int


def _now() -> datetime:
    return datetime.now(tz=UTC)


def period_key_for(ts: datetime) -> str:
    return ts.astimezone(UTC).strftime("%Y-%m")


def _row_to_account(row: asyncpg.Record) -> BillingAccount:
    return BillingAccount(
        org_id=row["org_id"],
        plan=PlanKind(row["plan"]),
        status=row["status"],
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        current_period_start=row["current_period_start"],
        current_period_end=row["current_period_end"],
        quota_override=row["quota_override"],
    )


class BillingRepo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    # --- accounts -----------------------------------------------------------

    async def get_or_create_account(self, org_id: UUID) -> BillingAccount:
        now = _now()
        row = await self._pool.fetchrow(
            """
            INSERT INTO billing_accounts (org_id, created_at, updated_at)
            VALUES ($1, $2, $2)
            ON CONFLICT (org_id) DO UPDATE SET updated_at = billing_accounts.updated_at
            RETURNING *
            """,
            org_id,
            now,
        )
        assert row is not None
        return _row_to_account(row)

    async def get_account(self, org_id: UUID) -> BillingAccount | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM billing_accounts WHERE org_id = $1", org_id
        )
        return _row_to_account(row) if row else None

    async def find_by_customer(self, stripe_customer_id: str) -> BillingAccount | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM billing_accounts WHERE stripe_customer_id = $1",
            stripe_customer_id,
        )
        return _row_to_account(row) if row else None

    async def set_stripe_customer(self, org_id: UUID, stripe_customer_id: str) -> None:
        await self._pool.execute(
            """
            UPDATE billing_accounts
               SET stripe_customer_id = $2, updated_at = $3
             WHERE org_id = $1
            """,
            org_id,
            stripe_customer_id,
            _now(),
        )

    async def apply_subscription(
        self,
        org_id: UUID,
        *,
        plan: PlanKind,
        status: str,
        stripe_subscription_id: str | None,
        current_period_start: datetime | None,
        current_period_end: datetime | None,
    ) -> None:
        """Sync subscription state from a Stripe webhook. Idempotent."""
        await self._pool.execute(
            """
            UPDATE billing_accounts
               SET plan = $2,
                   status = $3,
                   stripe_subscription_id = $4,
                   current_period_start = $5,
                   current_period_end = $6,
                   updated_at = $7
             WHERE org_id = $1
            """,
            org_id,
            plan.value,
            status,
            stripe_subscription_id,
            current_period_start,
            current_period_end,
            _now(),
        )

    # --- usage --------------------------------------------------------------

    async def record_interview(
        self,
        *,
        org_id: UUID,
        campaign_id: UUID,
        interview_id: UUID,
        qualified: bool,
        fail_reasons: tuple[str, ...],
        duration_seconds: int,
        voice_seconds: int,
        channel: str | None,
        occurred_at: datetime,
    ) -> bool:
        """Insert one usage record. Returns False when the interview was
        already recorded (idempotent replay of the same event)."""
        result = await self._pool.execute(
            """
            INSERT INTO usage_records
                (id, org_id, campaign_id, interview_id, qualified, fail_reasons,
                 duration_seconds, voice_seconds, channel, period_key,
                 occurred_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (interview_id) DO NOTHING
            """,
            uuid4(),
            org_id,
            campaign_id,
            interview_id,
            qualified,
            list(fail_reasons),
            duration_seconds,
            voice_seconds,
            channel,
            period_key_for(occurred_at),
            occurred_at,
            _now(),
        )
        return result.endswith("1")

    async def period_usage(self, org_id: UUID, period_key: str) -> PeriodUsage:
        row = await self._pool.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE qualified)      AS qualified,
                COUNT(*) FILTER (WHERE NOT qualified)  AS disqualified,
                COALESCE(SUM(voice_seconds), 0)        AS voice_seconds
              FROM usage_records
             WHERE org_id = $1 AND period_key = $2
            """,
            org_id,
            period_key,
        )
        assert row is not None
        return PeriodUsage(
            qualified=int(row["qualified"]),
            disqualified=int(row["disqualified"]),
            voice_seconds=int(row["voice_seconds"]),
        )

    async def mark_stripe_reported(self, interview_id: UUID) -> None:
        await self._pool.execute(
            "UPDATE usage_records SET stripe_reported = TRUE WHERE interview_id = $1",
            interview_id,
        )

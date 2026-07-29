"""Plan catalog: the three-tier ladder from the pricing epic (issue #31).

Pricing unit = one *qualified completed interview* (T-601 minimal gate).
Seats and MCP calls are never billed. Quotas are monthly, per org, and every
number here can be overridden via Settings so ops can tune without a deploy.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class PlanKind(StrEnum):
    FREE = "free"
    PRO = "pro"
    TEAM = "team"


@dataclass(frozen=True, slots=True)
class Plan:
    kind: PlanKind
    # Qualified interviews included per monthly period.
    monthly_quota: int
    # Whether usage beyond the quota is allowed (billed as metered overage).
    # Free has no payment method on file, so it hard-stops at the quota.
    allows_overage: bool
    # Overage price per qualified interview, in USD cents (informational —
    # the authoritative price lives on the Stripe metered price object).
    overage_cents: int


PLAN_CATALOG: dict[PlanKind, Plan] = {
    PlanKind.FREE: Plan(PlanKind.FREE, monthly_quota=20, allows_overage=False, overage_cents=0),
    PlanKind.PRO: Plan(PlanKind.PRO, monthly_quota=200, allows_overage=True, overage_cents=50),
    PlanKind.TEAM: Plan(PlanKind.TEAM, monthly_quota=1000, allows_overage=True, overage_cents=35),
}


def plan_for(kind: PlanKind | str, *, quota_overrides: dict[str, int] | None = None) -> Plan:
    """Resolve a plan, applying per-plan quota overrides from Settings."""
    resolved = PlanKind(kind)
    base = PLAN_CATALOG[resolved]
    if quota_overrides and resolved.value in quota_overrides:
        return Plan(
            kind=base.kind,
            monthly_quota=quota_overrides[resolved.value],
            allows_overage=base.allows_overage,
            overage_cents=base.overage_cents,
        )
    return base

"""BudgetPolicy: gate commands when spend crosses thresholds."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.events import BudgetThresholdCrossed
from harness.policies.base import Policy, PolicyDecision


class BudgetPolicy(Policy):
    name = "budget"

    def __init__(self, warn_ratio: float = 0.8, hard_stop_ratio: float = 1.0) -> None:
        self._warn = warn_ratio
        self._hard = hard_stop_ratio

    async def allow(self, command: Any, context: dict[str, Any]) -> PolicyDecision:
        spent = float(context.get("spent_usd", 0.0))
        budget = float(context.get("budget_usd", 0.0)) or 1e-9
        ratio = spent / budget
        events: list[Any] = []
        cid = getattr(command, "campaign_id", None)
        if ratio >= self._hard and isinstance(cid, UUID):
            events.append(BudgetThresholdCrossed(campaign_id=cid, threshold=self._hard, spent_usd=spent))
            return PolicyDecision(
                allowed=False,
                reason=f"budget exhausted (spent={spent:.2f} / budget={budget:.2f})",
                events=events,
            )
        if ratio >= self._warn and isinstance(cid, UUID):
            events.append(BudgetThresholdCrossed(campaign_id=cid, threshold=self._warn, spent_usd=spent))
        return PolicyDecision(allowed=True, events=events)

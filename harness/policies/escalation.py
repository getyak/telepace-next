"""EscalationPolicy: emit EscalationTriggered on distress / complaint signals."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from core.events import EscalationTriggered
from harness.policies.base import Policy, PolicyDecision

_HIGH_SIGNALS = re.compile(
    r"\b(lawsuit|complain|refund|angry|hate|scam|report you|抱怨|投诉|退款|气死|骗子)\b",
    re.IGNORECASE,
)
_MEDIUM_SIGNALS = re.compile(
    r"\b(disappointed|frustrated|confused|不满意|失望|困惑)\b",
    re.IGNORECASE,
)


class EscalationPolicy(Policy):
    name = "escalation"

    async def allow(self, command: Any, context: dict[str, Any]) -> PolicyDecision:
        _ = context
        text = getattr(command, "text", None)
        if not isinstance(text, str):
            return PolicyDecision(allowed=True)
        cid = getattr(command, "campaign_id", None)
        events: list[Any] = []
        if isinstance(cid, UUID):
            if _HIGH_SIGNALS.search(text):
                events.append(
                    EscalationTriggered(
                        campaign_id=cid,
                        reason="high-signal keyword detected in respondent turn",
                        severity="high",
                    )
                )
            elif _MEDIUM_SIGNALS.search(text):
                events.append(
                    EscalationTriggered(
                        campaign_id=cid,
                        reason="medium-signal keyword detected in respondent turn",
                        severity="medium",
                    )
                )
        return PolicyDecision(allowed=True, events=events)

"""EscalationPolicy: emit EscalationTriggered on distress / complaint signals."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from core.constants import ESCALATION_HIGH_KEYWORDS, ESCALATION_MEDIUM_KEYWORDS
from core.events import EscalationTriggered
from harness.policies.base import Policy, PolicyDecision


def _compile_keyword_group(keywords: tuple[str, ...]) -> re.Pattern[str]:
    # Word-boundary anchoring works for ASCII words; CJK keywords match anywhere
    # because CJK characters are not "word" characters in the regex engine.
    ascii_kw = [k for k in keywords if k.isascii()]
    cjk_kw = [k for k in keywords if not k.isascii()]
    alternatives = []
    if ascii_kw:
        alternatives.append(rf"\b(?:{'|'.join(map(re.escape, ascii_kw))})\b")
    if cjk_kw:
        alternatives.append(f"(?:{'|'.join(map(re.escape, cjk_kw))})")
    return re.compile("|".join(alternatives), re.IGNORECASE)


_HIGH_SIGNALS = _compile_keyword_group(ESCALATION_HIGH_KEYWORDS)
_MEDIUM_SIGNALS = _compile_keyword_group(ESCALATION_MEDIUM_KEYWORDS)


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

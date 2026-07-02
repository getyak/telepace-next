"""PIIPolicy: redact obvious PII before persistence."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from core.events import PIIRedacted
from harness.policies.base import Policy, PolicyDecision

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?:\+?\d[\d\s\-]{7,}\d)")
_CN_ID = re.compile(r"\d{17}[\dXx]")


def redact(text: str) -> tuple[str, list[str]]:
    fields: list[str] = []
    if _EMAIL.search(text):
        fields.append("email")
        text = _EMAIL.sub("[email]", text)
    if _PHONE.search(text):
        fields.append("phone")
        text = _PHONE.sub("[phone]", text)
    if _CN_ID.search(text):
        fields.append("cn_id")
        text = _CN_ID.sub("[id]", text)
    return text, fields


class PIIPolicy(Policy):
    name = "pii"

    async def allow(self, command: Any, context: dict[str, Any]) -> PolicyDecision:
        _ = context
        text = getattr(command, "text", None)
        if not isinstance(text, str):
            return PolicyDecision(allowed=True)
        cleaned, fields = redact(text)
        events: list[Any] = []
        if fields:
            cid = getattr(command, "campaign_id", None)
            iid = getattr(command, "interview_id", None)
            if isinstance(cid, UUID) and isinstance(iid, UUID):
                events.append(PIIRedacted(campaign_id=cid, interview_id=iid, fields=fields))
            try:
                object.__setattr__(command, "text", cleaned)
            except Exception:
                pass
        return PolicyDecision(allowed=True, events=events)

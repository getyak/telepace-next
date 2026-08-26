"""PIIPolicy: redact obvious PII before persistence."""

from __future__ import annotations

import re
from contextlib import suppress
from typing import Any
from uuid import UUID

from core.constants import (
    REDACTION_TOKEN_EMAIL,
    REDACTION_TOKEN_ID,
    REDACTION_TOKEN_PHONE,
)
from core.events import PIIRedacted
from harness.policies.base import Policy, PolicyDecision

# Field labels reported in the PIIRedacted event.
_FIELD_EMAIL = "email"
_FIELD_PHONE = "phone"
_FIELD_CN_ID = "cn_id"

_CN_ID = re.compile(r"\d{17}[\dXx]")
# Dates and trace identifiers are evaluation evidence, not phone numbers.
# Require a bounded 8-15 digit phone-shaped token and explicitly protect an
# ISO-8601 date prefix. Parentheses are accepted for common international
# display formats without letting the expression consume arbitrary prose.
_PHONE = re.compile(
    r"(?<!\w)(?!(?:19|20)\d{2}-\d{2}-\d{2}(?:T|\b))"
    r"(?:\+?\d(?:[\s().-]?\d){7,14})(?!\w)"
)


def _is_word(character: str) -> bool:
    return character == "_" or character.isalnum()


def _is_local_email_character(character: str) -> bool:
    return _is_word(character) or character in ".+-"


def _is_domain_head_character(character: str) -> bool:
    return _is_word(character) or character == "-"


def _is_domain_tail_character(character: str) -> bool:
    return _is_word(character) or character in ".-"


def _email_spans(text: str) -> list[tuple[int, int]]:
    """Find the legacy email-shaped tokens with a bounded linear scan."""

    spans: list[tuple[int, int]] = []
    cursor = 0
    while cursor < len(text):
        at = text.find("@", cursor)
        if at < 0:
            break

        start = at
        while start > cursor and _is_local_email_character(text[start - 1]):
            start -= 1

        domain_start = at + 1
        domain_end = domain_start
        while domain_end < len(text) and _is_domain_head_character(text[domain_end]):
            domain_end += 1

        tail_start = domain_end + 1
        tail_end = tail_start
        if (
            start < at
            and domain_end > domain_start
            and domain_end < len(text)
            and text[domain_end] == "."
        ):
            while tail_end < len(text) and _is_domain_tail_character(text[tail_end]):
                tail_end += 1
            if tail_end > tail_start:
                spans.append((start, tail_end))
                cursor = tail_end
                continue

        cursor = at + 1
    return spans


def _replace_spans(text: str, spans: list[tuple[int, int]], replacement: str) -> str:
    parts: list[str] = []
    cursor = 0
    for start, end in spans:
        if start < cursor:
            continue
        parts.extend((text[cursor:start], replacement))
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts)


def redact(text: str) -> tuple[str, list[str]]:
    fields: list[str] = []
    email_spans = _email_spans(text)
    if email_spans:
        fields.append(_FIELD_EMAIL)
        text = _replace_spans(text, email_spans, REDACTION_TOKEN_EMAIL)
    if _CN_ID.search(text):
        fields.append(_FIELD_CN_ID)
        text = _CN_ID.sub(REDACTION_TOKEN_ID, text)
    if _PHONE.search(text):
        fields.append(_FIELD_PHONE)
        text = _PHONE.sub(REDACTION_TOKEN_PHONE, text)
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
            with suppress(Exception):
                object.__setattr__(command, "text", cleaned)
        return PolicyDecision(allowed=True, events=events)

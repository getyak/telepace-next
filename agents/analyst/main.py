"""AnalystAgent: synthesize insights from a set of completed interviews."""

from __future__ import annotations

import json
import logging
import math
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from agents.shared import LLMClient, load_prompt
from agents.shared.llm import LLMMessage
from core.constants import (
    ANALYST_TURN_HISTORY_LIMIT,
    DEFAULT_PERSONA_CONFIDENCE,
    INSIGHT_TITLE_MAX_CHARS,
)
from core.domain.models import InsightKind
from core.events import EventBase, InsightGenerated

_INSIGHTS_BLOCK = re.compile(r"<insights>(.*?)</insights>", re.DOTALL)
_FENCED_JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
_REPAIR_INSTRUCTION = (
    "The previous response could not be parsed. Return only one valid JSON object "
    "inside <insights>...</insights>, with themes, verbatims, concerns, and persona."
)

logger = logging.getLogger(__name__)


def _parse_insights_payload(text: str) -> dict[str, Any] | None:
    """Accept the contract format plus common provider-safe JSON fallbacks."""
    candidates = [match.group(1) for match in _INSIGHTS_BLOCK.finditer(text)]
    candidates.extend(match.group(1) for match in _FENCED_JSON_BLOCK.finditer(text))
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    first_brace = text.find("{")
    if first_brace >= 0:
        try:
            raw, _ = json.JSONDecoder().raw_decode(text[first_brace:])
        except json.JSONDecodeError:
            pass
        else:
            if isinstance(raw, dict):
                return raw
    return None


def _has_valid_insights_shape(payload: dict[str, Any] | None) -> bool:
    """Reject valid JSON that would still crash or poison insight projections."""
    if payload is None:
        return False

    def valid_item(item: object) -> bool:
        if not isinstance(item, dict):
            return False
        if "confidence" not in item:
            return True
        try:
            confidence = float(item["confidence"])
        except (TypeError, ValueError):
            return False
        return math.isfinite(confidence) and 0.0 <= confidence <= 1.0

    for key in ("themes", "verbatims", "concerns"):
        collection = payload.get(key, [])
        if collection is None:
            continue
        if not isinstance(collection, list) or not all(valid_item(item) for item in collection):
            return False

    persona = payload.get("persona")
    return persona is None or valid_item(persona)


@dataclass(slots=True)
class TranscriptView:
    interview_id: UUID
    turns: list[dict[str, str]]


@dataclass(slots=True)
class SynthesisResult:
    events: list[EventBase]
    themes: list[dict[str, Any]]
    verbatims: list[dict[str, Any]]
    concerns: list[dict[str, Any]]
    persona: dict[str, Any] | None


class AnalystAgent:
    def __init__(
        self,
        llm: LLMClient,
        *,
        max_tokens: int,
        temperature: float,
        prompt_version: str = "v1",
    ) -> None:
        self._llm = llm
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._system = load_prompt("analyst", prompt_version)

    async def synthesize(
        self,
        campaign_id: UUID,
        transcripts: list[TranscriptView],
        want_persona: bool = False,
        language: str = "en",
    ) -> SynthesisResult:
        payload = {
            "campaign_id": str(campaign_id),
            "want_persona": want_persona,
            "language": language,
            "interviews": [
                {"id": str(t.interview_id), "turns": t.turns[-ANALYST_TURN_HISTORY_LIMIT:]}
                for t in transcripts
            ],
        }
        messages = [LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False))]
        resp = await self._llm.complete(
            system=self._system,
            messages=messages,
            max_tokens=self._max_tokens,
            temperature=self._temperature,
        )
        parsed = _parse_insights_payload(resp.text)
        if not _has_valid_insights_shape(parsed):
            repair = await self._llm.complete(
                system=self._system,
                messages=[
                    *messages,
                    LLMMessage(role="assistant", content=resp.text),
                    LLMMessage(role="user", content=_REPAIR_INSTRUCTION),
                ],
                max_tokens=self._max_tokens,
                temperature=0.0,
            )
            parsed = _parse_insights_payload(repair.text)
        if not _has_valid_insights_shape(parsed):
            logger.warning("analyst returned no valid insights campaign_id=%s", campaign_id)
            parsed = {}

        themes = parsed.get("themes", []) or []
        verbatims = parsed.get("verbatims", []) or []
        concerns = parsed.get("concerns", []) or []
        persona = parsed.get("persona")

        events: list[EventBase] = []
        for th in themes:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.THEME.value,
                    title=str(th.get("label", ""))[:INSIGHT_TITLE_MAX_CHARS],
                    confidence=float(th.get("confidence", 0.0)),
                    body=dict(th),
                )
            )
        for vb in verbatims:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.VERBATIM.value,
                    title=str(vb.get("quote", ""))[:INSIGHT_TITLE_MAX_CHARS],
                    confidence=float(vb.get("confidence", 0.0)),
                    body=dict(vb),
                )
            )
        for co in concerns:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.CONCERN.value,
                    title=str(co.get("label", ""))[:INSIGHT_TITLE_MAX_CHARS],
                    confidence=float(co.get("confidence", 0.0)),
                    body=dict(co),
                )
            )
        if persona:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.PERSONA.value,
                    title=str(persona.get("name", "persona"))[:INSIGHT_TITLE_MAX_CHARS],
                    confidence=float(persona.get("confidence", DEFAULT_PERSONA_CONFIDENCE)),
                    body=dict(persona),
                )
            )

        return SynthesisResult(
            events=events,
            themes=themes,
            verbatims=verbatims,
            concerns=concerns,
            persona=persona,
        )

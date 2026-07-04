"""AnalystAgent: synthesize insights from a set of completed interviews."""

from __future__ import annotations

import json
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
    ) -> SynthesisResult:
        payload = {
            "campaign_id": str(campaign_id),
            "want_persona": want_persona,
            "interviews": [
                {"id": str(t.interview_id), "turns": t.turns[-ANALYST_TURN_HISTORY_LIMIT:]}
                for t in transcripts
            ],
        }
        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False))],
            max_tokens=self._max_tokens,
            temperature=self._temperature,
        )
        block = _INSIGHTS_BLOCK.search(resp.text)
        try:
            parsed = json.loads(block.group(1)) if block else {}
        except (json.JSONDecodeError, AttributeError):
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

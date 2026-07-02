"""AnalystAgent: synthesize insights from a set of completed interviews."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from agents.shared import LLMClient, load_prompt
from agents.shared.llm import LLMMessage
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
    def __init__(self, llm: LLMClient, prompt_version: str = "v1") -> None:
        self._llm = llm
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
                {"id": str(t.interview_id), "turns": t.turns[-40:]} for t in transcripts
            ],
        }
        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False))],
            max_tokens=3000,
            temperature=0.3,
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
                    title=str(th.get("label", ""))[:200],
                    confidence=float(th.get("confidence", 0.0)),
                )
            )
        for vb in verbatims:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.VERBATIM.value,
                    title=str(vb.get("quote", ""))[:200],
                    confidence=float(vb.get("confidence", 0.0)),
                )
            )
        for co in concerns:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.CONCERN.value,
                    title=str(co.get("label", ""))[:200],
                    confidence=float(co.get("confidence", 0.0)),
                )
            )
        if persona:
            events.append(
                InsightGenerated(
                    campaign_id=campaign_id,
                    actor="agent:analyst",
                    insight_id=uuid4(),
                    kind=InsightKind.PERSONA.value,
                    title=str(persona.get("name", "persona"))[:200],
                    confidence=float(persona.get("confidence", 0.6)),
                )
            )

        return SynthesisResult(
            events=events,
            themes=themes,
            verbatims=verbatims,
            concerns=concerns,
            persona=persona,
        )

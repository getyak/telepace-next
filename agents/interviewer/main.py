"""InterviewerAgent: moderates a single interview session."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any
from uuid import UUID

from agents.shared import LLMClient, load_prompt
from agents.shared.llm import LLMMessage
from core.domain.models import TurnRole
from core.events import EventBase, InterviewCompleted, TurnRecorded
from core.protocols.commands import ReplyInInterview
from harness.orchestrator import AgentResult

if TYPE_CHECKING:
    from harness.orchestrator import Harness


_ACTION_BLOCK = re.compile(r"<action>(.*?)</action>", re.DOTALL)


class InterviewerAgent:
    def __init__(self, llm: LLMClient, prompt_version: str = "v1") -> None:
        self._llm = llm
        self._system = load_prompt("interviewer", prompt_version)

    async def run(
        self, command: Any, context: dict[str, Any], harness: Harness
    ) -> AgentResult:
        _ = harness
        if not isinstance(command, ReplyInInterview):
            return AgentResult(response={"error": "unsupported command"})
        return await self._on_reply(command, context)

    async def _on_reply(self, cmd: ReplyInInterview, context: dict[str, Any]) -> AgentResult:
        assert cmd.campaign_id is not None
        history: list[dict[str, str]] = list(context.get("interview_history", []))
        outline: list[dict[str, Any]] = context.get("outline", {}).get("items", [])

        respondent_order = len(history) + 1
        history.append({"role": "respondent", "text": cmd.text})

        prompt_user = json.dumps(
            {
                "outline": outline,
                "coverage": context.get("outline_coverage", {}),
                "history": history[-20:],
                "last_respondent_text": cmd.text,
            },
            ensure_ascii=False,
        )

        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=prompt_user)],
            max_tokens=800,
            temperature=0.5,
        )

        action = self._parse_action(resp.text)
        prose = _ACTION_BLOCK.sub("", resp.text).strip()

        events: list[EventBase] = [
            TurnRecorded(
                campaign_id=cmd.campaign_id,
                actor=f"respondent:{cmd.interview_id}",
                interview_id=cmd.interview_id,
                order=respondent_order,
                role=TurnRole.RESPONDENT.value,
                text=cmd.text,
                audio_url=cmd.audio_url,
            )
        ]

        interviewer_text = prose or action.get("text", "")
        history.append({"role": "interviewer", "text": interviewer_text})
        events.append(
            TurnRecorded(
                campaign_id=cmd.campaign_id,
                actor="agent:interviewer",
                interview_id=cmd.interview_id,
                order=respondent_order + 1,
                role=TurnRole.INTERVIEWER.value,
                text=interviewer_text,
                outline_item_id=self._parse_uuid(action.get("outline_item_id")),
            )
        )

        state_delta: dict[str, Any] = {"interview_history": history}

        if action.get("kind") == "wrap_up":
            coverage = self._avg_coverage(context.get("outline_coverage", {}))
            events.append(
                InterviewCompleted(
                    campaign_id=cmd.campaign_id,
                    actor="agent:interviewer",
                    interview_id=cmd.interview_id,
                    duration_seconds=int(context.get("interview_seconds", 0)),
                    goal_coverage=coverage,
                )
            )

        return AgentResult(
            events=events,
            state_delta=state_delta,
            response={
                "text": interviewer_text,
                "kind": action.get("kind", "ask"),
                "outline_item_id": action.get("outline_item_id"),
            },
        )

    @staticmethod
    def _parse_action(text: str) -> dict[str, Any]:
        m = _ACTION_BLOCK.search(text)
        if not m:
            return {"kind": "ask", "text": text.strip()[:500]}
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            return {"kind": "ask", "text": text.strip()[:500]}

    @staticmethod
    def _parse_uuid(v: Any) -> UUID | None:
        if not v:
            return None
        try:
            return UUID(str(v))
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _avg_coverage(coverage: dict[str, float]) -> float:
        if not coverage:
            return 0.0
        return sum(coverage.values()) / len(coverage)

"""InterviewerAgent: moderates a single interview session."""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any
from uuid import UUID

from agents.shared import LLMClient, load_prompt
from agents.shared.llm import LLMMessage
from core.constants import INTERVIEWER_ACTION_TEXT_MAX, INTERVIEWER_HISTORY_WINDOW
from core.domain.models import TurnRole
from core.events import EventBase, InterviewCompleted, TurnRecorded
from core.protocols.commands import ReplyInInterview
from harness.orchestrator import AgentResult

if TYPE_CHECKING:
    from harness.orchestrator import Harness


_ACTION_BLOCK = re.compile(r"<action>(.*?)</action>", re.DOTALL)
# Models sometimes emit the action as a ```json fence instead of <action>
# tags; both must be parsed and stripped so raw JSON never reaches the
# respondent's chat bubble.
_JSON_FENCE = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)


class InterviewerAgent:
    def __init__(
        self,
        llm: LLMClient,
        *,
        max_tokens: int,
        temperature: float,
        prompt_version: str = "v1",
        model: str | None = None,
    ) -> None:
        self._llm = llm
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._model = model
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
        # The discussion guide lives under the campaign spec in memory; the
        # bare "outline" key is a legacy shape kept as a fallback.
        outline_ctx = context.get("outline") or context.get("spec", {}).get("outline") or {}
        outline: list[dict[str, Any]] = (
            outline_ctx.get("items", []) if isinstance(outline_ctx, dict) else []
        )

        respondent_order = len(history) + 1
        history.append({"role": "respondent", "text": cmd.text})

        prompt_user = json.dumps(
            {
                "outline": outline,
                "coverage": context.get("outline_coverage", {}),
                "history": history[-INTERVIEWER_HISTORY_WINDOW:],
                "last_respondent_text": cmd.text,
            },
            ensure_ascii=False,
        )

        resp = await self._llm.complete(
            system=self._system,
            messages=[LLMMessage(role="user", content=prompt_user)],
            model=self._model,
            max_tokens=self._max_tokens,
            temperature=self._temperature,
        )

        action = self._parse_action(resp.text)
        prose = _JSON_FENCE.sub("", _ACTION_BLOCK.sub("", resp.text)).strip()
        # Guard against reasoning-model leakage: if the "prose" is an
        # implausibly long analysis dump, prefer the action's own text.
        action_text = str(action.get("text", "") or "")
        if action_text and len(prose) > INTERVIEWER_ACTION_TEXT_MAX:
            prose = action_text

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

        # Real progress for the respondent UI: which outline question the
        # interviewer is on, out of how many. Falls back to None when the
        # LLM action doesn't reference an outline item (e.g. warm-up turns).
        question_order: int | None = None
        action_item_id = action.get("outline_item_id")
        if action_item_id:
            for item in outline:
                if str(item.get("id")) == str(action_item_id):
                    raw_order = item.get("order")
                    question_order = int(raw_order) if isinstance(raw_order, int | float) else None
                    break

        return AgentResult(
            events=events,
            state_delta=state_delta,
            response={
                "text": interviewer_text,
                "kind": action.get("kind", "ask"),
                "outline_item_id": action.get("outline_item_id"),
                "progress": {
                    "question_order": question_order,
                    "total_questions": len(outline),
                },
            },
        )

    @staticmethod
    def _parse_action(text: str) -> dict[str, Any]:
        m = _ACTION_BLOCK.search(text) or _JSON_FENCE.search(text)
        if not m:
            return {"kind": "ask", "text": text.strip()[:INTERVIEWER_ACTION_TEXT_MAX]}
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            return {"kind": "ask", "text": text.strip()[:INTERVIEWER_ACTION_TEXT_MAX]}

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

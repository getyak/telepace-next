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
_ACTION_KINDS = {"ask", "probe", "acknowledge_and_move", "wrap_up"}
_PROTOCOL_MARKER = re.compile(
    r'^\s*\{|\boutline_item_id\b|"<action>"|</?action>',
    re.IGNORECASE,
)


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
        spec_ctx = context.get("spec", {}) if isinstance(context.get("spec"), dict) else {}
        language = spec_ctx.get("primary_language", "en")

        respondent_order = len(history) + 1
        history.append({"role": "respondent", "text": cmd.text})

        prompt_user = json.dumps(
            {
                "outline": outline,
                "coverage": context.get("outline_coverage", {}),
                "followups": context.get("outline_followups", {}),
                "history": history[-INTERVIEWER_HISTORY_WINDOW:],
                "last_respondent_text": cmd.text,
                "language": language,
                "estimated_duration_minutes": (
                    outline_ctx.get("estimated_duration_minutes")
                    if isinstance(outline_ctx, dict)
                    else None
                ),
                "elapsed_seconds": context.get("interview_seconds", 0),
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
        action, coverage, followups, current_item_id = self._normalize_action(
            action,
            context=context,
            outline=outline,
            language=language,
            respondent_text=cmd.text,
        )
        prose = _JSON_FENCE.sub("", _ACTION_BLOCK.sub("", resp.text)).strip()
        if self._looks_like_protocol(prose):
            prose = ""
        # The structured action is the respondent-facing contract. Models may
        # put internal transition prose before it ("I'll follow up on that")
        # which is not a usable question, so never prefer that prose when the
        # action already provides canonical display text.
        action_text = str(action.get("text", "") or "")

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

        interviewer_text = action_text or prose or self._fallback_question(language)
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

        state_delta: dict[str, Any] = {
            "interview_history": history,
            "outline_coverage": coverage,
            "outline_followups": followups,
            "current_outline_item_id": current_item_id,
        }

        wrap_up = action.get("kind") == "wrap_up"
        if wrap_up:
            goal_coverage = self._avg_coverage(coverage)
            events.append(
                InterviewCompleted(
                    campaign_id=cmd.campaign_id,
                    actor="agent:interviewer",
                    interview_id=cmd.interview_id,
                    duration_seconds=int(context.get("interview_seconds", 0)),
                    goal_coverage=goal_coverage,
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

        response: dict[str, Any] = {
            "text": interviewer_text,
            "kind": action.get("kind", "ask"),
            "outline_item_id": action.get("outline_item_id"),
            "progress": {
                "question_order": question_order,
                "total_questions": len(outline),
            },
        }
        if wrap_up:
            # The study's configured completion copy — read straight from the
            # spec so the respondent client can show it without a separate
            # round-trip. Empty strings mean "use the client's default copy".
            response["end_message"] = spec_ctx.get("end_message", "") or ""
            response["reward_description"] = spec_ctx.get("reward_description", "") or ""
            response["redirect_url"] = spec_ctx.get("redirect_url", "") or ""

        return AgentResult(events=events, state_delta=state_delta, response=response)

    @classmethod
    def _normalize_action(
        cls,
        action: dict[str, Any],
        *,
        context: dict[str, Any],
        outline: list[dict[str, Any]],
        language: str,
        respondent_text: str,
    ) -> tuple[dict[str, Any], dict[str, float], dict[str, int], str | None]:
        """Make progress deterministic even when the model mislabels a turn.

        The model still decides whether an answer deserves a probe, but it
        cannot skip guide items, exceed ``max_followups``, or report zero
        coverage after traversing the whole guide.
        """

        item_by_id = {
            str(item.get("id")): item
            for item in outline
            if item.get("id") is not None
        }
        ordered_ids = [
            str(item.get("id"))
            for item in outline
            if str(item.get("id")) in item_by_id
        ]
        coverage = cls._float_map(context.get("outline_coverage"))
        followups = cls._int_map(context.get("outline_followups"))
        stored_current = str(context.get("current_outline_item_id") or "")
        current_id = stored_current if stored_current in item_by_id else None
        if current_id is None and ordered_ids:
            current_id = ordered_ids[0]
        if current_id is not None:
            coverage.setdefault(current_id, 0.0)
            followups.setdefault(current_id, 0)

        if not ordered_ids:
            return action, coverage, followups, current_id

        if cls._respondent_requested_stop(respondent_text):
            return (
                {
                    "kind": "wrap_up",
                    "text": cls._wrap_up_text(language),
                    "outline_item_id": None,
                },
                coverage,
                followups,
                current_id,
            )

        requested_kind = str(action.get("kind", "ask"))
        requested_id = str(action.get("outline_item_id") or "")
        if requested_id not in item_by_id:
            requested_id = ""

        if requested_kind == "wrap_up":
            if current_id is not None:
                coverage[current_id] = 1.0
            next_id = cls._next_uncovered_id(ordered_ids, current_id, coverage)
            if next_id is None:
                return action, coverage, followups, current_id
            return (
                cls._move_to_item(item_by_id[next_id]),
                coverage,
                followups,
                next_id,
            )

        expected_next = cls._next_uncovered_id(
            ordered_ids,
            current_id,
            coverage,
            only_after_current=True,
        )
        if current_id is not None and requested_id and requested_id != current_id:
            coverage[current_id] = 1.0
            next_id = expected_next
            if next_id is None:
                return (
                    {
                        "kind": "wrap_up",
                        "text": cls._wrap_up_text(language),
                        "outline_item_id": None,
                    },
                    coverage,
                    followups,
                    current_id,
                )
            normalized = (
                action
                if requested_id == next_id
                else cls._move_to_item(item_by_id[next_id])
            )
            normalized = {
                **normalized,
                "kind": "acknowledge_and_move",
                "outline_item_id": next_id,
            }
            coverage.setdefault(next_id, 0.0)
            followups.setdefault(next_id, 0)
            return normalized, coverage, followups, next_id

        if current_id is None:
            current_id = ordered_ids[0]
        current_item = item_by_id[current_id]
        max_followups = cls._nonnegative_int(current_item.get("max_followups"), 0)
        used_followups = followups.get(current_id, 0)
        if used_followups >= max_followups:
            coverage[current_id] = 1.0
            next_id = cls._next_uncovered_id(
                ordered_ids,
                current_id,
                coverage,
                only_after_current=True,
            )
            if next_id is None:
                return (
                    {
                        "kind": "wrap_up",
                        "text": cls._wrap_up_text(language),
                        "outline_item_id": None,
                    },
                    coverage,
                    followups,
                    current_id,
                )
            coverage.setdefault(next_id, 0.0)
            followups.setdefault(next_id, 0)
            return (
                cls._move_to_item(item_by_id[next_id]),
                coverage,
                followups,
                next_id,
            )

        followups[current_id] = used_followups + 1
        coverage[current_id] = max(coverage.get(current_id, 0.0), 0.5)
        return (
            {
                **action,
                "kind": "probe",
                "outline_item_id": current_id,
            },
            coverage,
            followups,
            current_id,
        )

    @staticmethod
    def _move_to_item(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "kind": "acknowledge_and_move",
            "outline_item_id": str(item.get("id")),
            "text": str(item.get("question") or "").strip(),
        }

    @staticmethod
    def _next_uncovered_id(
        ordered_ids: list[str],
        current_id: str | None,
        coverage: dict[str, float],
        *,
        only_after_current: bool = False,
    ) -> str | None:
        try:
            start = ordered_ids.index(current_id) + 1 if current_id else 0
        except ValueError:
            start = 0
        for item_id in ordered_ids[start:]:
            if coverage.get(item_id, 0.0) < 1.0:
                return item_id
        if only_after_current:
            return None
        for item_id in ordered_ids[:start]:
            if coverage.get(item_id, 0.0) < 1.0:
                return item_id
        return None

    @staticmethod
    def _float_map(value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        result: dict[str, float] = {}
        for key, raw in value.items():
            if isinstance(raw, int | float):
                result[str(key)] = min(1.0, max(0.0, float(raw)))
        return result

    @classmethod
    def _int_map(cls, value: Any) -> dict[str, int]:
        if not isinstance(value, dict):
            return {}
        return {
            str(key): cls._nonnegative_int(raw, 0)
            for key, raw in value.items()
            if isinstance(raw, int | float)
        }

    @staticmethod
    def _nonnegative_int(value: Any, default: int) -> int:
        if not isinstance(value, int | float):
            return default
        return max(0, int(value))

    @staticmethod
    def _respondent_requested_stop(text: str) -> bool:
        normalized = text.strip().lower()
        chinese_stop_phrases = (
            "停止访谈",
            "结束访谈",
            "不想继续",
            "退出访谈",
            "到这里吧",
        )
        if any(phrase in normalized for phrase in chinese_stop_phrases):
            return True
        return bool(
            re.fullmatch(
                r"(please\s+)?(stop|quit|end(?:\s+the)?\s+interview)"
                r"(?:\s+now)?[.!]?",
                normalized,
            )
            or "i don't want to continue" in normalized
        )

    @staticmethod
    def _wrap_up_text(language: str) -> str:
        if language.lower().startswith("zh"):
            return "谢谢你分享这些具体反馈，今天的访谈就到这里。"  # noqa: RUF001
        return "Thank you for sharing such specific feedback. That's everything for today."

    @staticmethod
    def _parse_action(text: str) -> dict[str, Any]:
        candidates = [
            *(match.group(1) for match in _ACTION_BLOCK.finditer(text)),
            *(match.group(1) for match in _JSON_FENCE.finditer(text)),
            text.strip(),
        ]
        first_brace = text.find("{")
        if first_brace >= 0:
            candidates.append(text[first_brace:])
        for candidate in candidates:
            try:
                parsed, _ = json.JSONDecoder().raw_decode(candidate.strip())
            except (json.JSONDecodeError, ValueError):
                continue
            if not isinstance(parsed, dict):
                continue
            kind = str(parsed.get("kind", "ask"))
            action_text = parsed.get("text")
            if kind not in _ACTION_KINDS or not isinstance(action_text, str):
                continue
            action_text = action_text.strip()[:INTERVIEWER_ACTION_TEXT_MAX]
            if not action_text or InterviewerAgent._looks_like_protocol(action_text):
                continue
            return {
                "kind": kind,
                "text": action_text,
                "outline_item_id": parsed.get("outline_item_id"),
            }
        return {"kind": "ask"}

    @staticmethod
    def _looks_like_protocol(text: str) -> bool:
        return bool(_PROTOCOL_MARKER.search(text))

    @staticmethod
    def _fallback_question(language: str) -> str:
        return (
            "能再具体说说吗？"  # noqa: RUF001
            if language.lower().startswith("zh")
            else "Could you tell me more?"
        )

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

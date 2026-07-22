"""InterviewerAgent unit tests."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from agents.interviewer import InterviewerAgent
from agents.shared.llm import LLMMessage, LLMResponse, MockLLM
from core.protocols.commands import ReplyInInterview


class RecordingLLM:
    """MockLLM variant that records the last prompt sent."""

    def __init__(self, canned: list[LLMResponse] | None = None) -> None:
        self._canned = canned or []
        self._idx = 0
        self.last_user_msg: str | None = None

    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: Any = None,
        model: str | None = None,
        max_tokens: int = 0,
        temperature: float = 0.0,
    ) -> LLMResponse:
        _ = system, tools, model, max_tokens, temperature
        self.last_user_msg = messages[0].content
        if not self._canned:
            return LLMResponse(text="ok")
        resp = self._canned[min(self._idx, len(self._canned) - 1)]
        self._idx += 1
        return resp

    async def stream(self, **kwargs: Any):  # pragma: no cover - unused here
        raise NotImplementedError


def _reply(text: str) -> ReplyInInterview:
    return ReplyInInterview(
        actor="respondent:x",
        campaign_id=uuid4(),
        interview_id=uuid4(),
        text=text,
    )


async def test_reply_records_respondent_and_interviewer_turns() -> None:
    agent = InterviewerAgent(llm=MockLLM(canned=[LLMResponse(text="Tell me more?")]), max_tokens=800, temperature=0.5)
    r = await agent.run(_reply("I want cheaper pricing"), context={}, harness=None)  # type: ignore[arg-type]
    types = [e.type for e in r.events]
    assert types.count("interview.turn_recorded") == 2


async def test_reply_parses_action_block_and_emits_completed_on_wrap_up() -> None:
    canned = LLMResponse(
        text=(
            "Great, thanks for sharing.\n"
            "<action>{\"kind\": \"wrap_up\", \"text\": \"Thanks!\"}</action>"
        )
    )
    agent = InterviewerAgent(llm=MockLLM(canned=[canned]), max_tokens=800, temperature=0.5)
    r = await agent.run(_reply("done"), context={"outline_coverage": {"q1": 1.0}}, harness=None)  # type: ignore[arg-type]
    types = [e.type for e in r.events]
    assert "interview.completed" in types
    assert r.response["kind"] == "wrap_up"


async def test_wrap_up_response_includes_configured_completion_copy() -> None:
    """T-111: end_message/reward_description/redirect_url ride along on wrap_up."""
    canned = LLMResponse(
        text=(
            "Great, thanks for sharing.\n"
            "<action>{\"kind\": \"wrap_up\", \"text\": \"Thanks!\"}</action>"
        )
    )
    agent = InterviewerAgent(llm=MockLLM(canned=[canned]), max_tokens=800, temperature=0.5)
    r = await agent.run(
        _reply("done"),
        context={
            "spec": {
                "end_message": "You're all set.",
                "reward_description": "$20 gift card",
                "redirect_url": "https://example.com/thanks",
            }
        },
        harness=None,  # type: ignore[arg-type]
    )
    assert r.response["kind"] == "wrap_up"
    assert r.response["end_message"] == "You're all set."
    assert r.response["reward_description"] == "$20 gift card"
    assert r.response["redirect_url"] == "https://example.com/thanks"


async def test_non_wrap_up_response_omits_completion_copy() -> None:
    agent = InterviewerAgent(llm=MockLLM(canned=[LLMResponse(text="Tell me more?")]), max_tokens=800, temperature=0.5)
    r = await agent.run(_reply("hi"), context={"spec": {"end_message": "bye"}}, harness=None)  # type: ignore[arg-type]
    assert "end_message" not in r.response


async def test_reply_falls_back_when_action_block_json_is_broken() -> None:
    canned = LLMResponse(text="Prose then\n<action>{not json}</action>")
    agent = InterviewerAgent(llm=MockLLM(canned=[canned]), max_tokens=800, temperature=0.5)
    r = await agent.run(_reply("hello"), context={}, harness=None)  # type: ignore[arg-type]
    assert r.response["kind"] == "ask"


async def test_run_returns_error_for_unsupported_command() -> None:
    from core.protocols.commands import StartCampaign

    r = await InterviewerAgent(llm=MockLLM(), max_tokens=800, temperature=0.5).run(
        StartCampaign(actor="x", campaign_id=uuid4()),
        {},
        None,  # type: ignore[arg-type]
    )
    assert "error" in r.response


async def test_reply_history_grows_across_context_load() -> None:
    """When context already has 3 prior turns, next respondent turn is order = 4."""
    agent = InterviewerAgent(llm=MockLLM(canned=[LLMResponse(text="ok")]), max_tokens=800, temperature=0.5)
    prior = [
        {"role": "respondent", "text": "hi"},
        {"role": "interviewer", "text": "hello"},
        {"role": "respondent", "text": "..."},
    ]
    r = await agent.run(
        _reply("continuing"),
        context={"interview_history": prior},
        harness=None,  # type: ignore[arg-type]
    )
    respondent_events = [e for e in r.events if e.type == "interview.turn_recorded"]
    assert respondent_events[0].order == 4
    assert respondent_events[1].order == 5


async def test_reply_payload_includes_primary_language_from_spec() -> None:
    llm = RecordingLLM(canned=[LLMResponse(text="ok")])
    agent = InterviewerAgent(llm=llm, max_tokens=800, temperature=0.5)
    await agent.run(
        _reply("你好"),
        context={"spec": {"primary_language": "zh", "outline": {"items": []}}},
        harness=None,  # type: ignore[arg-type]
    )
    payload = json.loads(llm.last_user_msg or "{}")
    assert payload["language"] == "zh"


async def test_reply_payload_defaults_language_to_en_when_spec_missing() -> None:
    llm = RecordingLLM(canned=[LLMResponse(text="ok")])
    agent = InterviewerAgent(llm=llm, max_tokens=800, temperature=0.5)
    await agent.run(_reply("hello"), context={}, harness=None)  # type: ignore[arg-type]
    payload = json.loads(llm.last_user_msg or "{}")
    assert payload["language"] == "en"

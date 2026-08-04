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


async def test_structured_action_text_wins_over_transition_prose() -> None:
    canned = LLMResponse(
        text=(
            "I will follow up on the trust concern.\n"
            "<action>{\"kind\":\"ask\",\"text\":\"Which missing proof mattered most?\"}</action>"
        )
    )
    agent = InterviewerAgent(llm=MockLLM(canned=[canned]), max_tokens=800, temperature=0.5)

    result = await agent.run(_reply("I could not verify the claims."), context={}, harness=None)  # type: ignore[arg-type]

    assert result.response["text"] == "Which missing proof mattered most?"


async def test_bare_json_action_never_leaks_protocol_to_respondent() -> None:
    item_id = uuid4()
    canned = LLMResponse(
        text=json.dumps(
            {
                "kind": "probe",
                "outline_item_id": str(item_id),
                "text": "What made you continue instead of leaving?",
            }
        )
    )
    agent = InterviewerAgent(llm=MockLLM(canned=[canned]), max_tokens=800, temperature=0.5)

    result = await agent.run(_reply("I nearly left."), context={}, harness=None)  # type: ignore[arg-type]

    assert result.response["kind"] == "probe"
    assert result.response["text"] == "What made you continue instead of leaving?"
    assert "outline_item_id" not in result.response["text"]
    interviewer_event = result.events[1]
    assert interviewer_event.text == "What made you continue instead of leaving?"


async def test_malformed_protocol_uses_language_matched_safe_fallback() -> None:
    canned = LLMResponse(
        text='{"kind":"probe","outline_item_id":"internal-id","text":'
    )
    agent = InterviewerAgent(llm=MockLLM(canned=[canned]), max_tokens=800, temperature=0.5)

    result = await agent.run(
        _reply("继续"),
        context={"spec": {"primary_language": "zh"}},
        harness=None,  # type: ignore[arg-type]
    )

    assert result.response["text"] == "能再具体说说吗？"  # noqa: RUF001
    assert "outline_item_id" not in result.response["text"]


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


async def test_same_outline_item_is_normalized_to_a_counted_probe() -> None:
    item_id = uuid4()
    action = {
        "kind": "ask",
        "outline_item_id": str(item_id),
        "text": "What made that risky?",
    }
    agent = InterviewerAgent(
        llm=MockLLM(canned=[LLMResponse(text=json.dumps(action))]),
        max_tokens=800,
        temperature=0.5,
    )

    result = await agent.run(
        _reply("The summary changed a decision."),
        context={
            "spec": {
                "outline": {
                    "items": [
                        {
                            "id": str(item_id),
                            "order": 1,
                            "question": "What went wrong?",
                            "goal": "Find the failure.",
                            "max_followups": 2,
                        }
                    ]
                }
            },
            "current_outline_item_id": str(item_id),
        },
        harness=None,  # type: ignore[arg-type]
    )

    assert result.response["kind"] == "probe"
    assert result.response["progress"]["question_order"] == 1
    assert result.state_delta["outline_followups"][str(item_id)] == 1
    assert result.state_delta["outline_coverage"][str(item_id)] == 0.5


async def test_moving_forward_marks_previous_item_covered() -> None:
    first_id = uuid4()
    second_id = uuid4()
    action = {
        "kind": "ask",
        "outline_item_id": str(second_id),
        "text": "Who needs to approve it?",
    }
    agent = InterviewerAgent(
        llm=MockLLM(canned=[LLMResponse(text=json.dumps(action))]),
        max_tokens=800,
        temperature=0.5,
    )

    result = await agent.run(
        _reply("That is enough detail."),
        context={
            "spec": {
                "outline": {
                    "items": [
                        {
                            "id": str(first_id),
                            "order": 1,
                            "question": "What happened?",
                            "goal": "Find the event.",
                            "max_followups": 2,
                        },
                        {
                            "id": str(second_id),
                            "order": 2,
                            "question": "Who needs to approve it?",
                            "goal": "Find the owner.",
                            "max_followups": 1,
                        },
                    ]
                }
            },
            "current_outline_item_id": str(first_id),
        },
        harness=None,  # type: ignore[arg-type]
    )

    assert result.response["kind"] == "acknowledge_and_move"
    assert result.response["progress"]["question_order"] == 2
    assert result.state_delta["outline_coverage"][str(first_id)] == 1.0
    assert result.state_delta["current_outline_item_id"] == str(second_id)


async def test_followup_budget_forces_the_next_guide_item() -> None:
    first_id = uuid4()
    second_id = uuid4()
    action = {
        "kind": "probe",
        "outline_item_id": str(first_id),
        "text": "A third follow-up that must not be shown?",
    }
    agent = InterviewerAgent(
        llm=MockLLM(canned=[LLMResponse(text=json.dumps(action))]),
        max_tokens=800,
        temperature=0.5,
    )

    result = await agent.run(
        _reply("I already answered twice."),
        context={
            "spec": {
                "outline": {
                    "items": [
                        {
                            "id": str(first_id),
                            "order": 1,
                            "question": "What happened?",
                            "goal": "Find the event.",
                            "max_followups": 2,
                        },
                        {
                            "id": str(second_id),
                            "order": 2,
                            "question": "What should change?",
                            "goal": "Find the fix.",
                            "max_followups": 1,
                        },
                    ]
                }
            },
            "current_outline_item_id": str(first_id),
            "outline_followups": {str(first_id): 2},
        },
        harness=None,  # type: ignore[arg-type]
    )

    assert result.response["kind"] == "acknowledge_and_move"
    assert result.response["text"] == "What should change?"
    assert result.response["progress"]["question_order"] == 2


async def test_wrap_up_after_final_item_records_full_coverage() -> None:
    first_id = uuid4()
    second_id = uuid4()
    action = {"kind": "wrap_up", "text": "Thank you."}
    agent = InterviewerAgent(
        llm=MockLLM(canned=[LLMResponse(text=json.dumps(action))]),
        max_tokens=800,
        temperature=0.5,
    )

    result = await agent.run(
        _reply("That is my final answer."),
        context={
            "spec": {
                "outline": {
                    "items": [
                        {
                            "id": str(first_id),
                            "order": 1,
                            "question": "What happened?",
                            "goal": "Find the event.",
                            "max_followups": 1,
                        },
                        {
                            "id": str(second_id),
                            "order": 2,
                            "question": "Anything else?",
                            "goal": "Find missing context.",
                            "max_followups": 1,
                        },
                    ]
                }
            },
            "current_outline_item_id": str(second_id),
            "outline_coverage": {str(first_id): 1.0, str(second_id): 0.5},
        },
        harness=None,  # type: ignore[arg-type]
    )

    completed = [event for event in result.events if event.type == "interview.completed"]
    assert result.response["kind"] == "wrap_up"
    assert len(completed) == 1
    assert completed[0].goal_coverage == 1.0


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

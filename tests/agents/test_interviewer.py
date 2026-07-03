"""InterviewerAgent unit tests."""

from __future__ import annotations

from uuid import uuid4

from agents.interviewer import InterviewerAgent
from agents.shared.llm import LLMResponse, MockLLM
from core.protocols.commands import ReplyInInterview


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

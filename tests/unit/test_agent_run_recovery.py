from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from interfaces.rest_api.routers.agent import _rebuild_conversation
from storage.agent_runs import AgentRun, AgentRunEvent


def _run() -> AgentRun:
    now = datetime.now(UTC)
    return AgentRun(
        id=uuid4(),
        org_id=uuid4(),
        author_id=uuid4(),
        status="running",
        messages=[{"role": "user", "content": "create and check"}],
        error=None,
        created_at=now,
        updated_at=now,
    )


def _event(run: AgentRun, seq: int, payload: dict) -> AgentRunEvent:
    return AgentRunEvent(
        run_id=run.id,
        seq=seq,
        payload=payload,
        created_at=datetime.now(UTC),
    )


def test_rebuild_pairs_persisted_tool_call_and_result() -> None:
    run = _run()
    convo, uncertain = _rebuild_conversation(
        run,
        [
            _event(
                run,
                1,
                {
                    "type": "tool_call",
                    "tool_use_id": "call-1",
                    "name": "create_campaign",
                    "args": {"title": "T"},
                },
            ),
            _event(
                run,
                2,
                {
                    "type": "tool_result",
                    "tool_use_id": "call-1",
                    "name": "create_campaign",
                    "result": {"campaign_id": "c1"},
                },
            ),
        ],
    )

    assert not uncertain
    assert convo[-2].content[0]["id"] == "call-1"
    assert convo[-1].content[0]["tool_use_id"] == "call-1"


def test_rebuild_flags_unobserved_side_effect_as_uncertain() -> None:
    run = _run()
    _, uncertain = _rebuild_conversation(
        run,
        [
            _event(
                run,
                1,
                {
                    "type": "tool_call",
                    "tool_use_id": "call-1",
                    "name": "push_insights",
                    "args": {},
                },
            )
        ],
    )

    assert uncertain

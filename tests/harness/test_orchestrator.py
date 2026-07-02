"""Harness orchestrator integration tests.

Wires: InMemoryEventStore + InMemoryMemory + IntentRouter + PolicyStack + fake agents.
Verifies end-to-end command flow, policy gating, follow-up chaining, memory updates."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

import pytest

from core.protocols.commands import CreateCampaign, ReplyInInterview
from core.protocols.mcp_tools import ChannelKind
from harness import (
    AgentResult,
    BudgetPolicy,
    Harness,
    HarnessResponse,
    InMemoryMemory,
    IntentRouter,
    PIIPolicy,
    PolicyStack,
)
from storage.event_store.memory import InMemoryEventStore


@dataclass
class _RecordingAgent:
    """Test agent: records calls, emits pre-configured result."""

    name: str
    result: AgentResult = field(default_factory=AgentResult)
    calls: list[tuple[Any, dict[str, Any]]] = field(default_factory=list)

    async def run(self, command: Any, context: dict[str, Any], harness: Harness) -> AgentResult:
        self.calls.append((command, dict(context)))
        return self.result


def _make_harness(
    *,
    designer: _RecordingAgent | None = None,
    interviewer: _RecordingAgent | None = None,
    coordinator: _RecordingAgent | None = None,
    policies: list[Any] | None = None,
) -> tuple[Harness, InMemoryEventStore, InMemoryMemory]:
    store = InMemoryEventStore()
    memory = InMemoryMemory()
    agents = {
        "designer": designer or _RecordingAgent("designer"),
        "interviewer": interviewer or _RecordingAgent("interviewer"),
        "coordinator": coordinator or _RecordingAgent("coordinator"),
    }
    h = Harness(
        event_store=store,
        memory=memory,
        router=IntentRouter(),
        policies=PolicyStack(policies or []),
        agents=agents,
    )
    return h, store, memory


def _create_cmd(cid: UUID | None = None) -> CreateCampaign:
    return CreateCampaign(
        actor="user:t",
        campaign_id=cid,
        org_id=uuid4(),
        author_id=uuid4(),
        title="T",
        goal="G",
        channels=[ChannelKind.WEB_TEXT],
    )


def _reply_cmd(cid: UUID) -> ReplyInInterview:
    return ReplyInInterview(
        actor="respondent:x",
        campaign_id=cid,
        interview_id=uuid4(),
        text="hello",
    )


async def test_handle_routes_to_designer_and_returns_response() -> None:
    designer = _RecordingAgent("designer", result=AgentResult(response={"ok": True}))
    h, store, _ = _make_harness(designer=designer)
    resp = await h.handle(_create_cmd())
    assert isinstance(resp, HarnessResponse)
    assert resp.ok
    assert resp.result == {"ok": True}
    assert len(designer.calls) == 1
    assert store._events == []


async def test_handle_persists_events_returned_by_agent() -> None:
    cid = uuid4()
    from core.events import RespondentJoined

    fake_event = RespondentJoined(
        campaign_id=cid,
        actor="test",
        interview_id=uuid4(),
        respondent_id=uuid4(),
        channel="web_text",
    )
    designer = _RecordingAgent("designer", result=AgentResult(events=[fake_event]))
    h, store, _ = _make_harness(designer=designer)
    resp = await h.handle(_create_cmd(cid=cid))
    assert resp.ok
    assert resp.events_written == 1
    assert len(store._events) == 1


async def test_handle_updates_campaign_memory_from_state_delta() -> None:
    cid = uuid4()
    designer = _RecordingAgent(
        "designer",
        result=AgentResult(state_delta={"themes": ["pricing"], "spent_usd": 5.0}),
    )
    h, _, mem = _make_harness(designer=designer)
    await h.handle(_create_cmd(cid=cid))
    loaded = await mem.load(cid)
    assert loaded == {"themes": ["pricing"], "spent_usd": 5.0}


async def test_handle_skips_memory_update_when_no_campaign_id() -> None:
    designer = _RecordingAgent("designer", result=AgentResult(state_delta={"x": 1}))
    h, _, mem = _make_harness(designer=designer)
    await h.handle(_create_cmd(cid=None))
    assert mem._data == {}  # type: ignore[attr-defined]


async def test_handle_loads_context_from_memory_and_passes_to_agent() -> None:
    cid = uuid4()
    designer = _RecordingAgent("designer")
    h, _, mem = _make_harness(designer=designer)
    await mem.update(cid, {"spent_usd": 42.0, "budget_usd": 100.0})
    await h.handle(_create_cmd(cid=cid))
    assert designer.calls[0][1] == {"spent_usd": 42.0, "budget_usd": 100.0}


async def test_handle_returns_error_when_policy_denies() -> None:
    cid = uuid4()
    h, _, mem = _make_harness(policies=[BudgetPolicy()])
    await mem.update(cid, {"spent_usd": 100.0, "budget_usd": 100.0})
    resp = await h.handle(_create_cmd(cid=cid))
    assert not resp.ok
    assert "budget" in resp.reason


async def test_handle_returns_error_when_no_agent_registered_for_route() -> None:
    from core.protocols.commands import DispatchInvites, InviteInput

    h, _, _ = _make_harness()
    cmd = DispatchInvites(
        actor="user:t",
        campaign_id=uuid4(),
        invites=[InviteInput(address="a@b.co", channel=ChannelKind.EMAIL)],
    )
    resp = await h.handle(cmd)
    assert not resp.ok
    assert "no agent" in resp.reason


async def test_handle_chains_follow_up_commands() -> None:
    """Designer emits a follow-up that routes to interviewer."""
    cid = uuid4()
    followup = _reply_cmd(cid)
    designer = _RecordingAgent(
        "designer",
        result=AgentResult(follow_up_commands=[followup]),
    )
    interviewer = _RecordingAgent("interviewer", result=AgentResult(response="ok"))
    h, _, _ = _make_harness(designer=designer, interviewer=interviewer)
    resp = await h.handle(_create_cmd(cid=cid))
    assert resp.ok
    assert len(interviewer.calls) == 1
    assert interviewer.calls[0][0] is followup


async def test_dispatch_alias_delegates_to_handle() -> None:
    designer = _RecordingAgent("designer", result=AgentResult(response="d"))
    h, _, _ = _make_harness(designer=designer)
    resp = await h.dispatch(_create_cmd())
    assert resp.ok
    assert resp.result == "d"


async def test_handle_pii_policy_records_event_before_agent_runs() -> None:
    """PII redacts email in a reply → event persisted → agent still runs."""
    cid = uuid4()
    interviewer = _RecordingAgent("interviewer", result=AgentResult(response="ack"))
    h, store, _ = _make_harness(interviewer=interviewer, policies=[PIIPolicy()])
    reply = ReplyInInterview(
        actor="respondent:x",
        campaign_id=cid,
        interview_id=uuid4(),
        text="my email is user@example.com",
    )
    resp = await h.handle(reply)
    assert resp.ok
    assert any(e.event.type == "policy.pii_redacted" for e in store._events)
    assert "[email]" in reply.text


async def test_handle_hard_budget_block_still_writes_warn_event() -> None:
    cid = uuid4()
    h, store, mem = _make_harness(policies=[BudgetPolicy(warn_ratio=0.5)])
    await mem.update(cid, {"spent_usd": 100.0, "budget_usd": 100.0})
    resp = await h.handle(_create_cmd(cid=cid))
    assert not resp.ok
    assert any(e.event.type == "policy.budget_crossed" for e in store._events)


@pytest.mark.parametrize("agent_response", [None, {}, [1, 2, 3], "raw string"])
async def test_handle_passes_through_any_agent_response_shape(agent_response: Any) -> None:
    designer = _RecordingAgent("designer", result=AgentResult(response=agent_response))
    h, _, _ = _make_harness(designer=designer)
    resp = await h.handle(_create_cmd())
    assert resp.ok
    assert resp.result == agent_response

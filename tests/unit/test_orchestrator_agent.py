"""Unit tests for the OrchestratorAgent tool-calling loop.

Uses MockLLM with canned responses (each complete() returns the next one), so
the whole loop is exercised with zero API cost. Fake tool handlers record how
they were called and return canned results.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import uuid4

import pytest

from agents.orchestrator import OrchestratorAgent
from agents.shared.llm import LLMMessage, LLMResponse, LLMToolCall, MockLLM
from core.events import NotificationSent
from storage.agent_runs import InMemoryAgentRunStore
from storage.event_store.memory import InMemoryEventStore


def _make_agent_with_llm(llm: Any, handlers: dict[str, Any]) -> OrchestratorAgent:
    return OrchestratorAgent(
        llm=llm,
        tool_handlers=handlers,
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        org_id=uuid4(),
        author_id=uuid4(),
        public_base_url="https://x.test",
    )


def _make_agent(canned: list[LLMResponse], handlers: dict[str, Any]) -> OrchestratorAgent:
    return _make_agent_with_llm(MockLLM(canned=canned), handlers)


async def _collect(agent: OrchestratorAgent, text: str) -> list[dict[str, Any]]:
    return [ev async for ev in agent.chat([LLMMessage(role="user", content=text)])]


@pytest.mark.asyncio
async def test_single_tool_then_final_answer() -> None:
    calls: list[dict[str, Any]] = []

    async def create_campaign(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        calls.append(args)
        return {"campaign_id": "c1", "share_url": "https://x.test/r/c1", "status": "draft"}

    canned = [
        # Round 1: model asks to call the tool.
        LLMResponse(tool_calls=[LLMToolCall(name="create_campaign", arguments={"title": "T"})]),
        # Round 2: model produces a final answer (no tools).
        LLMResponse(text="Created your study — here's the link."),
    ]
    agent = _make_agent(canned, {"create_campaign": create_campaign})

    events = await _collect(agent, "start a study about onboarding")

    kinds = [e["type"] for e in events]
    assert kinds == ["tool_call", "tool_result", "text", "done"]
    assert calls == [{"title": "T"}]
    assert events[1]["result"]["campaign_id"] == "c1"
    assert events[-1]["text"].startswith("Created")


@pytest.mark.asyncio
async def test_multi_tool_chain() -> None:
    order: list[str] = []

    async def create_campaign(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        order.append("create")
        return {"campaign_id": "c1", "status": "draft"}

    async def get_campaign_progress(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        order.append("progress")
        return {"completed": 3}

    canned = [
        LLMResponse(tool_calls=[LLMToolCall(name="create_campaign", arguments={})]),
        LLMResponse(tool_calls=[LLMToolCall(name="get_campaign_progress", arguments={})]),
        LLMResponse(text="Done."),
    ]
    agent = _make_agent(
        canned,
        {"create_campaign": create_campaign, "get_campaign_progress": get_campaign_progress},
    )

    events = await _collect(agent, "create then check progress")

    # create_campaign is read back once by its verifier, then the model's
    # explicit progress request runs in the following round.
    assert order == ["create", "progress", "progress"]
    tool_calls = [e["name"] for e in events if e["type"] == "tool_call"]
    assert tool_calls == ["create_campaign", "get_campaign_progress"]
    assert events[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_no_tools_pure_answer() -> None:
    canned = [LLMResponse(text="Studies help you learn from users.")]
    agent = _make_agent(canned, {})

    events = await _collect(agent, "what is a study?")

    # A single text turn with no tool calls resolves immediately.
    assert [e["type"] for e in events] == ["text", "done"]
    assert events[-1]["text"].startswith("Studies")


@pytest.mark.asyncio
async def test_unknown_tool_is_reported_not_crashed() -> None:
    canned = [
        LLMResponse(tool_calls=[LLMToolCall(name="nonexistent", arguments={})]),
        LLMResponse(text="Sorry, I couldn't do that."),
    ]
    agent = _make_agent(canned, {})

    events = await _collect(agent, "do the impossible")

    kinds = [e["type"] for e in events]
    assert "tool_error" in kinds
    assert events[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_tool_exception_is_surfaced_as_tool_error() -> None:
    async def boom(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        raise RuntimeError("backend exploded")

    canned = [
        LLMResponse(tool_calls=[LLMToolCall(name="create_campaign", arguments={})]),
        LLMResponse(text="That failed."),
    ]
    agent = _make_agent(canned, {"create_campaign": boom})

    events = await _collect(agent, "create a study")

    errs = [e for e in events if e["type"] == "tool_error"]
    assert len(errs) == 1
    assert "backend exploded" in errs[0]["message"]


@pytest.mark.asyncio
async def test_max_turns_ceiling() -> None:
    # A model that always asks for a tool would loop forever without the ceiling.
    async def noop(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"ok": True}

    # MockLLM repeats its last canned response, so this always requests a tool.
    canned = [LLMResponse(tool_calls=[LLMToolCall(name="create_campaign", arguments={})])]
    agent = _make_agent(canned, {"create_campaign": noop})

    events = [
        ev
        async for ev in agent.chat([LLMMessage(role="user", content="loop")], max_turns=3)
    ]

    tool_calls = [e for e in events if e["type"] == "tool_call"]
    assert len(tool_calls) == 3  # exactly the ceiling
    assert events[-1]["type"] == "done"
    assert events[-1]["status"] == "incomplete"
    assert events[-1]["reason"] == "turn_budget_exhausted"


@pytest.mark.asyncio
async def test_tool_budget_gets_one_tool_free_synthesis_turn() -> None:
    calls: list[list[dict[str, Any]] | None] = []

    class BudgetAwareLLM:
        async def complete(self, **kwargs: Any) -> LLMResponse:
            calls.append(kwargs.get("tools"))
            if kwargs.get("tools") is None:
                return LLMResponse(text="Here are the three verified findings.")
            return LLMResponse(
                tool_calls=[LLMToolCall(name="get_campaign_insights", arguments={})]
            )

    async def insights(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"items": [{"title": "Verified"}]}

    agent = _make_agent_with_llm(
        BudgetAwareLLM(),
        {"get_campaign_insights": insights},
    )
    events = [
        event
        async for event in agent.chat(
            [LLMMessage(role="user", content="summarize the evidence")],
            max_turns=2,
        )
    ]

    assert len([event for event in events if event["type"] == "tool_call"]) == 2
    assert calls[-1] is None
    assert events[-1]["status"] == "completed"
    assert events[-1]["reason"] == "tool_budget_synthesized"
    assert events[-1]["text"] == "Here are the three verified findings."


@pytest.mark.asyncio
async def test_same_turn_tools_run_concurrently() -> None:
    both_started = asyncio.Event()
    started = 0

    async def independent(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        nonlocal started
        started += 1
        if started == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=0.2)
        return {"name": args["name"]}

    canned = [
        LLMResponse(
            tool_calls=[
                LLMToolCall(name="one", arguments={"name": "one"}),
                LLMToolCall(name="two", arguments={"name": "two"}),
            ]
        ),
        LLMResponse(text="Done."),
    ]
    events = await _collect(
        _make_agent(canned, {"one": independent, "two": independent}),
        "run both",
    )

    assert [event["type"] for event in events] == [
        "tool_call",
        "tool_call",
        "tool_result",
        "tool_result",
        "text",
        "done",
    ]


@pytest.mark.asyncio
async def test_tool_is_disabled_after_three_consecutive_failures() -> None:
    attempts = 0

    async def always_fails(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        nonlocal attempts
        attempts += 1
        raise RuntimeError("still broken")

    repeating = LLMResponse(
        tool_calls=[LLMToolCall(name="create_campaign", arguments={})]
    )
    agent = _make_agent([repeating], {"create_campaign": always_fails})
    events = [
        event
        async for event in agent.chat(
            [LLMMessage(role="user", content="keep retrying")],
            max_turns=5,
        )
    ]

    assert attempts == 3
    errors = [event for event in events if event["type"] == "tool_error"]
    assert [event["failure_count"] for event in errors] == [1, 2, 3, 4, 5]
    assert "disabled for this run" in errors[-1]["message"]


@pytest.mark.asyncio
async def test_tool_call_and_result_keep_native_pairing() -> None:
    class RecordingLLM(MockLLM):
        def __init__(self) -> None:
            super().__init__(
                canned=[
                    LLMResponse(
                        tool_calls=[
                            LLMToolCall(
                                id="provider-call-1",
                                name="create_campaign",
                                arguments={"title": "T"},
                            )
                        ]
                    ),
                    LLMResponse(text="Done."),
                ]
            )
            self.batches: list[list[LLMMessage]] = []

        async def complete(self, **kwargs: Any) -> LLMResponse:
            self.batches.append(list(kwargs["messages"]))
            return await super().complete(**kwargs)

    async def create(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"campaign_id": "c1"}

    llm = RecordingLLM()
    await _collect(
        _make_agent_with_llm(llm, {"create_campaign": create}),
        "create a study",
    )

    second_round = llm.batches[1]
    assistant = second_round[-2]
    result = second_round[-1]
    assert assistant.content == [
        {
            "type": "tool_use",
            "id": "provider-call-1",
            "name": "create_campaign",
            "input": {"title": "T"},
        }
    ]
    assert result.content == [
        {
            "type": "tool_result",
            "tool_use_id": "provider-call-1",
            "content": '{"campaign_id":"c1"}',
        }
    ]


@pytest.mark.asyncio
async def test_update_plan_is_validated_emitted_and_pinned() -> None:
    class RecordingLLM(MockLLM):
        def __init__(self) -> None:
            super().__init__(
                canned=[
                    LLMResponse(
                        tool_calls=[
                            LLMToolCall(
                                name="update_plan",
                                arguments={
                                    "items": [
                                        {"step": "Create", "status": "doing"},
                                        {"step": "Verify", "status": "pending"},
                                        {"step": "Report", "status": "pending"},
                                    ]
                                },
                            )
                        ]
                    ),
                    LLMResponse(text="Plan ready."),
                ]
            )
            self.batches: list[list[LLMMessage]] = []

        async def complete(self, **kwargs: Any) -> LLMResponse:
            self.batches.append(list(kwargs["messages"]))
            return await super().complete(**kwargs)

    llm = RecordingLLM()
    events = await _collect(_make_agent_with_llm(llm, {}), "do three things")

    plan_events = [event for event in events if event["type"] == "plan_update"]
    assert plan_events[0]["items"][0] == {"step": "Create", "status": "doing"}
    pinned = llm.batches[1][-1]
    assert isinstance(pinned.content, str)
    assert "current execution plan" in pinned.content
    assert '"step": "Verify"' in pinned.content


@pytest.mark.asyncio
async def test_create_campaign_is_verified_by_read_back() -> None:
    async def create(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"campaign_id": "c1", "status": "draft"}

    async def progress(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"campaign_id": args["campaign_id"], "status": "draft", "completed": 0}

    agent = _make_agent(
        [
            LLMResponse(
                tool_calls=[LLMToolCall(name="create_campaign", arguments={"title": "T"})]
            ),
            LLMResponse(text="Created and verified."),
        ],
        {"create_campaign": create, "get_campaign_progress": progress},
    )
    events = await _collect(agent, "create")

    verification = [event for event in events if event["type"] == "verification"]
    assert verification == [
        {
            "type": "verification",
            "name": "create_campaign",
            "verified": True,
            "verifier": "get_campaign_progress",
            "observation": {
                "campaign_id": "c1",
                "status": "draft",
                "completed": 0,
            },
        }
    ]


@pytest.mark.asyncio
async def test_large_observation_is_recoverable_from_artifact() -> None:
    org_id = uuid4()
    author_id = uuid4()
    store = InMemoryAgentRunStore()
    run = await store.create(org_id=org_id, author_id=author_id, messages=[])
    agent = OrchestratorAgent(
        llm=MockLLM(),
        tool_handlers={},
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        org_id=org_id,
        author_id=author_id,
        public_base_url="https://x.test",
        artifact_store=store,
        run_id=run.id,
    )

    rendered = await agent._render_for_context(
        "ask_followup",
        {"answer": "begin-" + "x" * 5_000 + "-end"},
    )
    metadata = json.loads(rendered)
    artifact_id = metadata["artifact_ref"].removeprefix("artifact://")
    assert metadata["chars"] > 5_000

    recovered = await agent._execute_tool(
        "read_artifact",
        {"artifact_id": artifact_id, "start": 4_900, "end": 5_200},
        failure_count=0,
    )
    assert recovered.error is None
    assert recovered.result["total_chars"] == metadata["chars"]
    assert recovered.result["content"].endswith('-end"}')


@pytest.mark.asyncio
async def test_compaction_preserves_recent_native_messages() -> None:
    agent = _make_agent_with_llm(
        MockLLM(canned=[LLMResponse(text="Goal G; create c1 failed once; retry pending.")]),
        {},
    )
    recent = [
        LLMMessage(
            role="assistant",
            content=[
                {
                    "type": "tool_use",
                    "id": "call-2",
                    "name": "get_campaign_progress",
                    "input": {"campaign_id": "c1"},
                }
            ],
        ),
        LLMMessage(
            role="user",
            content=[
                {
                    "type": "tool_result",
                    "tool_use_id": "call-2",
                    "content": '{"status":"draft"}',
                }
            ],
        ),
        LLMMessage(role="assistant", content="Checking."),
        LLMMessage(role="user", content="Continue."),
    ]
    original = [
        LLMMessage(role="user", content="Goal G"),
        LLMMessage(role="assistant", content="Old detail"),
        *recent,
    ]

    compacted = await agent._compact_context(original)

    assert compacted is not None
    assert len(compacted) == 5
    assert "compaction summary" in compacted[0].content
    assert compacted[1:] == recent


@pytest.mark.asyncio
async def test_approved_memory_is_redacted_and_loaded_in_next_session() -> None:
    org_id = uuid4()
    author_id = uuid4()
    store = InMemoryAgentRunStore()
    writer = OrchestratorAgent(
        llm=MockLLM(),
        tool_handlers={},
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        org_id=org_id,
        author_id=author_id,
        public_base_url="https://x.test",
        memory_store=store,
    )
    saved = await writer._execute_tool(
        "remember",
        {
            "name": "delivery-default",
            "body": "Use concise briefs; owner is person@example.com",
        },
        failure_count=0,
    )
    assert saved.result["redacted_fields"] == ["email"]
    assert "[email]" in saved.result["body"]

    class RecordingLLM(MockLLM):
        def __init__(self) -> None:
            super().__init__([LLMResponse(text="Loaded.")])
            self.first_messages: list[LLMMessage] = []

        async def complete(self, **kwargs: Any) -> LLMResponse:
            self.first_messages = list(kwargs["messages"])
            return await super().complete(**kwargs)

    llm = RecordingLLM()
    reader = OrchestratorAgent(
        llm=llm,
        tool_handlers={},
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        org_id=org_id,
        author_id=author_id,
        public_base_url="https://x.test",
        memory_store=store,
    )
    await _collect(reader, "follow our normal delivery style")

    memory_message = llm.first_messages[-1]
    assert isinstance(memory_message.content, str)
    assert "delivery-default" in memory_message.content
    assert "person@example.com" not in memory_message.content


@pytest.mark.asyncio
async def test_delegate_returns_only_bounded_subagent_summary() -> None:
    async def progress(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"campaign_id": args["campaign_id"], "completed": 8}

    llm = MockLLM(
        canned=[
            LLMResponse(
                tool_calls=[
                    LLMToolCall(
                        name="delegate",
                        arguments={
                            "task": "Check study c1 and summarize readiness.",
                            "tools": ["get_campaign_progress"],
                        },
                    )
                ]
            ),
            # Independent subagent context.
            LLMResponse(
                tool_calls=[
                    LLMToolCall(
                        name="get_campaign_progress",
                        arguments={"campaign_id": "c1"},
                    )
                ]
            ),
            LLMResponse(text="Study c1 has 8 completions and is ready."),
            # Parent resumes with only the delegate result.
            LLMResponse(text="The delegated check is complete."),
        ]
    )
    events = await _collect(
        _make_agent_with_llm(llm, {"get_campaign_progress": progress}),
        "delegate this check",
    )

    delegate_result = next(
        event["result"]
        for event in events
        if event["type"] == "tool_result" and event["name"] == "delegate"
    )
    assert delegate_result == {
        "status": "completed",
        "summary": "Study c1 has 8 completions and is ready.",
        "tool_steps": 1,
        "tools_used": ["get_campaign_progress"],
    }


@pytest.mark.asyncio
async def test_usage_is_streamed_and_summarized_on_done() -> None:
    agent = _make_agent(
        [
            LLMResponse(
                text="Measured.",
                usage_input_tokens=120,
                usage_output_tokens=30,
            )
        ],
        {},
    )

    events = await _collect(agent, "measure usage")

    usage = next(event for event in events if event["type"] == "usage")
    assert usage["total_input_tokens"] == 120
    assert usage["total_output_tokens"] == 30
    assert usage["llm_latency_ms"] >= 0
    assert events[-1]["usage"]["input_tokens"] == 120


@pytest.mark.asyncio
async def test_push_is_verified_from_durable_delivery_event() -> None:
    campaign_id = uuid4()
    event_store = InMemoryEventStore()
    stored = await event_store.append(
        NotificationSent(
            campaign_id=campaign_id,
            actor="agent:coordinator",
            to="research",
            channel="notion",
            subject="insights pushed",
        )
    )
    agent = OrchestratorAgent(
        llm=MockLLM(),
        tool_handlers={},
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        org_id=uuid4(),
        author_id=uuid4(),
        public_base_url="https://x.test",
        event_store=event_store,
    )

    verification = await agent._verify(
        "push_insights",
        {"campaign_id": str(campaign_id), "destination": "notion"},
        {"delivered": True},
    )

    assert verification == {
        "verified": True,
        "verifier": "event_store_readback",
        "observation": {
            "matching_event_seqs": [stored.seq],
            "destination": "notion",
        },
    }

"""Unit tests for the OrchestratorAgent tool-calling loop.

Uses MockLLM with canned responses (each complete() returns the next one), so
the whole loop is exercised with zero API cost. Fake tool handlers record how
they were called and return canned results.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from agents.orchestrator import OrchestratorAgent
from agents.shared.llm import LLMMessage, LLMResponse, LLMToolCall, MockLLM


def _make_agent(canned: list[LLMResponse], handlers: dict[str, Any]) -> OrchestratorAgent:
    return OrchestratorAgent(
        llm=MockLLM(canned=canned),
        tool_handlers=handlers,
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        org_id=uuid4(),
        author_id=uuid4(),
        public_base_url="https://x.test",
    )


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

    assert order == ["create", "progress"]
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

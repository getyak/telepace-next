"""Integration test for POST /agent/chat SSE.

Builds a minimal FastAPI app around just the agent router, injects a fake
AppState (no Postgres/Redis), and overrides auth. Drives the endpoint with a
MockLLM whose canned tool_calls exercise the create → final-answer path, and
asserts the SSE frame sequence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agents.shared.llm import LLMResponse, LLMToolCall, MockLLM
from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.routers import agent


@dataclass
class _Settings:
    public_base_url: str = "https://x.test"


@dataclass
class _FakeState:
    llm: Any
    harness: Any
    projector: Any
    insight_reader: Any
    followup_service: Any
    settings: _Settings


def _parse_sse(body: str) -> list[dict]:
    import json

    events = []
    for block in body.split("\n\n"):
        line = block.strip()
        if line.startswith("data:"):
            events.append(json.loads(line[len("data:") :].strip()))
    return events


def _make_client(canned: list[LLMResponse], handlers: dict[str, Any]) -> TestClient:
    app = FastAPI()
    app.include_router(agent.router)

    # Patch the tool-handler registry the orchestrator builder reads.
    import interfaces.rest_api.deps as deps

    deps.TOOL_HANDLERS = handlers  # type: ignore[assignment]

    app.state.telepace = _FakeState(
        llm=MockLLM(canned=canned),
        harness=object(),
        projector=object(),
        insight_reader=object(),
        followup_service=object(),
        settings=_Settings(),
    )

    app.dependency_overrides[require_current_user] = lambda: AuthUser(
        id=uuid4(), org_id=uuid4(), email="t@x.test"
    )
    return TestClient(app)


@pytest.fixture(autouse=True)
def _restore_tool_handlers():
    import interfaces.rest_api.deps as deps

    original = deps.TOOL_HANDLERS
    yield
    deps.TOOL_HANDLERS = original


def test_agent_chat_streams_create_then_answer() -> None:
    seen: list[dict] = []

    async def create_campaign(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        seen.append(args)
        return {"campaign_id": "c1", "share_url": "https://x.test/r/c1", "status": "draft"}

    canned = [
        LLMResponse(tool_calls=[LLMToolCall(name="create_campaign", arguments={"title": "T"})]),
        LLMResponse(text="Created — here is your link."),
    ]
    client = _make_client(canned, {"create_campaign": create_campaign})

    resp = client.post(
        "/v1/agent/chat",
        json={"messages": [{"role": "user", "content": "start a study"}]},
    )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(resp.text)
    kinds = [e["type"] for e in events]
    assert kinds == ["tool_call", "tool_result", "text", "done"]
    assert seen == [{"title": "T"}]
    assert events[1]["result"]["campaign_id"] == "c1"


def test_agent_chat_requires_body() -> None:
    client = _make_client([LLMResponse(text="hi")], {})
    resp = client.post("/v1/agent/chat", json={"messages": []})
    assert resp.status_code == 422  # min_length=1 on messages

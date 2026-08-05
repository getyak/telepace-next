"""Integration test for POST /agent/chat SSE.

Builds a minimal FastAPI app around just the agent router, injects a fake
AppState (no Postgres/Redis), and overrides auth. Drives the endpoint with a
MockLLM whose canned tool_calls exercise the create → final-answer path, and
asserts the SSE frame sequence.
"""

from __future__ import annotations

import time
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

    user = AuthUser(id=uuid4(), org_id=uuid4(), email="t@x.test")
    app.dependency_overrides[require_current_user] = lambda: user
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
    assert resp.headers["x-agent-run-id"]
    events = _parse_sse(resp.text)
    kinds = [e["type"] for e in events]
    assert kinds == ["tool_call", "tool_result", "text", "done"]
    assert seen == [{"title": "T"}]
    assert events[1]["result"]["campaign_id"] == "c1"


def test_agent_run_can_be_started_then_replayed() -> None:
    client = _make_client([LLMResponse(text="Finished in background.")], {})

    created = client.post(
        "/v1/agent/runs",
        json={"messages": [{"role": "user", "content": "do durable work"}]},
    )

    assert created.status_code == 202
    run_id = created.json()["run_id"]
    replay = client.get(f"/v1/agent/runs/{run_id}/events")
    events = _parse_sse(replay.text)
    assert [event["type"] for event in events] == ["text", "done"]
    assert [event["seq"] for event in events] == [1, 2]
    assert all(event["run_id"] == run_id for event in events)

    status_response = client.get(f"/v1/agent/runs/{run_id}")
    assert status_response.json() == {
        "run_id": run_id,
        "status": "completed",
        "error": None,
        "messages": [{"role": "user", "content": "do durable work"}],
    }


def test_agent_run_replay_supports_sequence_cursor() -> None:
    client = _make_client([LLMResponse(text="one event plus done")], {})
    created = client.post(
        "/v1/agent/runs",
        json={"messages": [{"role": "user", "content": "run"}]},
    )
    run_id = created.json()["run_id"]

    replay = client.get(f"/v1/agent/runs/{run_id}/events?after=1")

    events = _parse_sse(replay.text)
    assert [event["type"] for event in events] == ["done"]
    assert events[0]["seq"] == 2


def test_outward_action_pauses_until_confirmation() -> None:
    executed = 0

    async def start_campaign(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        nonlocal executed
        executed += 1
        return {"campaign_id": args["campaign_id"], "status": "live"}

    async def get_progress(args: dict[str, Any], **_: Any) -> dict[str, Any]:
        return {"campaign_id": args["campaign_id"], "status": "live"}

    client = _make_client(
        [
            LLMResponse(
                tool_calls=[
                    LLMToolCall(
                        name="start_campaign",
                        arguments={"campaign_id": "00000000-0000-0000-0000-000000000001"},
                    )
                ]
            ),
            LLMResponse(text="Published and verified."),
        ],
        {
            "start_campaign": start_campaign,
            "get_campaign_progress": get_progress,
        },
    )
    with client:
        created = client.post(
            "/v1/agent/runs",
            json={"messages": [{"role": "user", "content": "publish it"}]},
        )
        run_id = created.json()["run_id"]

        confirm_event = None
        for _ in range(100):
            replay = client.get(f"/v1/agent/runs/{run_id}/events?follow=false")
            events = _parse_sse(replay.text)
            confirm_event = next(
                (event for event in events if event["type"] == "confirm_request"),
                None,
            )
            if confirm_event is not None:
                break
            time.sleep(0.01)

        assert confirm_event is not None
        assert executed == 0
        resolved = client.post(
            f"/v1/agent/runs/{run_id}/confirmations/{confirm_event['confirmation_id']}",
            json={"approved": True},
        )
        assert resolved.json()["status"] == "approved"

        completed = client.get(f"/v1/agent/runs/{run_id}/events")
        events = _parse_sse(completed.text)
        assert executed == 1
        assert any(event["type"] == "confirmation_result" for event in events)
        assert any(
            event["type"] == "verification" and event["verified"] for event in events
        )


def test_agent_chat_requires_body() -> None:
    client = _make_client([LLMResponse(text="hi")], {})
    resp = client.post("/v1/agent/chat", json={"messages": []})
    assert resp.status_code == 422  # min_length=1 on messages

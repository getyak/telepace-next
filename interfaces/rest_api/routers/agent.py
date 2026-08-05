"""Conversational agent endpoint: POST /agent/chat (SSE).

The global chat sidebar and any third-party HTTP integration hit this. It runs
the OrchestratorAgent's tool-calling loop and streams its structured events as
Server-Sent Events, mirroring the refine_outline_stream pattern. The caller's
org/author come from the JWT — never a hard-coded tenant.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from agents.shared.llm import LLMMessage
from core.constants import API_VERSION_PREFIX, SSE_HEADERS
from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.deps import build_orchestrator_for, get_state
from storage.agent_runs import AgentRun, AgentRunStore, InMemoryAgentRunStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_VERSION_PREFIX}/agent", tags=["agent"])


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str = Field(description="'user' or 'assistant'")
    content: str


class AgentChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatTurn] = Field(min_length=1)


class AgentRunCreated(BaseModel):
    run_id: UUID
    status: str
    events_url: str


class AgentRunStatus(BaseModel):
    run_id: UUID
    status: str
    error: str | None = None
    messages: list[ChatTurn]


class ConfirmationDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approved: bool


def _sse_pack(payload: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


def _run_store(state: Any) -> AgentRunStore:
    store = getattr(state, "agent_runs", None)
    if store is None:
        # Minimal apps/tests that do not run the production lifespan still get
        # the same disconnect/replay behavior for the life of their process.
        store = InMemoryAgentRunStore()
        state.agent_runs = store
        state.agent_confirmations = store
    return store


def _task_set(state: Any) -> set[asyncio.Task[None]]:
    tasks = getattr(state, "agent_run_tasks", None)
    if tasks is None:
        tasks = set()
        state.agent_run_tasks = tasks
    return tasks


async def _drive_run(
    *,
    run: AgentRun,
    state: Any,
    convo: list[LLMMessage],
) -> None:
    store = _run_store(state)
    orchestrator = build_orchestrator_for(
        state,
        org_id=run.org_id,
        author_id=run.author_id,
        run_id=run.id,
    )
    terminal_status = "completed"
    terminal_error: str | None = None
    cancelled = False
    try:
        async for event in orchestrator.chat(convo):
            await store.append(run.id, event)
            if event.get("type") == "error":
                terminal_status = "failed"
                terminal_error = str(event.get("message", "agent loop failed"))
            elif event.get("status") == "incomplete":
                terminal_status = "incomplete"
    except Exception as exc:
        terminal_status = "failed"
        terminal_error = str(exc)
        logger.exception("agent run failed run_id=%s", run.id)
        await store.append(run.id, {"type": "error", "message": terminal_error})
    except asyncio.CancelledError:
        # Leave the row running so startup recovery can reconstruct it.
        cancelled = True
        raise
    finally:
        if not cancelled:
            await store.finish(run.id, status=terminal_status, error=terminal_error)


def _launch_run(*, run: AgentRun, state: Any, convo: list[LLMMessage]) -> None:
    task = asyncio.create_task(
        _drive_run(run=run, state=state, convo=convo),
        name=f"agent-run-{run.id}",
    )
    tasks = _task_set(state)
    tasks.add(task)

    def _observe_completion(done: asyncio.Task[None]) -> None:
        tasks.discard(done)
        if not done.cancelled() and done.exception() is not None:
            logger.error("unhandled agent run task failure", exc_info=done.exception())

    task.add_done_callback(_observe_completion)


async def _start_run(
    body: AgentChatBody,
    *,
    state: Any,
    user: AuthUser,
) -> AgentRun:
    messages = [turn.model_dump() for turn in body.messages]
    run = await _run_store(state).create(
        org_id=user.org_id,
        author_id=user.id,
        messages=messages,
    )
    convo = [LLMMessage(role=turn.role, content=turn.content) for turn in body.messages]
    _launch_run(run=run, state=state, convo=convo)
    return run


def _rebuild_conversation(
    run: AgentRun,
    events: list[Any],
) -> tuple[list[LLMMessage], bool]:
    """Rebuild native tool blocks; return (messages, has_uncertain_action)."""
    convo = [LLMMessage(role=item["role"], content=item["content"]) for item in run.messages]
    assistant_blocks: list[dict[str, Any]] = []
    result_blocks: list[dict[str, Any]] = []
    pending_ids: set[str] = set()

    def flush_assistant() -> None:
        if assistant_blocks:
            convo.append(LLMMessage(role="assistant", content=list(assistant_blocks)))
            assistant_blocks.clear()

    def flush_results() -> None:
        if result_blocks:
            convo.append(LLMMessage(role="user", content=list(result_blocks)))
            result_blocks.clear()

    for stored in events:
        payload = stored.payload
        kind = payload.get("type")
        if kind == "text":
            flush_results()
            flush_assistant()
            if payload.get("text"):
                assistant_blocks.append({"type": "text", "text": str(payload["text"])})
        elif kind == "tool_call":
            call_id = str(payload.get("tool_use_id") or f"replay_{stored.seq}")
            pending_ids.add(call_id)
            assistant_blocks.append(
                {
                    "type": "tool_use",
                    "id": call_id,
                    "name": str(payload.get("name", "")),
                    "input": payload.get("args") or {},
                }
            )
        elif kind in {"tool_result", "tool_error"}:
            flush_assistant()
            call_id = str(payload.get("tool_use_id") or "")
            if call_id:
                pending_ids.discard(call_id)
            content = (
                json.dumps(payload.get("result"), default=str, separators=(",", ":"))
                if kind == "tool_result"
                else str(payload.get("message", "tool failed"))
            )
            result_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": call_id or f"missing_{stored.seq}",
                    "content": content[:4_000],
                    "is_error": kind == "tool_error",
                }
            )
    flush_assistant()
    flush_results()
    return convo, bool(pending_ids)


async def resume_incomplete_agent_runs(state: Any) -> int:
    """Resume safely reconstructable runs after an API process restart."""
    store = _run_store(state)
    resumed = 0
    for run in await store.list_running():
        events = await store.read_events(run.id)
        convo, uncertain = _rebuild_conversation(run, events)
        if uncertain:
            message = (
                "run stopped after a tool call whose result was not persisted; "
                "automatic retry is unsafe because the side effect may already exist"
            )
            await store.append(
                run.id,
                {
                    "type": "done",
                    "status": "incomplete",
                    "reason": "uncertain_side_effect_after_restart",
                    "text": message,
                },
            )
            await store.finish(run.id, status="incomplete", error=message)
            continue
        _launch_run(run=run, state=state, convo=convo)
        resumed += 1
    return resumed


async def _owned_run(store: AgentRunStore, run_id: UUID, user: AuthUser) -> AgentRun:
    run = await store.get(run_id)
    if run is None or run.org_id != user.org_id or run.author_id != user.id:
        # Deliberately do not reveal whether another tenant owns this id.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent run not found")
    return run


async def _stream_run(
    *,
    request: Request,
    store: AgentRunStore,
    run_id: UUID,
    after: int,
    follow: bool,
) -> AsyncIterator[bytes]:
    cursor = after
    while True:
        events = await store.read_events(run_id, after=cursor)
        for event in events:
            cursor = event.seq
            yield _sse_pack(
                {
                    **event.payload,
                    "run_id": str(run_id),
                    "seq": event.seq,
                }
            )
        run = await store.get(run_id)
        if run is None or run.status != "running" or not follow:
            return
        if await request.is_disconnected():
            return
        await asyncio.sleep(0.1)


@router.post("/runs", response_model=AgentRunCreated, status_code=status.HTTP_202_ACCEPTED)
async def create_agent_run(
    body: AgentChatBody,
    request: Request,
    user: AuthUser = Depends(require_current_user),
) -> AgentRunCreated:
    state = get_state(request)
    run = await _start_run(body, state=state, user=user)
    return AgentRunCreated(
        run_id=run.id,
        status=run.status,
        events_url=f"{API_VERSION_PREFIX}/agent/runs/{run.id}/events",
    )


@router.get("/runs/{run_id}", response_model=AgentRunStatus)
async def get_agent_run(
    run_id: UUID,
    request: Request,
    user: AuthUser = Depends(require_current_user),
) -> AgentRunStatus:
    run = await _owned_run(_run_store(get_state(request)), run_id, user)
    return AgentRunStatus(
        run_id=run.id,
        status=run.status,
        error=run.error,
        messages=[ChatTurn.model_validate(message) for message in run.messages],
    )


@router.get("/runs/{run_id}/events")
async def get_agent_run_events(
    run_id: UUID,
    request: Request,
    after: int = Query(default=0, ge=0),
    follow: bool = Query(default=True),
    user: AuthUser = Depends(require_current_user),
) -> StreamingResponse:
    store = _run_store(get_state(request))
    await _owned_run(store, run_id, user)
    return StreamingResponse(
        _stream_run(
            request=request,
            store=store,
            run_id=run_id,
            after=after,
            follow=follow,
        ),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.post("/runs/{run_id}/confirmations/{confirmation_id}")
async def resolve_agent_run_confirmation(
    run_id: UUID,
    confirmation_id: UUID,
    body: ConfirmationDecision,
    request: Request,
    user: AuthUser = Depends(require_current_user),
) -> dict[str, Any]:
    state = get_state(request)
    run_store = _run_store(state)
    await _owned_run(run_store, run_id, user)
    confirmation_store = getattr(state, "agent_confirmations", run_store)
    confirmation = await confirmation_store.get_confirmation(
        confirmation_id,
        org_id=user.org_id,
    )
    if confirmation is None or confirmation.run_id != run_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="confirmation not found",
        )
    resolved = await confirmation_store.resolve_confirmation(
        confirmation_id,
        org_id=user.org_id,
        approved=body.approved,
    )
    assert resolved is not None
    return {
        "confirmation_id": str(resolved.id),
        "run_id": str(resolved.run_id),
        "status": resolved.status,
    }


@router.post("/chat")
async def agent_chat(
    body: AgentChatBody,
    request: Request,
    user: AuthUser = Depends(require_current_user),
) -> StreamingResponse:
    state = get_state(request)
    store = _run_store(state)
    run = await _start_run(body, state=state, user=user)

    return StreamingResponse(
        _stream_run(
            request=request,
            store=store,
            run_id=run.id,
            after=0,
            follow=True,
        ),
        media_type="text/event-stream",
        headers={**SSE_HEADERS, "X-Agent-Run-Id": str(run.id)},
    )

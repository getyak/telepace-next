"""Conversational agent endpoint: POST /agent/chat (SSE).

The global chat sidebar and any third-party HTTP integration hit this. It runs
the OrchestratorAgent's tool-calling loop and streams its structured events as
Server-Sent Events, mirroring the refine_outline_stream pattern. The caller's
org/author come from the JWT — never a hard-coded tenant.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from agents.shared.llm import LLMMessage
from core.constants import API_VERSION_PREFIX, SSE_HEADERS
from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.deps import build_orchestrator_for, get_state

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_VERSION_PREFIX}/agent", tags=["agent"])


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str = Field(description="'user' or 'assistant'")
    content: str


class AgentChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatTurn] = Field(min_length=1)


def _sse_pack(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


@router.post("/chat")
async def agent_chat(
    body: AgentChatBody,
    request: Request,
    user: AuthUser = Depends(require_current_user),
) -> StreamingResponse:
    state = get_state(request)
    orchestrator = build_orchestrator_for(state, org_id=user.org_id, author_id=user.id)
    convo = [LLMMessage(role=t.role, content=t.content) for t in body.messages]

    async def event_gen():
        try:
            async for event in orchestrator.chat(convo):
                if await request.is_disconnected():
                    return
                yield _sse_pack(event)
        except Exception as exc:
            logger.exception("agent chat stream failed")
            yield _sse_pack({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )

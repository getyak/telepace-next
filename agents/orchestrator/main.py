"""OrchestratorAgent: a conversational agent over the telepace MCP tool surface.

Turns a natural-language conversation into a sequence of tool calls against the
existing MCP tool handlers (which themselves go through the Harness). This is the
shared brain behind the global chat sidebar (REST /agent/chat) and any future
HTTP-driven third-party integration — the MCP stdio server already exposes the
same tools directly.

The tool *schemas* are reused verbatim from MCP_TOOL_REGISTRY and the tool
*execution* is reused verbatim from TOOL_HANDLERS, so there is exactly one
definition of "what a tool is and does" in the codebase.

chat() is an async generator of structured events so the REST layer can stream
them straight out as SSE:

    {"type": "text", "text": ...}            # assistant prose (may repeat)
    {"type": "tool_call", "name", "args"}    # about to run a tool
    {"type": "tool_result", "name", "result"}# tool returned
    {"type": "tool_error", "name", "message"}# tool raised
    {"type": "done", "text": ...}            # final assistant turn
    {"type": "error", "message": ...}        # loop-level failure
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from agents.shared import load_prompt
from agents.shared.llm import LLMClient, LLMMessage
from core.constants import DEFAULT_LLM_MAX_TOKENS
from core.protocols.mcp_tools import MCP_TOOL_REGISTRY

# A hard ceiling on tool-call rounds so a confused model can't loop forever.
# Each round is one LLM call; 6 comfortably covers create → progress → insights
# → push chains while bounding cost and latency.
_DEFAULT_MAX_TURNS = 6


def _tool_specs() -> list[dict[str, Any]]:
    """Anthropic-style tool schemas built from the MCP registry. The LLM clients
    translate this shape to OpenAI/OpenRouter automatically."""
    return [
        {
            "name": name,
            "description": desc,
            "input_schema": input_cls.model_json_schema(),
        }
        for name, (input_cls, _out_cls, desc) in MCP_TOOL_REGISTRY.items()
    ]


class OrchestratorAgent:
    def __init__(
        self,
        *,
        llm: LLMClient,
        tool_handlers: dict[str, Any],
        harness: Any,
        projector: Any,
        insight_reader: Any,
        followup_service: Any,
        org_id: UUID,
        author_id: UUID,
        public_base_url: str,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        prompt_version: str = "v1",
    ) -> None:
        self._llm = llm
        self._handlers = tool_handlers
        self._system = load_prompt("orchestrator", prompt_version)
        self._tools = _tool_specs()
        self._max_tokens = max_tokens
        # The fixed dependency bundle every tool handler is called with. Mirrors
        # what the MCP server injects, so a tool behaves identically on either
        # surface.
        self._deps: dict[str, Any] = {
            "harness": harness,
            "projector": projector,
            "insight_reader": insight_reader,
            "followup_service": followup_service,
            "org_id": org_id,
            "author_id": author_id,
            "public_base_url": public_base_url,
        }

    async def chat(
        self,
        messages: list[LLMMessage],
        *,
        max_turns: int = _DEFAULT_MAX_TURNS,
    ) -> AsyncIterator[dict[str, Any]]:
        """Drive the tool-calling loop, yielding structured events."""
        convo = list(messages)

        for _ in range(max_turns):
            try:
                resp = await self._llm.complete(
                    system=self._system,
                    messages=convo,
                    tools=self._tools,
                    max_tokens=self._max_tokens,
                )
            except Exception as exc:
                yield {"type": "error", "message": f"llm call failed: {exc}"}
                return

            if resp.text:
                yield {"type": "text", "text": resp.text}

            calls = resp.tool_calls or []
            if not calls:
                # No tools requested → this is the final assistant turn.
                yield {"type": "done", "text": resp.text or ""}
                return

            # Record the assistant's tool-call turn, then execute each call and
            # feed the results back for the next round.
            convo.append(
                LLMMessage(
                    role="assistant",
                    content=resp.text or _describe_calls(calls),
                )
            )
            for call in calls:
                yield {"type": "tool_call", "name": call.name, "args": call.arguments}
                handler = self._handlers.get(call.name)
                if handler is None:
                    msg = f"unknown tool: {call.name}"
                    yield {"type": "tool_error", "name": call.name, "message": msg}
                    convo.append(LLMMessage(role="user", content=f"[tool {call.name} error] {msg}"))
                    continue
                try:
                    result = await handler(call.arguments, **self._deps)
                except Exception as exc:
                    msg = str(exc)
                    yield {"type": "tool_error", "name": call.name, "message": msg}
                    convo.append(LLMMessage(role="user", content=f"[tool {call.name} error] {msg}"))
                    continue
                yield {"type": "tool_result", "name": call.name, "result": result}
                convo.append(
                    LLMMessage(
                        role="user",
                        content=f"[tool {call.name} result] {json.dumps(result, default=str)}",
                    )
                )

        # Ran out of turns without the model settling on a final answer.
        yield {
            "type": "done",
            "text": "I've done several steps — let me know if you'd like me to continue.",
        }


def _describe_calls(calls: list[Any]) -> str:
    """A compact stand-in for an assistant turn whose only content was tool calls
    (some providers return empty text alongside tool_use)."""
    return "Calling: " + ", ".join(c.name for c in calls)

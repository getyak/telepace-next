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

import asyncio
import hashlib
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

from agents.shared import load_prompt
from agents.shared.llm import LLMClient, LLMMessage
from core.constants import DEFAULT_LLM_MAX_TOKENS
from core.protocols.mcp_tools import MCP_TOOL_REGISTRY
from harness.policies.pii import redact

if TYPE_CHECKING:
    from storage.agent_runs import (
        AgentArtifactStore,
        AgentConfirmationStore,
        AgentMemoryStore,
    )

# A hard ceiling on tool-call rounds so a confused model can't loop forever.
# Each round is one tool-capable LLM call. Eight covers plan → locate study →
# progress → insights → transcript/follow-up chains while still bounding cost.
# A separate tool-free synthesis call runs after this budget if needed.
_DEFAULT_MAX_TURNS = 8
_MAX_CONTEXT_RESULT_CHARS = 4_000
_MAX_CONSECUTIVE_TOOL_FAILURES = 3
_DEFAULT_CONTEXT_COMPACTION_CHARS = 60_000
_RECENT_MESSAGES_AFTER_COMPACTION = 4
_CONFIRMATION_POLL_SECONDS = 0.2
_CONFIRMATION_TIMEOUT_SECONDS = 600
_CONFIRMATION_REQUIRED_TOOLS = {"start_campaign", "dispatch_invites", "push_insights"}


@dataclass(slots=True)
class _ToolOutcome:
    name: str
    result: Any = None
    error: str | None = None
    verification: dict[str, Any] | None = None


_UPDATE_PLAN_TOOL: dict[str, Any] = {
    "name": "update_plan",
    "description": "Create or update the visible execution plan for a multi-step task.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["items"],
        "properties": {
            "items": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["step", "status"],
                    "properties": {
                        "step": {"type": "string", "minLength": 1},
                        "status": {
                            "type": "string",
                            "enum": ["pending", "doing", "done", "skipped"],
                        },
                    },
                },
            }
        },
    },
}

_READ_ARTIFACT_TOOL: dict[str, Any] = {
    "name": "read_artifact",
    "description": "Read a range from a large tool observation saved as an artifact.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["artifact_id"],
        "properties": {
            "artifact_id": {"type": "string", "format": "uuid"},
            "start": {"type": "integer", "minimum": 0, "default": 0},
            "end": {"type": "integer", "minimum": 1, "default": 4000},
        },
    },
}

_REMEMBER_TOOL: dict[str, Any] = {
    "name": "remember",
    "description": (
        "Save an explicitly approved organization preference or reusable project rule. "
        "Never store respondent data, secrets, or inferred personal facts."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["name", "body"],
        "properties": {
            "name": {"type": "string", "minLength": 1, "maxLength": 80},
            "body": {"type": "string", "minLength": 1, "maxLength": 1000},
        },
    },
}

_FORGET_TOOL: dict[str, Any] = {
    "name": "forget",
    "description": "Delete a previously saved organization memory by name.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["name"],
        "properties": {
            "name": {"type": "string", "minLength": 1, "maxLength": 80},
        },
    },
}

_DELEGATE_TOOL: dict[str, Any] = {
    "name": "delegate",
    "description": (
        "Delegate one bounded read-only research subtask to an isolated subagent. "
        "Only the final summary returns to the parent context."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["task", "tools"],
        "properties": {
            "task": {"type": "string", "minLength": 1, "maxLength": 2000},
            "tools": {
                "type": "array",
                "minItems": 1,
                "maxItems": 5,
                "items": {
                    "type": "string",
                    "enum": [
                        "list_campaigns",
                        "get_campaign_progress",
                        "get_campaign_insights",
                        "ask_followup",
                        "read_artifact"
                    ],
                },
            },
        },
    },
}

_DELEGATE_SAFE_TOOLS = {
    "list_campaigns",
    "get_campaign_progress",
    "get_campaign_insights",
    "ask_followup",
    "read_artifact",
}

_VERIFIER_TOOL_BY_ACTION = {
    "create_campaign": "get_campaign_progress",
    "start_campaign": "get_campaign_progress",
}


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
    ] + [
        _UPDATE_PLAN_TOOL,
        _READ_ARTIFACT_TOOL,
        _REMEMBER_TOOL,
        _FORGET_TOOL,
        _DELEGATE_TOOL,
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
        event_store: Any = None,
        max_tokens: int = DEFAULT_LLM_MAX_TOKENS,
        prompt_version: str = "v1",
        artifact_store: AgentArtifactStore | None = None,
        memory_store: AgentMemoryStore | None = None,
        confirmation_store: AgentConfirmationStore | None = None,
        run_id: UUID | None = None,
        compaction_model: str | None = None,
        context_compaction_chars: int = _DEFAULT_CONTEXT_COMPACTION_CHARS,
        allow_delegate: bool = True,
        tool_allowlist: set[str] | None = None,
    ) -> None:
        self._llm = llm
        self._handlers = tool_handlers
        self._system = load_prompt("orchestrator", prompt_version)
        self._tools = _tool_specs()
        if tool_allowlist is not None:
            builtins = {"update_plan", "read_artifact"}
            self._tools = [
                tool
                for tool in self._tools
                if tool["name"] in tool_allowlist | builtins
            ]
        if not allow_delegate:
            self._tools = [tool for tool in self._tools if tool["name"] != "delegate"]
        self._max_tokens = max_tokens
        self._artifact_store = artifact_store
        self._memory_store = memory_store
        self._confirmation_store = confirmation_store
        self._run_id = run_id
        self._compaction_model = compaction_model
        self._context_compaction_chars = context_compaction_chars
        self._allow_delegate = allow_delegate
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
            "event_store": event_store,
        }

    async def chat(
        self,
        messages: list[LLMMessage],
        *,
        max_turns: int = _DEFAULT_MAX_TURNS,
    ) -> AsyncIterator[dict[str, Any]]:
        """Drive the tool-calling loop, yielding structured events."""
        convo = list(messages)
        failure_counts: dict[str, int] = {}
        plan_items: list[dict[str, str]] = []
        run_started = time.perf_counter()
        total_input_tokens = 0
        total_output_tokens = 0
        if self._memory_store is not None:
            memories = await self._memory_store.list_memories(org_id=self._deps["org_id"])
            if memories:
                convo.append(
                    LLMMessage(
                        role="user",
                        content=(
                            "[approved organization memory — preferences/rules, not task results]\n"
                            + json.dumps(
                                [
                                    {"name": memory.name, "body": memory.body}
                                    for memory in memories
                                ],
                                ensure_ascii=False,
                            )
                        ),
                    )
                )

        for turn_index in range(max_turns):
            context_chars = _context_chars(convo)
            if (
                context_chars > self._context_compaction_chars
                and len(convo) > _RECENT_MESSAGES_AFTER_COMPACTION
            ):
                compacted = await self._compact_context(convo)
                if compacted is not None:
                    convo = compacted
                    yield {
                        "type": "compaction",
                        "before_chars": context_chars,
                        "after_chars": _context_chars(convo),
                        "retained_recent_messages": _RECENT_MESSAGES_AFTER_COMPACTION,
                    }
            try:
                model_messages = list(convo)
                if plan_items:
                    model_messages.append(
                        LLMMessage(
                            role="user",
                            content=(
                                "[current execution plan — keep this aligned with the original goal]\n"
                                + json.dumps(plan_items, ensure_ascii=False)
                            ),
                        )
                    )
                llm_started = time.perf_counter()
                resp = await self._llm.complete(
                    system=self._system,
                    messages=model_messages,
                    tools=self._tools,
                    max_tokens=self._max_tokens,
                )
                llm_latency_ms = round((time.perf_counter() - llm_started) * 1000, 1)
                total_input_tokens += resp.usage_input_tokens
                total_output_tokens += resp.usage_output_tokens
            except Exception as exc:
                yield {"type": "error", "message": f"llm call failed: {exc}"}
                return

            if resp.usage_input_tokens or resp.usage_output_tokens:
                yield {
                    "type": "usage",
                    "input_tokens": resp.usage_input_tokens,
                    "output_tokens": resp.usage_output_tokens,
                    "total_input_tokens": total_input_tokens,
                    "total_output_tokens": total_output_tokens,
                    "llm_latency_ms": llm_latency_ms,
                }

            if resp.text:
                yield {"type": "text", "text": resp.text}

            calls = resp.tool_calls or []
            if not calls:
                # No tools requested → this is the final assistant turn.
                yield {
                    "type": "done",
                    "text": resp.text or "",
                    "usage": {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "elapsed_ms": round((time.perf_counter() - run_started) * 1000, 1),
                    },
                }
                return

            # Record the assistant's tool-call turn, then execute each call and
            # feed the results back for the next round.
            call_ids = [
                call.id or f"tool_{turn_index + 1}_{index + 1}"
                for index, call in enumerate(calls)
            ]
            assistant_blocks: list[dict[str, Any]] = []
            if resp.text:
                assistant_blocks.append({"type": "text", "text": resp.text})
            assistant_blocks.extend(
                {
                    "type": "tool_use",
                    "id": call_id,
                    "name": call.name,
                    "input": call.arguments,
                }
                for call_id, call in zip(call_ids, calls, strict=True)
            )
            convo.append(LLMMessage(role="assistant", content=assistant_blocks))

            approved: list[bool] = []
            for call_id, call in zip(call_ids, calls, strict=True):
                allowed = True
                if call.name in _CONFIRMATION_REQUIRED_TOOLS:
                    if self._confirmation_store is None or self._run_id is None:
                        allowed = False
                    else:
                        confirmation = await self._confirmation_store.create_confirmation(
                            run_id=self._run_id,
                            org_id=self._deps["org_id"],
                            tool_name=call.name,
                            arguments=call.arguments,
                        )
                        yield {
                            "type": "confirm_request",
                            "confirmation_id": str(confirmation.id),
                            "tool_use_id": call_id,
                            "name": call.name,
                            "args": call.arguments,
                        }
                        allowed = await self._wait_for_confirmation(confirmation.id)
                        yield {
                            "type": "confirmation_result",
                            "confirmation_id": str(confirmation.id),
                            "tool_use_id": call_id,
                            "name": call.name,
                            "approved": allowed,
                        }
                approved.append(allowed)
                if not allowed:
                    continue
                yield {
                    "type": "tool_call",
                    "tool_use_id": call_id,
                    "name": call.name,
                    "args": call.arguments,
                }

            # Calls emitted in the same assistant turn cannot depend on one
            # another's results, so execute them concurrently. asyncio.gather
            # preserves input ordering for the event stream and prompt.
            outcomes = await asyncio.gather(
                *(
                    self._execute_tool(
                        call.name,
                        call.arguments,
                        failure_count=failure_counts.get(call.name, 0),
                    )
                    if allowed
                    else _immediate_outcome(
                        _ToolOutcome(
                            name=call.name,
                            error="outward-facing action was not approved",
                        )
                    )
                    for call, allowed in zip(calls, approved, strict=True)
                )
            )
            result_blocks: list[dict[str, Any]] = []
            for call_id, outcome in zip(call_ids, outcomes, strict=True):
                if outcome.error is not None:
                    failure_counts[outcome.name] = failure_counts.get(outcome.name, 0) + 1
                    yield {
                        "type": "tool_error",
                        "tool_use_id": call_id,
                        "name": outcome.name,
                        "message": outcome.error,
                        "failure_count": failure_counts[outcome.name],
                    }
                    result_blocks.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": call_id,
                            "content": outcome.error,
                            "is_error": True,
                        }
                    )
                    continue

                failure_counts[outcome.name] = 0
                if outcome.name == "update_plan" and isinstance(outcome.result, dict):
                    raw_items = outcome.result.get("items")
                    if isinstance(raw_items, list):
                        plan_items = raw_items
                        yield {"type": "plan_update", "items": plan_items}
                yield {
                    "type": "tool_result",
                    "tool_use_id": call_id,
                    "name": outcome.name,
                    "result": outcome.result,
                }
                if outcome.verification is not None:
                    yield {
                        "type": "verification",
                        "name": outcome.name,
                        **outcome.verification,
                    }
                result_blocks.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call_id,
                        "content": await self._render_for_context(
                            outcome.name,
                            {
                                "result": outcome.result,
                                "verification": outcome.verification,
                            }
                            if outcome.verification is not None
                            else outcome.result,
                        ),
                    }
                )
            convo.append(LLMMessage(role="user", content=result_blocks))

        # The tool budget is exhausted, but throwing away already-collected
        # evidence is a poor user outcome. Give the model one tool-free turn to
        # synthesize what it has. This cannot create new side effects or loop.
        try:
            final_started = time.perf_counter()
            final = await self._llm.complete(
                system=self._system,
                messages=[
                    *convo,
                    LLMMessage(
                        role="user",
                        content=(
                            "[tool budget reached — answer now using only the verified "
                            "observations above. Be explicit about anything still unverified. "
                            "Do not request another tool.]"
                        ),
                    ),
                ],
                tools=None,
                max_tokens=self._max_tokens,
            )
            final_latency_ms = round((time.perf_counter() - final_started) * 1000, 1)
            total_input_tokens += final.usage_input_tokens
            total_output_tokens += final.usage_output_tokens
            if final.usage_input_tokens or final.usage_output_tokens:
                yield {
                    "type": "usage",
                    "input_tokens": final.usage_input_tokens,
                    "output_tokens": final.usage_output_tokens,
                    "total_input_tokens": total_input_tokens,
                    "total_output_tokens": total_output_tokens,
                    "llm_latency_ms": final_latency_ms,
                }
            if final.text:
                yield {"type": "text", "text": final.text}
                yield {
                    "type": "done",
                    "text": final.text,
                    "status": "completed",
                    "reason": "tool_budget_synthesized",
                    "turns_used": max_turns,
                    "usage": {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "elapsed_ms": round((time.perf_counter() - run_started) * 1000, 1),
                    },
                }
                return
        except Exception:
            # Preserve the existing explicit incomplete result if even the
            # tool-free synthesis call fails.
            pass

        # Ran out of turns and could not obtain a tool-free final answer.
        yield {
            "type": "done",
            "text": (
                "I reached the execution limit before I could verify completion. "
                "The completed tool steps are shown above; this run is incomplete."
            ),
            "status": "incomplete",
            "reason": "turn_budget_exhausted",
            "turns_used": max_turns,
            "usage": {
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "elapsed_ms": round((time.perf_counter() - run_started) * 1000, 1),
            },
        }

    async def _execute_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        *,
        failure_count: int,
    ) -> _ToolOutcome:
        if name == "update_plan":
            try:
                return _ToolOutcome(name=name, result={"items": _normalize_plan(arguments)})
            except ValueError as exc:
                return _ToolOutcome(name=name, error=str(exc))
        if name == "read_artifact":
            return await self._read_artifact(arguments)
        if name == "remember":
            return await self._remember(arguments)
        if name == "forget":
            return await self._forget(arguments)
        if name == "delegate":
            return await self._delegate(arguments)
        if failure_count >= _MAX_CONSECUTIVE_TOOL_FAILURES:
            return _ToolOutcome(
                name=name,
                error=(
                    f"tool disabled for this run after {failure_count} consecutive failures; "
                    "choose a different action or report the blocker"
                ),
            )
        handler = self._handlers.get(name)
        if handler is None:
            return _ToolOutcome(name=name, error=f"unknown tool: {name}")
        try:
            result = await handler(arguments, **self._deps)
            verification = await self._verify(name, arguments, result)
            return _ToolOutcome(name=name, result=result, verification=verification)
        except Exception as exc:
            return _ToolOutcome(name=name, error=str(exc))

    async def _verify(
        self,
        action_name: str,
        arguments: dict[str, Any],
        result: Any,
    ) -> dict[str, Any] | None:
        if action_name in {"push_insights", "dispatch_invites"}:
            return await self._verify_event_side_effect(action_name, arguments, result)
        verifier_name = _VERIFIER_TOOL_BY_ACTION.get(action_name)
        if verifier_name is None or not isinstance(result, dict):
            return None
        handler = self._handlers.get(verifier_name)
        campaign_id = result.get("campaign_id")
        if handler is None or campaign_id is None:
            return None
        try:
            observed = await handler({"campaign_id": campaign_id}, **self._deps)
        except Exception as exc:
            return {
                "verified": False,
                "verifier": verifier_name,
                "error": str(exc),
            }
        observed_id = observed.get("campaign_id") if isinstance(observed, dict) else None
        verified = str(observed_id) == str(campaign_id)
        if action_name == "start_campaign" and isinstance(observed, dict):
            verified = verified and observed.get("status") == "live"
        return {
            "verified": verified,
            "verifier": verifier_name,
            "observation": observed,
        }

    async def _verify_event_side_effect(
        self,
        action_name: str,
        arguments: dict[str, Any],
        result: Any,
    ) -> dict[str, Any] | None:
        event_store = self._deps.get("event_store")
        campaign_id = arguments.get("campaign_id")
        if event_store is None or campaign_id is None:
            return None
        try:
            stored_events = await event_store.read_stream(UUID(str(campaign_id)))
        except Exception as exc:
            return {
                "verified": False,
                "verifier": "event_store_readback",
                "error": str(exc),
            }

        if action_name == "push_insights":
            destination = str(arguments.get("destination", ""))
            matches = [
                stored
                for stored in stored_events
                if getattr(stored.event, "type", "") == "coord.notification_sent"
                and getattr(stored.event, "channel", "") == destination
            ]
            verified = bool(matches) and isinstance(result, dict) and bool(result.get("delivered"))
            observation = {
                "matching_event_seqs": [stored.seq for stored in matches[-5:]],
                "destination": destination,
            }
        else:
            invites = arguments.get("invites")
            if not isinstance(invites, list):
                invites = []
            expected_hashes = {
                hashlib.sha256(str(invite.get("address", "")).encode()).hexdigest()[:16]
                for invite in invites
                if isinstance(invite, dict) and invite.get("address")
            }
            matching = [
                stored
                for stored in stored_events
                if getattr(stored.event, "type", "") == "invite.dispatched"
                and getattr(stored.event, "address_hash", "") in expected_hashes
                and bool(getattr(stored.event, "ok", False))
            ]
            observed_hashes = {
                str(getattr(stored.event, "address_hash", "")) for stored in matching
            }
            verified = bool(expected_hashes) and observed_hashes == expected_hashes
            observation = {
                "matching_event_seqs": [stored.seq for stored in matching],
                "expected": len(expected_hashes),
                "delivered": len(observed_hashes),
            }
        return {
            "verified": verified,
            "verifier": "event_store_readback",
            "observation": observation,
        }

    async def _render_for_context(self, name: str, result: Any) -> str:
        rendered = _serialize_for_context(name, result)
        if len(rendered) <= _MAX_CONTEXT_RESULT_CHARS:
            return rendered
        if self._artifact_store is None or self._run_id is None:
            return _truncate_for_context(rendered)
        artifact = await self._artifact_store.write_artifact(
            run_id=self._run_id,
            org_id=self._deps["org_id"],
            content=rendered,
        )
        preview_size = (_MAX_CONTEXT_RESULT_CHARS - 500) // 2
        return json.dumps(
            {
                "artifact_ref": f"artifact://{artifact.id}",
                "chars": len(rendered),
                "preview_head": rendered[:preview_size],
                "preview_tail": rendered[-preview_size:],
                "instruction": (
                    "Use read_artifact with artifact_id and a start/end range "
                    "to recover omitted content."
                ),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    async def _read_artifact(self, arguments: dict[str, Any]) -> _ToolOutcome:
        if self._artifact_store is None:
            return _ToolOutcome(name="read_artifact", error="artifact storage is unavailable")
        try:
            artifact_id = UUID(str(arguments.get("artifact_id", "")))
        except ValueError:
            return _ToolOutcome(name="read_artifact", error="artifact_id must be a UUID")
        start = arguments.get("start", 0)
        end = arguments.get("end", start + _MAX_CONTEXT_RESULT_CHARS)
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start:
            return _ToolOutcome(
                name="read_artifact",
                error="artifact range requires integers with 0 <= start < end",
            )
        if end - start > _MAX_CONTEXT_RESULT_CHARS:
            end = start + _MAX_CONTEXT_RESULT_CHARS
        artifact = await self._artifact_store.read_artifact(
            artifact_id,
            org_id=self._deps["org_id"],
        )
        if artifact is None:
            return _ToolOutcome(name="read_artifact", error="artifact not found")
        return _ToolOutcome(
            name="read_artifact",
            result={
                "artifact_id": str(artifact.id),
                "start": start,
                "end": min(end, len(artifact.content)),
                "total_chars": len(artifact.content),
                "content": artifact.content[start:end],
            },
        )

    async def _compact_context(
        self,
        convo: list[LLMMessage],
    ) -> list[LLMMessage] | None:
        split_at = len(convo) - _RECENT_MESSAGES_AFTER_COMPACTION
        older = convo[:split_at]
        recent = convo[split_at:]
        try:
            response = await self._llm.complete(
                system=(
                    "Compact an agent transcript into a factual working-state summary. "
                    "Preserve the user goal, ids, decisions, completed and pending plan items, "
                    "tool failures, verification outcomes, artifact refs, and safety constraints. "
                    "Do not claim unverified completion."
                ),
                messages=[
                    LLMMessage(
                        role="user",
                        content=json.dumps(
                            [
                                {"role": message.role, "content": message.content}
                                for message in older
                            ],
                            ensure_ascii=False,
                            default=str,
                        ),
                    )
                ],
                tools=None,
                model=self._compaction_model,
                max_tokens=min(self._max_tokens, 2_000),
            )
        except Exception:
            return None
        if not response.text:
            return None
        summary = LLMMessage(
            role="user",
            content=(
                "[compaction summary of earlier run history; original events remain persisted]\n"
                + response.text
            ),
        )
        return [summary, *recent]

    async def _remember(self, arguments: dict[str, Any]) -> _ToolOutcome:
        if self._memory_store is None:
            return _ToolOutcome(name="remember", error="long-term memory is unavailable")
        name = str(arguments.get("name", "")).strip()
        body = str(arguments.get("body", "")).strip()
        if not name or len(name) > 80 or not body or len(body) > 1_000:
            return _ToolOutcome(
                name="remember",
                error="memory requires name (1-80 chars) and body (1-1000 chars)",
            )
        cleaned, redacted_fields = redact(body)
        memory = await self._memory_store.upsert_memory(
            org_id=self._deps["org_id"],
            name=name,
            body=cleaned,
        )
        return _ToolOutcome(
            name="remember",
            result={
                "saved": True,
                "name": memory.name,
                "body": memory.body,
                "redacted_fields": redacted_fields,
            },
        )

    async def _forget(self, arguments: dict[str, Any]) -> _ToolOutcome:
        if self._memory_store is None:
            return _ToolOutcome(name="forget", error="long-term memory is unavailable")
        name = str(arguments.get("name", "")).strip()
        if not name or len(name) > 80:
            return _ToolOutcome(name="forget", error="memory name must be 1-80 chars")
        deleted = await self._memory_store.delete_memory(
            org_id=self._deps["org_id"],
            name=name,
        )
        return _ToolOutcome(name="forget", result={"deleted": deleted, "name": name})

    async def _delegate(self, arguments: dict[str, Any]) -> _ToolOutcome:
        if not self._allow_delegate:
            return _ToolOutcome(name="delegate", error="nested delegation is disabled")
        task = str(arguments.get("task", "")).strip()
        requested = arguments.get("tools")
        if not task or len(task) > 2_000 or not isinstance(requested, list):
            return _ToolOutcome(name="delegate", error="delegate requires task and tools")
        tool_names = {str(name) for name in requested}
        if not tool_names or not tool_names <= _DELEGATE_SAFE_TOOLS:
            return _ToolOutcome(
                name="delegate",
                error="delegate tools must be from the read-only allowlist",
            )
        available = tool_names & set(self._handlers)
        if "read_artifact" in tool_names and self._artifact_store is not None:
            available.add("read_artifact")
        if not available:
            return _ToolOutcome(name="delegate", error="none of the requested tools are available")

        subagent = OrchestratorAgent(
            llm=self._llm,
            tool_handlers={
                name: handler
                for name, handler in self._handlers.items()
                if name in available
            },
            harness=self._deps["harness"],
            projector=self._deps["projector"],
            insight_reader=self._deps["insight_reader"],
            followup_service=self._deps["followup_service"],
            org_id=self._deps["org_id"],
            author_id=self._deps["author_id"],
            public_base_url=self._deps["public_base_url"],
            event_store=self._deps["event_store"],
            max_tokens=min(self._max_tokens, 2_000),
            artifact_store=self._artifact_store,
            run_id=self._run_id,
            compaction_model=self._compaction_model,
            context_compaction_chars=self._context_compaction_chars,
            allow_delegate=False,
            tool_allowlist=available,
        )
        summary = ""
        status = "incomplete"
        steps = 0
        tools_used: list[str] = []
        async for event in subagent.chat(
            [LLMMessage(role="user", content=task)],
            max_turns=4,
        ):
            if event["type"] == "tool_call":
                steps += 1
                tools_used.append(str(event["name"]))
            if event["type"] == "done":
                summary = str(event.get("text", ""))
                status = str(event.get("status", "completed"))
            elif event["type"] == "error":
                summary = str(event.get("message", "subagent failed"))
                status = "failed"
        return _ToolOutcome(
            name="delegate",
            result={
                "status": status,
                "summary": summary,
                "tool_steps": steps,
                "tools_used": tools_used,
            },
        )

    async def _wait_for_confirmation(self, confirmation_id: UUID) -> bool:
        assert self._confirmation_store is not None
        deadline = time.monotonic() + _CONFIRMATION_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            confirmation = await self._confirmation_store.get_confirmation(
                confirmation_id,
                org_id=self._deps["org_id"],
            )
            if confirmation is None or confirmation.status == "denied":
                return False
            if confirmation.status == "approved":
                return True
            await asyncio.sleep(_CONFIRMATION_POLL_SECONDS)
        return False


def _describe_calls(calls: list[Any]) -> str:
    """A compact stand-in for an assistant turn whose only content was tool calls
    (some providers return empty text alongside tool_use)."""
    return "Calling: " + ", ".join(c.name for c in calls)


def _serialize_for_context(name: str, result: Any) -> str:
    """Keep observations useful without flooding subsequent model turns.

    The full result is still emitted to the UI. Only the model-facing copy is
    compacted here; durable artifact storage is a later phase.
    """
    if name == "list_campaigns" and isinstance(result, dict):
        campaigns = result.get("campaigns")
        if isinstance(campaigns, list):
            statuses: dict[str, int] = {}
            compact: list[dict[str, Any]] = []
            for campaign in campaigns:
                if not isinstance(campaign, dict):
                    continue
                status = str(campaign.get("status", "unknown"))
                statuses[status] = statuses.get(status, 0) + 1
                compact.append(
                    {
                        key: campaign.get(key)
                        for key in ("campaign_id", "title", "status")
                        if campaign.get(key) is not None
                    }
                )
            payload = {
                "count": len(campaigns),
                "statuses": statuses,
                "campaigns": compact,
                "next_actions": result.get("next_actions", []),
            }
            rendered = json.dumps(payload, default=str, separators=(",", ":"))
        else:
            rendered = json.dumps(result, default=str, separators=(",", ":"))
    else:
        rendered = json.dumps(result, default=str, separators=(",", ":"))

    return rendered


def _truncate_for_context(rendered: str) -> str:
    if len(rendered) <= _MAX_CONTEXT_RESULT_CHARS:
        return rendered
    omitted = len(rendered) - _MAX_CONTEXT_RESULT_CHARS
    half = (_MAX_CONTEXT_RESULT_CHARS - 100) // 2
    return (
        rendered[:half]
        + f'…[truncated {omitted} chars from model context; full result remains in event stream]'
        + rendered[-half:]
    )


def _normalize_plan(arguments: dict[str, Any]) -> list[dict[str, str]]:
    raw_items = arguments.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("update_plan requires a non-empty items list")
    normalized = []
    allowed = {"pending", "doing", "done", "skipped"}
    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise ValueError(f"plan item {index + 1} must be an object")
        step = str(raw.get("step", "")).strip()
        status = str(raw.get("status", ""))
        if not step or status not in allowed:
            raise ValueError(
                f"plan item {index + 1} requires a step and status in {sorted(allowed)}"
            )
        normalized.append({"step": step, "status": status})
    doing = sum(item["status"] == "doing" for item in normalized)
    if doing > 1:
        raise ValueError("at most one plan item can have status 'doing'")
    return normalized


def _context_chars(messages: list[LLMMessage]) -> int:
    return sum(
        len(message.content)
        if isinstance(message.content, str)
        else len(json.dumps(message.content, ensure_ascii=False, default=str))
        for message in messages
    )


async def _immediate_outcome(outcome: _ToolOutcome) -> _ToolOutcome:
    return outcome

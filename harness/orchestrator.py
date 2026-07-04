"""Harness: central orchestrator that routes commands to Agents, applies policies,
persists events, and updates campaign memory."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

from core.events import EventBase
from harness.memory import HarnessMemory
from harness.observability import NullTracer, Tracer
from harness.policies import PolicyStack
from harness.router import IntentRouter

if TYPE_CHECKING:
    from storage.event_store import EventStore, StoredEvent


@dataclass(slots=True)
class AgentResult:
    """What an Agent returns to the Harness after handling a command."""

    events: list[EventBase] = field(default_factory=list)
    state_delta: dict[str, Any] = field(default_factory=dict)
    response: Any = None
    follow_up_commands: list[Any] = field(default_factory=list)


@dataclass(slots=True)
class HarnessResponse:
    ok: bool
    result: Any = None
    reason: str = ""
    events_written: int = 0


class Agent(Protocol):
    async def run(
        self, command: Any, context: dict[str, Any], harness: Harness
    ) -> AgentResult: ...


class Harness:
    """The one orchestrator. All commands flow through here."""

    def __init__(
        self,
        *,
        event_store: EventStore,
        memory: HarnessMemory,
        router: IntentRouter,
        policies: PolicyStack,
        agents: dict[str, Agent],
        tracer: Tracer | None = None,
    ) -> None:
        self._events = event_store
        self._memory = memory
        self._router = router
        self._policies = policies
        self._agents = agents
        self._tracer = tracer or NullTracer()

    async def handle(self, command: Any) -> HarnessResponse:
        cmd_type = getattr(command, "type", "unknown")
        async with self._tracer.span(f"harness.handle.{cmd_type}"):
            ctx = await self._load_context(command)

            pre = await self._policies.allow_all(command, ctx)
            written = await self._persist_events(pre.events)
            if not pre.allowed:
                return HarnessResponse(ok=False, reason=pre.reason, events_written=written)

            agent_name = self._router.route(command, ctx)
            agent = self._agents.get(agent_name)
            if agent is None:
                return HarnessResponse(
                    ok=False,
                    reason=f"no agent named {agent_name!r} registered",
                    events_written=written,
                )

            async with self._tracer.span(f"agent.{agent_name}.run"):
                result = await agent.run(command, ctx, self)

            written += await self._persist_events(result.events)

            if result.state_delta:
                cid = self._campaign_id_of(command)
                if cid is None:
                    # Fresh-create commands (e.g. CreateCampaign) don't carry a
                    # campaign_id; the agent minted one and put it into its
                    # produced events. Grab the first event's campaign_id so
                    # state_delta (spec / org_id) still gets written.
                    for ev in result.events:
                        ev_cid = getattr(ev, "campaign_id", None)
                        if isinstance(ev_cid, UUID):
                            cid = ev_cid
                            break
                if cid is not None:
                    await self._memory.update(cid, result.state_delta)

            post_events = await self._policies.observe_all(result)
            written += await self._persist_events(post_events)

            for sub_cmd in result.follow_up_commands:
                await self.handle(sub_cmd)

            return HarnessResponse(ok=True, result=result.response, events_written=written)

    async def dispatch(self, command: Any) -> HarnessResponse:
        """Alias for handle() used by agents that trigger sub-commands."""
        return await self.handle(command)

    async def _load_context(self, command: Any) -> dict[str, Any]:
        cid = self._campaign_id_of(command)
        if cid is None:
            return {}
        return await self._memory.load(cid)

    @staticmethod
    def _campaign_id_of(command: Any) -> UUID | None:
        cid = getattr(command, "campaign_id", None)
        return cid if isinstance(cid, UUID) else None

    async def _persist_events(self, events: list[EventBase]) -> int:
        if not events:
            return 0
        stored: list[StoredEvent] = await self._events.append_many(events)
        return len(stored)

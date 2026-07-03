"""CoordinatorAgent: fan out invitations, notify on milestones, push insights."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

from agents.shared import load_prompt
from core.domain.models import ChannelKind
from core.events import (
    CampaignPublished,
    EventBase,
    InviteDispatched,
    NotificationSent,
)
from core.protocols.commands import PushInsights, RegisterRespondents, StartCampaign
from harness.orchestrator import AgentResult

if TYPE_CHECKING:
    from harness.orchestrator import Harness


_COORDINATOR_ACTOR_SUFFIX = "coordinator"


class CoordinatorAgent:
    def __init__(
        self,
        prompt_version: str = "v1",
        *,
        actor_prefix_agent: str = "agent",
    ) -> None:
        self._system = load_prompt("coordinator", prompt_version)
        self._adapters: dict[str, Any] = {}
        self._actor = f"{actor_prefix_agent}:{_COORDINATOR_ACTOR_SUFFIX}"

    async def run(
        self, command: Any, context: dict[str, Any], harness: Harness
    ) -> AgentResult:
        _ = harness, context
        if isinstance(command, RegisterRespondents):
            return await self._on_register(command)
        if isinstance(command, StartCampaign):
            return await self._on_start(command)
        if isinstance(command, PushInsights):
            return await self._on_push(command)
        return AgentResult(response={"error": f"unsupported command {type(command).__name__}"})

    async def _on_register(self, cmd: RegisterRespondents) -> AgentResult:
        assert cmd.campaign_id is not None
        events: list[EventBase] = []
        for r in cmd.respondents:
            events.append(
                InviteDispatched(
                    campaign_id=cmd.campaign_id,
                    actor=self._actor,
                    respondent_id=uuid4(),
                    channel=str(r.get("channel", ChannelKind.WEB_TEXT.value)),
                    external_id=r.get("external_ref"),
                )
            )
        return AgentResult(events=events, response={"registered": len(cmd.respondents)})

    async def _on_start(self, cmd: StartCampaign) -> AgentResult:
        assert cmd.campaign_id is not None
        return AgentResult(
            events=[
                CampaignPublished(
                    campaign_id=cmd.campaign_id,
                    actor=self._actor,
                    channels=[ChannelKind.WEB_TEXT.value],
                )
            ],
            response={"status": "live"},
        )

    async def _on_push(self, cmd: PushInsights) -> AgentResult:
        assert cmd.campaign_id is not None
        return AgentResult(
            events=[
                NotificationSent(
                    campaign_id=cmd.campaign_id,
                    actor=self._actor,
                    to=cmd.config.get("target", ""),
                    channel=cmd.destination,
                    subject="insights pushed",
                )
            ],
            response={"delivered": True, "destination": cmd.destination},
        )

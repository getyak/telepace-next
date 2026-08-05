"""CoordinatorAgent: fan out invitations, notify on milestones, push insights."""

from __future__ import annotations

import hashlib
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
from interfaces.channels.base import EmailDispatcher, Invite

if TYPE_CHECKING:
    from harness.orchestrator import Harness


_COORDINATOR_ACTOR_SUFFIX = "coordinator"


class CoordinatorAgent:
    def __init__(
        self,
        prompt_version: str = "v1",
        *,
        actor_prefix_agent: str = "agent",
        insight_email: EmailDispatcher | None = None,
        public_base_url: str = "",
    ) -> None:
        self._system = load_prompt("coordinator", prompt_version)
        self._adapters: dict[str, Any] = {}
        self._actor = f"{actor_prefix_agent}:{_COORDINATOR_ACTOR_SUFFIX}"
        self._insight_email = insight_email
        self._public_base_url = public_base_url.rstrip("/")

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
        if cmd.destination != "email" or self._insight_email is None:
            return AgentResult(
                response={
                    "delivered": False,
                    "destination": cmd.destination,
                    "reason": "no configured delivery adapter",
                }
            )
        target = cmd.config.get("target", "").strip()
        if not target:
            return AgentResult(
                response={
                    "delivered": False,
                    "destination": cmd.destination,
                    "reason": "email delivery requires config.target",
                }
            )

        report_url = f"{self._public_base_url}/studies/{cmd.campaign_id}/insights"
        receipt = await self._insight_email.send(
            Invite(
                recipient_id=uuid4(),
                address=target,
                name=None,
                personalized_intro=None,
                share_url=report_url,
            ),
            subject="Telepace research insights",
            body_html=(
                "<p>Your verified Telepace research insights are ready.</p>"
                f'<p><a href="{report_url}">Open the report</a></p>'
            ),
            body_text=f"Your verified Telepace research insights are ready: {report_url}",
        )
        if not receipt.ok:
            return AgentResult(
                response={
                    "delivered": False,
                    "destination": cmd.destination,
                    "reason": receipt.error or "provider rejected delivery",
                }
            )
        external_ref = (
            f"{receipt.provider}:{receipt.provider_id}" if receipt.provider_id else None
        )
        return AgentResult(
            events=[
                NotificationSent(
                    campaign_id=cmd.campaign_id,
                    actor=self._actor,
                    to=hashlib.sha256(target.encode()).hexdigest()[:16],
                    channel=cmd.destination,
                    subject="insights pushed",
                )
            ],
            response={
                "delivered": True,
                "destination": cmd.destination,
                "external_ref": external_ref,
            },
        )

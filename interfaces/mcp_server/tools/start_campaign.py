"""MCP tool: start_campaign — publish a study so it goes live."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.constants import ACTOR_USER
from core.domain.models import ChannelKind
from core.protocols.commands import StartCampaign
from core.protocols.mcp_tools import StartCampaignInput, StartCampaignOutput

_DISPATCHABLE = (ChannelKind.EMAIL, ChannelKind.SMS, ChannelKind.PHONE_OUTBOUND)


async def start_campaign(
    input_data: dict[str, Any],
    *,
    harness: Any,
    projector: Any,
    author_id: UUID,
    actor_prefix_user: str = ACTOR_USER,
    **_: Any,
) -> dict[str, Any]:
    parsed = StartCampaignInput.model_validate(input_data)
    cmd = StartCampaign(
        actor=f"{actor_prefix_user}:{author_id}",
        campaign_id=parsed.campaign_id,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise RuntimeError(f"start_campaign failed: {resp.reason}")

    dispatchable: list[str] = []
    campaign = await projector.get_campaign(parsed.campaign_id)
    if campaign is not None:
        dispatchable = [ch.kind.value for ch in campaign.spec.channels if ch.kind in _DISPATCHABLE]

    next_actions = ["call `get_campaign_progress` to watch responses arrive"]
    if dispatchable:
        next_actions.insert(0, "call `dispatch_invites` to reach respondents on outbound channels")

    return StartCampaignOutput(
        campaign_id=parsed.campaign_id,
        status="live",
        dispatchable_channels=dispatchable,
        next_actions=next_actions,
    ).model_dump(mode="json")

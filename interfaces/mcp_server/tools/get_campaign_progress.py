"""MCP tool: get_campaign_progress."""

from __future__ import annotations

from typing import Any

from core.protocols.mcp_tools import GetCampaignProgressInput, GetCampaignProgressOutput


async def get_campaign_progress(
    input_data: dict[str, Any],
    *,
    projector: Any,
    **_: Any,
) -> dict[str, Any]:
    parsed = GetCampaignProgressInput.model_validate(input_data)
    campaign = await projector.get_campaign(parsed.campaign_id)
    if campaign is None:
        raise RuntimeError(f"campaign {parsed.campaign_id} not found")
    snap = await projector.get_progress(parsed.campaign_id)
    return GetCampaignProgressOutput(
        campaign_id=parsed.campaign_id,
        status=campaign.status.value,
        invited=snap.invited,
        started=snap.started,
        completed=snap.completed,
        abandoned=snap.abandoned,
        avg_duration_seconds=snap.avg_duration_seconds,
        avg_goal_coverage=snap.avg_goal_coverage,
        spent_usd=snap.spent_usd,
        budget_usd=campaign.spec.budget_usd,
        next_actions=[
            "if completed >= target_completions, call `get_campaign_insights`",
            "if invited < target and completion rate is low, expand recruitment",
        ],
    ).model_dump(mode="json")

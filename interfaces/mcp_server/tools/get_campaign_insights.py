"""MCP tool: get_campaign_insights."""

from __future__ import annotations

from typing import Any

from core.protocols.mcp_tools import (
    GetCampaignInsightsInput,
    GetCampaignInsightsOutput,
    InsightItem,
)


async def get_campaign_insights(
    input_data: dict[str, Any],
    *,
    insight_reader: Any,
    **_: Any,
) -> dict[str, Any]:
    parsed = GetCampaignInsightsInput.model_validate(input_data)
    items = await insight_reader.list_insights(
        campaign_id=parsed.campaign_id,
        format=parsed.format,
        min_confidence=parsed.min_confidence,
    )
    return GetCampaignInsightsOutput(
        campaign_id=parsed.campaign_id,
        format=parsed.format,
        items=[InsightItem.model_validate(i) for i in items],
        next_actions=[
            "call `push_insights` to deliver to Notion / Linear / Slack / webhook / email",
            "call `ask_followup` to mine transcripts with a specific question",
        ],
    ).model_dump(mode="json")

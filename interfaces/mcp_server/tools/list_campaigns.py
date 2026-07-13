"""MCP tool: list_campaigns — the researcher's studies with completion counts."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.protocols.mcp_tools import (
    CampaignSummary,
    ListCampaignsInput,
    ListCampaignsOutput,
)


async def list_campaigns(
    input_data: dict[str, Any],
    *,
    projector: Any,
    org_id: UUID,
    **_: Any,
) -> dict[str, Any]:
    ListCampaignsInput.model_validate(input_data)
    rows = await projector.list_campaigns(org_id)
    summaries = [
        CampaignSummary(
            campaign_id=UUID(row["id"]),
            title=row["title"],
            status=row["status"],
            completed=row["progress"]["completed"],
            target_completions=row["target_completions"],
        )
        for row in rows
    ]
    return ListCampaignsOutput(
        campaigns=summaries,
        next_actions=[
            "call `get_campaign_progress` on a study for full progress + spend",
            "call `get_campaign_insights` once a study has enough completions",
        ],
    ).model_dump(mode="json")

"""MCP tool: create_campaign."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.protocols.commands import CreateCampaign
from core.protocols.mcp_tools import CreateCampaignInput, CreateCampaignOutput


async def create_campaign(
    input_data: dict[str, Any],
    *,
    harness: Any,
    org_id: UUID,
    author_id: UUID,
    public_base_url: str,
) -> dict[str, Any]:
    parsed = CreateCampaignInput.model_validate(input_data)
    cmd = CreateCampaign(
        actor=f"user:{author_id}",
        org_id=org_id,
        author_id=author_id,
        title=parsed.title,
        goal=parsed.goal,
        background=parsed.background,
        target_completions=parsed.target_completions,
        budget_usd=parsed.budget_usd,
        channels=parsed.channels,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise RuntimeError(f"create_campaign failed: {resp.reason}")
    campaign_id = UUID(resp.result["campaign_id"])
    share_url = f"{public_base_url.rstrip('/')}/r/{campaign_id}"
    return CreateCampaignOutput(
        campaign_id=campaign_id,
        share_url=share_url,
        status=resp.result["status"],
        next_actions=[
            "call `get_campaign_progress` after respondents start joining",
            "share this link with respondents",
        ],
    ).model_dump(mode="json")

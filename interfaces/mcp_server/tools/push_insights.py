"""MCP tool: push_insights."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.protocols.commands import PushInsights
from core.protocols.mcp_tools import PushInsightsInput, PushInsightsOutput


async def push_insights(
    input_data: dict[str, Any],
    *,
    harness: Any,
    author_id: UUID,
    **_: Any,
) -> dict[str, Any]:
    parsed = PushInsightsInput.model_validate(input_data)
    cmd = PushInsights(
        actor=f"user:{author_id}",
        campaign_id=parsed.campaign_id,
        destination=parsed.destination,
        config=parsed.config,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise RuntimeError(f"push_insights failed: {resp.reason}")
    return PushInsightsOutput(
        delivered=bool(resp.result.get("delivered", False)),
        external_ref=resp.result.get("external_ref"),
        next_actions=[
            "call `get_campaign_progress` to keep an eye on late-arriving completions",
        ],
    ).model_dump(mode="json")

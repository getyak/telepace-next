"""MCP tool: refine_outline — natural-language edit to a study's outline."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.constants import ACTOR_USER
from core.protocols.commands import RefineOutline
from core.protocols.mcp_tools import RefineOutlineInput, RefineOutlineOutput


async def refine_outline(
    input_data: dict[str, Any],
    *,
    harness: Any,
    author_id: UUID,
    actor_prefix_user: str = ACTOR_USER,
    **_: Any,
) -> dict[str, Any]:
    parsed = RefineOutlineInput.model_validate(input_data)
    cmd = RefineOutline(
        actor=f"{actor_prefix_user}:{author_id}",
        campaign_id=parsed.campaign_id,
        instruction=parsed.instruction,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise RuntimeError(f"refine_outline failed: {resp.reason}")
    return RefineOutlineOutput(
        campaign_id=parsed.campaign_id,
        status="refined",
        next_actions=[
            "call `get_campaign_insights` after the outline stabilizes",
            "call `start_campaign` to publish once the outline is ready",
        ],
    ).model_dump(mode="json")

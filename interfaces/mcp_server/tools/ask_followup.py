"""MCP tool: ask_followup — second-order question over collected transcripts."""

from __future__ import annotations

from typing import Any

from core.protocols.mcp_tools import AskFollowupInput, AskFollowupOutput


async def ask_followup(
    input_data: dict[str, Any],
    *,
    followup_service: Any,
    **_: Any,
) -> dict[str, Any]:
    parsed = AskFollowupInput.model_validate(input_data)
    result = await followup_service.answer(
        campaign_id=parsed.campaign_id,
        question=parsed.question,
        scope=parsed.scope,
    )
    return AskFollowupOutput(
        answer=result["answer"],
        evidence=result.get("evidence", []),
        next_actions=[
            "if evidence is thin, expand recruitment and re-run",
            "call `push_insights` with a webhook to record this answer externally",
        ],
    ).model_dump(mode="json")

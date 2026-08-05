"""MCP tool: get_session — verify the caller's Telepace identity and tenant."""

from __future__ import annotations

from typing import Any

from core.protocols.mcp_tools import GetSessionInput, GetSessionOutput


async def get_session(
    input_data: dict[str, Any],
    *,
    mcp_session: Any,
    **_: Any,
) -> dict[str, Any]:
    GetSessionInput.model_validate(input_data)
    return GetSessionOutput(
        authenticated=mcp_session.authenticated,
        user_id=mcp_session.user_id,
        org_id=mcp_session.org_id,
        email=mcp_session.email,
        scopes=list(mcp_session.scopes),
    ).model_dump(mode="json")

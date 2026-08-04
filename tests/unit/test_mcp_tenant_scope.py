from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from interfaces.mcp_server.auth import MCPSessionIdentity
from interfaces.mcp_server.server import assert_campaign_access, assert_tool_scope


class _Projector:
    def __init__(self, campaign) -> None:
        self.campaign = campaign

    async def get_campaign(self, campaign_id):
        return self.campaign


@pytest.mark.asyncio
async def test_campaign_access_allows_authenticated_tenant() -> None:
    org_id = uuid4()
    await assert_campaign_access(
        uuid4(),
        org_id=org_id,
        projector=_Projector(SimpleNamespace(org_id=org_id)),
    )


@pytest.mark.asyncio
async def test_campaign_access_rejects_cross_tenant_id() -> None:
    with pytest.raises(PermissionError, match="authenticated tenant"):
        await assert_campaign_access(
            uuid4(),
            org_id=uuid4(),
            projector=_Projector(SimpleNamespace(org_id=uuid4())),
        )


@pytest.mark.asyncio
async def test_campaign_access_defers_missing_campaign_to_tool_not_found_path() -> None:
    await assert_campaign_access(
        uuid4(),
        org_id=uuid4(),
        projector=_Projector(None),
    )


def test_tool_scope_enforces_read_and_write_permissions() -> None:
    identity = MCPSessionIdentity(
        user_id=uuid4(),
        org_id=uuid4(),
        email="reader@example.test",
        scopes=("mcp:read",),
        authenticated=True,
    )

    assert_tool_scope("get_campaign_progress", identity)
    with pytest.raises(PermissionError, match="mcp:write"):
        assert_tool_scope("create_campaign", identity)


def test_get_session_remains_available_to_inspect_missing_scopes() -> None:
    identity = MCPSessionIdentity(
        user_id=uuid4(),
        org_id=uuid4(),
        email="unscoped@example.test",
        scopes=(),
        authenticated=True,
    )

    assert_tool_scope("get_session", identity)

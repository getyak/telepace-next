"""MCP API-key auth + scope enforcement tests.

Unit tests exercise `mcp_server.auth` pure logic with an in-memory fake repo
(no DB). The matching integration test (create -> verify -> revoke against the
local Postgres) lives in tests/integration and is added in P2.

Test matrix — docs/mcp-key-auth-design.md §10.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest

from core.constants import API_KEY_PREFIX_LIVE
from core.protocols.mcp_tools import (
    MCP_TOOL_REGISTRY,
    TOOL_REQUIRED_SCOPES,
)
from interfaces.mcp_server.key_auth import (
    MCPAuthError,
    MCPPrincipal,
    authenticate,
    has_scope,
    require_scope,
)
from interfaces.rest_api.auth.api_keys_repo import ApiKeyRecord, hash_key
from interfaces.rest_api.config import Settings

# --- registry invariant (works today, no impl needed) --------------------


def test_every_tool_has_a_required_scope() -> None:
    """Guards against adding a tool without declaring its scope."""
    assert set(TOOL_REQUIRED_SCOPES) == set(MCP_TOOL_REGISTRY), (
        "every MCP tool must map to a required scope in TOOL_REQUIRED_SCOPES"
    )


# --- fake repo for pure-logic auth tests ---------------------------------


class FakeApiKeysRepo:
    """In-memory stand-in keyed by key_hash. Enough for authenticate()."""

    def __init__(self, records: dict[str, ApiKeyRecord]) -> None:
        self._by_hash = records
        self.touched: list[UUID] = []

    async def verify(self, key_hash: str) -> ApiKeyRecord | None:
        rec = self._by_hash.get(key_hash)
        if rec is None or not rec.is_active:
            return None
        if rec.expires_at is not None and rec.expires_at < datetime.now(tz=UTC):
            return None
        return rec

    async def touch_last_used(self, key_id: UUID) -> None:
        self.touched.append(key_id)


def _record(**overrides: Any) -> ApiKeyRecord:
    base = ApiKeyRecord(
        id=uuid4(),
        org_id=uuid4(),
        user_id=uuid4(),
        name="test",
        key_prefix="tp_live_abcd",
        key_hash="deadbeef",
        scopes="campaigns:read",
        is_active=True,
        last_used_at=None,
        expires_at=None,
        created_at=datetime.now(tz=UTC),
        revoked_at=None,
    )
    return replace(base, **overrides)


# A well-formed live token and a repo whose sole entry is keyed by its hash.
_VALID_TOKEN = f"{API_KEY_PREFIX_LIVE}abcdef0123456789abcdef0123456789"


def _auth_enabled_settings() -> Settings:
    """Settings with auth on (the production default). Explicit for clarity."""
    return Settings(auth_enabled=True)


def _repo_for(token: str, record: ApiKeyRecord) -> FakeApiKeysRepo:
    """Build a fake repo where `token` hashes to `record` (key_hash aligned)."""
    key_hash = hash_key(token)
    return FakeApiKeysRepo({key_hash: replace(record, key_hash=key_hash)})


# --- authenticate() ------------------------------------------------------


async def test_no_header_raises_401() -> None:
    repo = FakeApiKeysRepo({})
    with pytest.raises(MCPAuthError) as exc:
        await authenticate(None, repo=repo, settings=_auth_enabled_settings())
    assert exc.value.status_code == 401


async def test_malformed_prefix_raises_401() -> None:
    # A syntactically valid bearer header whose token is not a tp_ API key.
    repo = FakeApiKeysRepo({})
    with pytest.raises(MCPAuthError) as exc:
        await authenticate(
            "Bearer not-a-telepace-key",
            repo=repo,
            settings=_auth_enabled_settings(),
        )
    assert exc.value.status_code == 401


async def test_unknown_hash_raises_401() -> None:
    # Well-formed key, but the repo has no matching hash.
    repo = FakeApiKeysRepo({})
    with pytest.raises(MCPAuthError) as exc:
        await authenticate(
            f"Bearer {_VALID_TOKEN}",
            repo=repo,
            settings=_auth_enabled_settings(),
        )
    assert exc.value.status_code == 401


async def test_inactive_key_raises_401() -> None:
    repo = _repo_for(_VALID_TOKEN, _record(is_active=False))
    with pytest.raises(MCPAuthError) as exc:
        await authenticate(
            f"Bearer {_VALID_TOKEN}",
            repo=repo,
            settings=_auth_enabled_settings(),
        )
    assert exc.value.status_code == 401


async def test_expired_key_raises_401() -> None:
    past = datetime.now(tz=UTC) - timedelta(days=1)
    repo = _repo_for(_VALID_TOKEN, _record(expires_at=past))
    with pytest.raises(MCPAuthError) as exc:
        await authenticate(
            f"Bearer {_VALID_TOKEN}",
            repo=repo,
            settings=_auth_enabled_settings(),
        )
    assert exc.value.status_code == 401


async def test_valid_key_returns_principal_and_touches_last_used() -> None:
    record = _record(scopes="campaigns:read insights:read")
    repo = _repo_for(_VALID_TOKEN, record)
    principal = await authenticate(
        f"Bearer {_VALID_TOKEN}",
        repo=repo,
        settings=_auth_enabled_settings(),
    )
    assert principal.org_id == record.org_id
    assert principal.user_id == record.user_id
    assert principal.scopes == frozenset({"campaigns:read", "insights:read"})
    # touch_last_used called once, with the matched record's id.
    assert repo.touched == [record.id]


async def test_auth_disabled_still_requires_remote_api_key() -> None:
    repo = FakeApiKeysRepo({})
    with pytest.raises(MCPAuthError) as exc:
        await authenticate(None, repo=repo, settings=Settings(auth_enabled=False))
    assert exc.value.status_code == 401
    assert repo.touched == []


# --- require_scope() / has_scope() ---------------------------------------


def _principal(*scopes: str) -> MCPPrincipal:
    return MCPPrincipal(org_id=uuid4(), user_id=uuid4(), scopes=frozenset(scopes))


def test_exact_scope_passes() -> None:
    principal = _principal("campaigns:read")
    # Neither raises; has_scope agrees.
    require_scope(principal, "campaigns:read")
    assert has_scope(principal, "campaigns:read") is True


def test_insufficient_scope_raises_403() -> None:
    principal = _principal("campaigns:read")
    with pytest.raises(MCPAuthError) as exc:
        require_scope(principal, "campaigns:write")
    assert exc.value.status_code == 403
    assert has_scope(principal, "campaigns:write") is False


def test_prefix_wildcard_covers_read() -> None:
    """campaigns:* satisfies campaigns:read."""
    principal = _principal("campaigns:*")
    require_scope(principal, "campaigns:read")
    assert has_scope(principal, "campaigns:read") is True
    # ...but does not leak across prefixes.
    assert has_scope(principal, "insights:read") is False


def test_star_scope_covers_everything() -> None:
    principal = _principal("*")
    for needed in set(TOOL_REQUIRED_SCOPES.values()):
        require_scope(principal, needed)
        assert has_scope(principal, needed) is True


def test_list_tools_filtered_by_scope() -> None:
    """A read-only key sees only read tools in list_tools."""
    principal = _principal("campaigns:read")
    visible = {
        name for name, needed in TOOL_REQUIRED_SCOPES.items() if has_scope(principal, needed)
    }
    # Only the two campaigns:read tools are visible.
    assert visible == {"list_campaigns", "get_campaign_progress"}
    # Write / insights / invites tools are hidden.
    assert "create_campaign" not in visible
    assert "push_insights" not in visible
    assert "dispatch_invites" not in visible


def test_weak_key_entropy_is_rejected() -> None:
    from interfaces.rest_api.auth.api_keys_repo import generate_key

    with pytest.raises(ValueError, match=">= 32"):
        generate_key(prefix=API_KEY_PREFIX_LIVE, entropy_bytes=8)

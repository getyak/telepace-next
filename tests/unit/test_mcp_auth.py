from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from interfaces.mcp_server.auth import resolve_mcp_identity
from interfaces.rest_api.auth.jwt import issue_token_pair
from interfaces.rest_api.config import Settings


def _token(settings: Settings, *, user_id, org_id) -> str:
    return issue_token_pair(
        user_id=user_id,
        org_id=org_id,
        email="codex@example.test",
        scopes=["mcp:read", "mcp:write"],
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_ttl_seconds=600,
        refresh_ttl_seconds=1200,
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
    ).access_token


def test_mcp_identity_uses_verified_jwt_claims() -> None:
    base = Settings(_env_file=None)
    user_id = uuid4()
    org_id = uuid4()
    settings = Settings(
        _env_file=None,
        mcp_access_token=_token(base, user_id=user_id, org_id=org_id),
        mcp_require_auth=True,
    )

    identity = resolve_mcp_identity(settings)

    assert identity.authenticated is True
    assert identity.user_id == user_id
    assert identity.org_id == org_id
    assert identity.email == "codex@example.test"
    assert identity.scopes == ("mcp:read", "mcp:write")


def test_mcp_identity_fails_closed_for_invalid_token() -> None:
    settings = Settings(
        _env_file=None,
        mcp_access_token="not-a-jwt",
        mcp_require_auth=False,
    )

    with pytest.raises(RuntimeError, match="authentication failed"):
        resolve_mcp_identity(settings)


def test_mcp_identity_requires_token_when_enabled() -> None:
    settings = Settings(
        _env_file=None,
        mcp_access_token="",
        mcp_require_auth=True,
    )

    with pytest.raises(RuntimeError, match="authentication required"):
        resolve_mcp_identity(settings)


def test_mcp_identity_allows_explicit_dev_fallback() -> None:
    settings = Settings(
        _env_file=None,
        mcp_access_token="",
        mcp_require_auth=False,
    )

    identity = resolve_mcp_identity(settings)

    assert identity.authenticated is False
    assert identity.user_id == UUID(settings.default_author_id)
    assert identity.org_id == UUID(settings.default_org_id)

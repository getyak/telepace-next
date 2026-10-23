"""Machine credentials cannot bypass JWT identity or delegate absent privileges."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from interfaces.rest_api.auth.api_keys_repo import ApiKeyRecord, ApiKeysRepo, NewApiKey
from interfaces.rest_api.auth.jwt import issue_token_pair
from interfaces.rest_api.config import Settings
from interfaces.rest_api.routers.api_keys import router


def _client(scopes: list[str] | None, *, dev: bool = False):
    settings = Settings(_env_file=None, auth_enabled=not dev)
    org_id, user_id = uuid4(), uuid4()
    repo = AsyncMock(spec=ApiKeysRepo)
    repo.list_for_org.return_value = []
    record = ApiKeyRecord(
        id=uuid4(),
        org_id=org_id,
        user_id=user_id,
        name="Agent",
        key_prefix="tp_live_abcd",
        key_hash="synthetic-hash",
        scopes="campaigns:read",
        is_active=True,
        last_used_at=None,
        expires_at=None,
        created_at=datetime.now(tz=UTC),
        revoked_at=None,
    )
    repo.create.return_value = NewApiKey(record, "tp_live_one-time-synthetic-secret")
    app = FastAPI()
    app.state.telepace = SimpleNamespace(settings=settings, api_keys_repo=repo)
    app.include_router(router, prefix="/v1")
    client = TestClient(app)
    if scopes is not None:
        token = issue_token_pair(
            user_id=user_id,
            org_id=org_id,
            email="fixture@example.test",
            scopes=scopes,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            access_ttl_seconds=600,
            refresh_ttl_seconds=1200,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        ).access_token
        client.headers["Authorization"] = f"Bearer {token}"
    return client, repo, org_id, user_id


@pytest.mark.parametrize("dev", [False, True])
def test_management_requires_jwt_even_in_dev_mode(dev):
    client, repo, _, _ = _client(None, dev=dev)
    assert client.get("/v1/api-keys").status_code == 401
    assert client.post("/v1/api-keys", json={"name": "x"}).status_code == 401
    assert client.delete(f"/v1/api-keys/{uuid4()}").status_code == 401
    repo.create.assert_not_awaited()
    repo.revoke.assert_not_awaited()


def test_readonly_jwt_cannot_mint_or_revoke_machine_credentials():
    client, repo, _, _ = _client(["mcp:read"])
    assert client.get("/v1/api-keys").status_code == 200
    assert client.post("/v1/api-keys", json={"name": "x", "scopes": ["*"]}).status_code == 403
    assert client.delete(f"/v1/api-keys/{uuid4()}").status_code == 403
    repo.create.assert_not_awaited()
    repo.revoke.assert_not_awaited()


@pytest.mark.parametrize(
    "scope",
    [
        "*",
        "campaigns:*",
        "insights:*",
        "session:*",
        "campaigns:read",
        "insights:read",
        "session:read",
    ],
)
def test_writeonly_jwt_cannot_delegate_read_scope(scope):
    client, repo, _, _ = _client(["mcp:write"])
    response = client.post("/v1/api-keys", json={"name": "x", "scopes": [scope]})
    assert response.status_code == 403
    repo.create.assert_not_awaited()


@pytest.mark.parametrize("token", ["not-a-jwt", "tp_live_machine-credential"])
def test_machine_key_is_not_a_human_management_session(token):
    client, repo, _, _ = _client(None)
    client.headers["Authorization"] = f"Bearer {token}"
    assert client.get("/v1/api-keys").status_code == 401
    repo.list_for_org.assert_not_awaited()


def test_successful_creation_is_uncacheable_and_uses_verified_identity():
    client, repo, org_id, user_id = _client(["mcp:read", "mcp:write"])
    response = client.post("/v1/api-keys", json={"name": " Agent ", "scopes": ["campaigns:read"]})
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert "key_hash" not in response.json()
    kwargs = repo.create.await_args.kwargs
    assert (kwargs["org_id"], kwargs["user_id"], kwargs["name"]) == (org_id, user_id, "Agent")
    assert kwargs["entropy_bytes"] >= 32
    repo.list_for_org.return_value = [repo.create.return_value.record]
    listed = client.get("/v1/api-keys")
    assert listed.headers["cache-control"] == "no-store"
    assert "plaintext_key" not in listed.text and "key_hash" not in listed.text
    assert repo.create.return_value.plaintext not in repr(repo.create.return_value)


def test_revocation_is_scoped_to_the_jwt_org():
    client, repo, org_id, _ = _client(["mcp:write"])
    key_id = uuid4()
    assert client.delete(f"/v1/api-keys/{key_id}").status_code == 204
    repo.revoke.assert_awaited_once_with(key_id=key_id, org_id=org_id)


@pytest.mark.parametrize(
    "body",
    [
        {"name": "   "},
        {"name": "a", "expires_in_days": 3651},
        {"name": "a", "org_id": str(uuid4())},
    ],
)
def test_invalid_labels_unbounded_ttl_and_identity_injection_are_rejected(body):
    client, repo, _, _ = _client(["mcp:read", "mcp:write"])
    assert client.post("/v1/api-keys", json=body).status_code == 422
    repo.create.assert_not_awaited()

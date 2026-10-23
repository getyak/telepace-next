"""REST integration coverage for the API-key issuance router (design §7).

Drives the real FastAPI router through a `TestClient` against a live Postgres.
A synthetic signed JWT identifies a fresh test org; no dev authentication
fallback or real account is used.

The heavy application lifespan (redis, LLM, event store) is bypassed: we mount
only `api_keys.router` on a bare `FastAPI` app and give it a small lifespan that
opens just the asyncpg pool the router needs, exposed on `app.state.telepace`
alongside `settings`. The repo is the real `ApiKeysRepo`, so the actual SQL is
exercised.

The pool is created inside the app lifespan so it lives on the same event loop
`TestClient` drives the app with; the direct `ApiKeysRepo.verify` assertion runs
through `client.portal` for the same reason (sharing an asyncpg pool across event
loops raises "another operation is in progress").

Coverage:
  - POST mints a key, returns the plaintext once with a tp_live_ prefix (201)
  - POST with an unknown scope is rejected (400)
  - GET lists keys and never leaks plaintext
  - DELETE revokes (204); the key then fails to verify via ApiKeysRepo
  - DELETE of an unknown id is a 404

Rows created against a fresh fixture org are cleaned up after each test; the
DB is skipped (not failed) when no Postgres is reachable.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import cast
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from interfaces.rest_api.auth.api_keys_repo import (
    API_KEYS_SCHEMA_SQL,
    ApiKeysRepo,
    hash_key,
)
from interfaces.rest_api.auth.jwt import issue_token_pair
from interfaces.rest_api.auth.users_repo import USERS_SCHEMA_SQL, UsersRepo
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.routers import api_keys

_BASE = "/v1/api-keys"


def _require_postgres() -> None:
    """Skip the module when the configured Postgres is unreachable."""
    test_url = os.environ.get("TELEPACE_TEST_DATABASE_URL", "")
    if (
        not test_url
        or urlsplit(test_url).hostname not in {"127.0.0.1", "localhost"}
        or not urlsplit(test_url).path.startswith("/telepace_test")
    ):
        pytest.skip(
            "Set TELEPACE_TEST_DATABASE_URL to a disposable loopback telepace_test database"
        )
    settings = get_settings().model_copy(update={"database_url": test_url})

    async def _probe() -> None:
        conn = await asyncpg.connect(settings.database_url)
        await conn.close()

    try:
        asyncio.run(_probe())
    except (OSError, asyncpg.PostgresError) as exc:
        pytest.skip(f"Postgres not reachable at {settings.database_url}: {exc}")


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """Use a dedicated loopback test database and clean only this fixture's org."""
    _require_postgres()
    settings = get_settings().model_copy(
        update={
            "database_url": os.environ["TELEPACE_TEST_DATABASE_URL"],
            "auth_enabled": True,
            "default_org_id": str(uuid4()),
            "default_author_id": str(uuid4()),
        }
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
        async with pool.acquire() as conn:
            await conn.execute(USERS_SCHEMA_SQL)
            await conn.execute(API_KEYS_SCHEMA_SQL)
            await conn.execute(
                "INSERT INTO users(id,email,password_hash,org_id,created_at,updated_at) VALUES($1,$2,$3,$4,NOW(),NOW())",
                UUID(settings.default_author_id),
                f"key-router-{uuid4()}@example.test",
                "synthetic-not-a-password",
                UUID(settings.default_org_id),
            )
        app.state.telepace = SimpleNamespace(
            settings=settings,
            api_keys_repo=ApiKeysRepo(pool),
            users_repo=UsersRepo(pool),
            pool=pool,
        )
        try:
            yield
        finally:
            await pool.execute(
                "DELETE FROM api_keys WHERE org_id = $1",
                UUID(settings.default_org_id),
            )
            await pool.execute("DELETE FROM users WHERE id = $1", UUID(settings.default_author_id))
            await pool.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(api_keys.router, prefix=settings.api_version_prefix)

    with TestClient(app) as test_client:
        token = issue_token_pair(
            user_id=UUID(settings.default_author_id),
            org_id=UUID(settings.default_org_id),
            email="fixture@example.test",
            scopes=["mcp:read", "mcp:write"],
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            access_ttl_seconds=600,
            refresh_ttl_seconds=1200,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        ).access_token
        test_client.headers["Authorization"] = f"Bearer {token}"
        yield test_client


def test_create_returns_plaintext_once(client: TestClient) -> None:
    r = client.post(
        _BASE,
        json={"name": "agent-key", "scopes": ["campaigns:read", "insights:read"]},
    )
    assert r.status_code == 201, r.text
    body = r.json()

    # The plaintext is a live key and is present exactly once, on creation.
    assert body["plaintext_key"].startswith("tp_live_")
    assert body["name"] == "agent-key"
    assert sorted(body["scopes"]) == ["campaigns:read", "insights:read"]
    # key_prefix is a safe truncation, never the full secret.
    assert body["key_prefix"].startswith("tp_live_")
    assert body["key_prefix"] != body["plaintext_key"]
    assert UUID(body["id"])  # a real UUID


def test_create_unknown_scope_rejected(client: TestClient) -> None:
    r = client.post(
        _BASE,
        json={"name": "bad-scope", "scopes": ["campaigns:read", "not:a:scope"]},
    )
    assert r.status_code == 400, r.text
    assert "not:a:scope" in r.json()["detail"]


def test_list_never_leaks_plaintext(client: TestClient) -> None:
    created = client.post(_BASE, json={"name": "listed-key", "scopes": ["campaigns:read"]})
    assert created.status_code == 201, created.text
    created_id = created.json()["id"]

    r = client.get(_BASE)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list)

    match = [row for row in rows if row["id"] == created_id]
    assert len(match) == 1
    row = match[0]
    # The safe representation exposes metadata but never the secret.
    assert "plaintext_key" not in row
    assert row["name"] == "listed-key"
    assert row["is_active"] is True
    assert row["scopes"] == ["campaigns:read"]


def test_delete_revokes_and_key_stops_verifying(client: TestClient) -> None:
    created = client.post(_BASE, json={"name": "to-revoke", "scopes": ["campaigns:read"]})
    assert created.status_code == 201, created.text
    body = created.json()
    key_id = body["id"]
    plaintext = body["plaintext_key"]

    # `client.app` is typed as a bare ASGI callable; the concrete FastAPI app
    # carries the state we injected in the lifespan.
    app = cast(FastAPI, client.app)
    repo: ApiKeysRepo = app.state.telepace.api_keys_repo
    portal = client.portal
    assert portal is not None

    # Sanity: the fresh key verifies before revocation. The coroutine runs on
    # the app's event loop (same loop that owns the pool) via the portal.
    before = portal.call(repo.verify, hash_key(plaintext))
    assert before is not None

    r = client.delete(f"{_BASE}/{key_id}")
    assert r.status_code == 204, r.text

    # After revoke, the same plaintext no longer authenticates.
    after = portal.call(repo.verify, hash_key(plaintext))
    assert after is None


def test_delete_unknown_id_is_404(client: TestClient) -> None:
    r = client.delete(f"{_BASE}/{uuid4()}")
    assert r.status_code == 404, r.text


@pytest.mark.parametrize("change", ["disable", "delete", "move"])
def test_management_rejects_stale_jwt_owner(client: TestClient, change: str) -> None:
    state = client.app.state.telepace
    user_id = UUID(state.settings.default_author_id)
    if change == "disable":
        query, args = "UPDATE users SET is_active = FALSE WHERE id = $1", (user_id,)
    elif change == "delete":
        query, args = "DELETE FROM users WHERE id = $1", (user_id,)
    else:
        query, args = "UPDATE users SET org_id = $2 WHERE id = $1", (user_id, uuid4())
    client.portal.call(state.pool.execute, query, *args)
    assert client.post(_BASE, json={"name": "must not mint", "scopes": ["*"]}).status_code == 401
    assert client.get(_BASE).status_code == 401
    assert client.delete(f"{_BASE}/{uuid4()}").status_code == 401

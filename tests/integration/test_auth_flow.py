"""End-to-end auth flow with an in-memory users repo (no Postgres needed).

Verifies that:
  - /auth/register issues a valid token pair
  - /auth/login rejects wrong password with 401
  - /auth/login rejects short password with 400 (settings-driven policy)
  - /auth/me returns the current user for a valid Bearer token
  - /auth/me returns 401 without a token
  - /v1/campaigns is protected (401 without token)
  - lockout after N failed attempts (from Settings.auth_max_failed_attempts)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.auth.users_repo import (
    UserAlreadyExistsError,
    UserNotFoundError,
    UserRecord,
)
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.routers.campaigns import router as campaigns_router


@dataclass
class _MemUsersRepo:
    """In-memory users repo — same public API as the Postgres one."""

    users: dict[UUID, UserRecord]
    by_email: dict[str, UUID]

    def __init__(self) -> None:
        self.users = {}
        self.by_email = {}

    async def create(
        self,
        *,
        email: str,
        password_hash: str,
        display_name: str | None,
        org_id: UUID,
    ) -> UserRecord:
        email = email.lower()
        if email in self.by_email:
            raise UserAlreadyExistsError(email)
        uid = uuid4()
        now = datetime.now(tz=UTC)
        record = UserRecord(
            id=uid,
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            org_id=org_id,
            is_active=True,
            failed_attempts=0,
            locked_until=None,
            created_at=now,
            updated_at=now,
        )
        self.users[uid] = record
        self.by_email[email] = uid
        return record

    async def get_by_email(self, email: str) -> UserRecord | None:
        uid = self.by_email.get(email.lower())
        return self.users.get(uid) if uid else None

    async def get_by_id(self, user_id: UUID) -> UserRecord:
        rec = self.users.get(user_id)
        if rec is None:
            raise UserNotFoundError(str(user_id))
        return rec

    async def record_failed_attempt(
        self, *, user_id: UUID, max_attempts: int, lockout_seconds: int
    ) -> UserRecord:
        rec = self.users[user_id]
        attempts = rec.failed_attempts + 1
        locked = rec.locked_until
        if attempts >= max_attempts:
            locked = datetime.now(tz=UTC) + timedelta(seconds=lockout_seconds)
        self.users[user_id] = _replace(rec, failed_attempts=attempts, locked_until=locked)
        return self.users[user_id]

    async def reset_failed_attempts(self, user_id: UUID) -> None:
        rec = self.users[user_id]
        self.users[user_id] = _replace(rec, failed_attempts=0, locked_until=None)


def _replace(rec: UserRecord, **kwargs) -> UserRecord:
    d = {
        "id": rec.id,
        "email": rec.email,
        "password_hash": rec.password_hash,
        "display_name": rec.display_name,
        "org_id": rec.org_id,
        "is_active": rec.is_active,
        "failed_attempts": rec.failed_attempts,
        "locked_until": rec.locked_until,
        "created_at": rec.created_at,
        "updated_at": rec.updated_at,
    }
    d.update(kwargs)
    return UserRecord(**d)


@pytest.fixture()
def client() -> TestClient:
    """Build a minimal app without the real lifespan (no DB)."""
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(campaigns_router)

    settings = get_settings()
    users = _MemUsersRepo()
    app.state.telepace = SimpleNamespace(
        settings=settings,
        users_repo=users,
        harness=None,
        projector=None,
    )

    return TestClient(app)


def test_register_then_me(client: TestClient) -> None:
    r = client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": "hunter2long"},
    )
    assert r.status_code == 201, r.text
    tokens = r.json()
    assert set(tokens.keys()) >= {"access_token", "refresh_token", "expires_in"}

    r = client.get(
        "/auth/me",
        headers={"authorization": f"Bearer {tokens['access_token']}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "alice@example.com"


def test_login_success_and_bad_password(client: TestClient) -> None:
    client.post(
        "/auth/register",
        json={"email": "bob@example.com", "password": "hunter2long"},
    )

    ok = client.post(
        "/auth/login",
        json={"email": "bob@example.com", "password": "hunter2long"},
    )
    assert ok.status_code == 200

    bad = client.post(
        "/auth/login", json={"email": "bob@example.com", "password": "wrong-pass"}
    )
    assert bad.status_code == 401


def test_password_min_length_rejected(client: TestClient) -> None:
    r = client.post(
        "/auth/register",
        json={"email": "shortpw@example.com", "password": "1"},
    )
    assert r.status_code == 400
    assert "at least" in r.json()["detail"]


def test_me_requires_auth(client: TestClient) -> None:
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_campaigns_route_is_protected(client: TestClient) -> None:
    r = client.get(f"/v1/campaigns/{uuid4()}")
    assert r.status_code == 401


def test_lockout_after_max_attempts(client: TestClient) -> None:
    settings = get_settings()
    client.post(
        "/auth/register",
        json={"email": "lock@example.com", "password": "hunter2long"},
    )
    # Trigger max_attempts consecutive failures.
    for _ in range(settings.auth_max_failed_attempts):
        r = client.post(
            "/auth/login", json={"email": "lock@example.com", "password": "wrong"}
        )
        assert r.status_code == 401
    # Next login attempt (even with the correct password) should be locked.
    r = client.post(
        "/auth/login",
        json={"email": "lock@example.com", "password": "hunter2long"},
    )
    assert r.status_code == 423


def test_duplicate_email_rejected(client: TestClient) -> None:
    client.post(
        "/auth/register",
        json={"email": "dupe@example.com", "password": "hunter2long"},
    )
    r = client.post(
        "/auth/register",
        json={"email": "dupe@example.com", "password": "hunter2long"},
    )
    assert r.status_code == 409

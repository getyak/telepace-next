"""Google SSO flow (T-512) with an in-memory users repo (no Postgres, no network).

The Google HTTP round-trip (`_exchange_code_for_userinfo`) is monkeypatched —
that function is a thin httpx wrapper; what needs verifying is our own logic:

  - /auth/oauth/google/start 302s to Google with the right client_id/redirect/scope/state
  - a signed state round-trips; a tampered/missing state is rejected (CSRF guard)
  - a brand-new Google user is created passwordless, in its OWN org (T-501 rule)
  - a returning Google user reuses its account+org (no duplicate tenant)
  - an existing password account with the same email gets the provider bound
    (still one org), not a second tenant
  - a passwordless SSO account cannot sign in via /auth/login
  - the flow 503s when the provider isn't configured
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from interfaces.rest_api.auth import oauth_google
from interfaces.rest_api.auth.oauth_google import router as oauth_router
from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.auth.users_repo import (
    UserAlreadyExistsError,
    UserNotFoundError,
    UserRecord,
)
from interfaces.rest_api.config import Settings, get_settings


@dataclass
class _MemUsersRepo:
    """In-memory users repo — same public API as the Postgres one."""

    def __init__(self) -> None:
        self.users: dict[UUID, UserRecord] = {}
        self.by_email: dict[str, UUID] = {}
        self.by_provider: dict[tuple[str, str], UUID] = {}

    async def create(
        self, *, email: str, password_hash: str, display_name: str | None, org_id: UUID
    ) -> UserRecord:
        email = email.lower()
        if email in self.by_email:
            raise UserAlreadyExistsError(email)
        uid = uuid4()
        now = datetime.now(tz=UTC)
        rec = UserRecord(
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
        self.users[uid] = rec
        self.by_email[email] = uid
        return rec

    async def create_oauth(
        self,
        *,
        email: str,
        display_name: str | None,
        org_id: UUID,
        provider: str,
        provider_sub: str,
    ) -> UserRecord:
        email = email.lower()
        if email in self.by_email:
            raise UserAlreadyExistsError(email)
        uid = uuid4()
        now = datetime.now(tz=UTC)
        rec = UserRecord(
            id=uid,
            email=email,
            password_hash=None,
            display_name=display_name,
            org_id=org_id,
            is_active=True,
            failed_attempts=0,
            locked_until=None,
            created_at=now,
            updated_at=now,
            auth_provider=provider,
            provider_sub=provider_sub,
        )
        self.users[uid] = rec
        self.by_email[email] = uid
        self.by_provider[(provider, provider_sub)] = uid
        return rec

    async def get_by_provider(self, provider: str, provider_sub: str) -> UserRecord | None:
        uid = self.by_provider.get((provider, provider_sub))
        return self.users.get(uid) if uid else None

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
    ) -> UserRecord:  # pragma: no cover - not exercised here
        return self.users[user_id]

    async def reset_failed_attempts(self, user_id: UUID) -> None:  # pragma: no cover
        return None


def _settings_with_google() -> Settings:
    base = get_settings()
    return base.model_copy(
        update={"google_client_id": "test-client-id", "google_client_secret": "test-secret"}
    )


def _make_client(settings: Settings, users: _MemUsersRepo) -> TestClient:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(oauth_router)
    app.state.telepace = SimpleNamespace(
        settings=settings, users_repo=users, harness=None, projector=None
    )
    return TestClient(app)


@pytest.fixture()
def users() -> _MemUsersRepo:
    return _MemUsersRepo()


@pytest.fixture()
def client(users: _MemUsersRepo) -> TestClient:
    return _make_client(_settings_with_google(), users)


def _stub_google(monkeypatch: pytest.MonkeyPatch, *, sub: str, email: str, name: str | None):
    async def _fake(code: str, settings: Settings):
        return sub, email, name

    monkeypatch.setattr(oauth_google, "_exchange_code_for_userinfo", _fake)


# --- start / state -----------------------------------------------------------


def test_start_redirects_to_google_with_params(client: TestClient) -> None:
    r = client.get("/auth/oauth/google/start", follow_redirects=False)
    assert r.status_code == 302
    loc = urlparse(r.headers["location"])
    assert loc.netloc == "accounts.google.com"
    q = parse_qs(loc.query)
    assert q["client_id"] == ["test-client-id"]
    assert q["redirect_uri"] == ["http://localhost:3300/api/auth/oauth/google/callback"]
    assert q["response_type"] == ["code"]
    assert "email" in q["scope"][0]
    assert q["state"][0]  # signed, non-empty


def test_start_503_when_not_configured(users: _MemUsersRepo) -> None:
    # Explicitly blank the creds — the real .env may have them set, and
    # get_settings() is lru_cached, so we can't rely on "absent by default".
    unconfigured = get_settings().model_copy(
        update={"google_client_id": "", "google_client_secret": ""}
    )
    client = _make_client(unconfigured, users)
    r = client.get("/auth/oauth/google/start", follow_redirects=False)
    assert r.status_code == 503


def _valid_state(settings: Settings) -> str:
    return oauth_google._sign_state(settings)


def test_exchange_rejects_bad_state(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_google(monkeypatch, sub="g1", email="x@example.com", name="X")
    r = client.post(
        "/auth/oauth/google/exchange", json={"code": "abc", "state": "not-a-real-state"}
    )
    assert r.status_code == 400


def test_exchange_rejects_expired_state(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import jwt

    s = _settings_with_google()
    now = datetime.now(tz=UTC)
    expired = jwt.encode(
        {
            "typ": "oauth_state",
            "nonce": "n",
            "iat": int((now - timedelta(hours=1)).timestamp()),
            "exp": int((now - timedelta(minutes=30)).timestamp()),
            "iss": s.jwt_issuer,
            "aud": s.jwt_audience,
        },
        s.jwt_secret,
        algorithm=s.jwt_algorithm,
    )
    _stub_google(monkeypatch, sub="g1", email="x@example.com", name="X")
    r = client.post("/auth/oauth/google/exchange", json={"code": "abc", "state": expired})
    assert r.status_code == 400


# --- find-or-create + org isolation -----------------------------------------


def test_new_google_user_gets_own_org_and_is_passwordless(
    client: TestClient, users: _MemUsersRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_google(monkeypatch, sub="google-sub-1", email="new@example.com", name="New User")
    state = _valid_state(_settings_with_google())
    r = client.post("/auth/oauth/google/exchange", json={"code": "code1", "state": state})
    assert r.status_code == 200, r.text
    assert set(r.json().keys()) >= {"access_token", "refresh_token", "expires_in"}

    rec = await_get(users, "new@example.com")
    assert rec.password_hash is None
    assert rec.auth_provider == "google"
    assert rec.provider_sub == "google-sub-1"
    assert rec.org_id != UUID(get_settings().default_org_id)


def test_two_google_users_get_different_orgs(
    client: TestClient, users: _MemUsersRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _valid_state(_settings_with_google())
    _stub_google(monkeypatch, sub="sub-a", email="a@example.com", name="A")
    client.post("/auth/oauth/google/exchange", json={"code": "c", "state": state})
    _stub_google(monkeypatch, sub="sub-b", email="b@example.com", name="B")
    client.post("/auth/oauth/google/exchange", json={"code": "c", "state": state})

    a = await_get(users, "a@example.com")
    b = await_get(users, "b@example.com")
    assert a.org_id != b.org_id


def test_returning_google_user_reuses_account(
    client: TestClient, users: _MemUsersRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _valid_state(_settings_with_google())
    _stub_google(monkeypatch, sub="same-sub", email="same@example.com", name="Same")
    client.post("/auth/oauth/google/exchange", json={"code": "c1", "state": state})
    first = await_get(users, "same@example.com")
    # Second sign-in, same provider sub → same user id, same org, no dupe.
    client.post("/auth/oauth/google/exchange", json={"code": "c2", "state": state})
    assert len(users.users) == 1
    second = await_get(users, "same@example.com")
    assert second.id == first.id
    assert second.org_id == first.org_id


def test_existing_password_user_binds_provider_not_new_tenant(
    client: TestClient, users: _MemUsersRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A user registered with a password first.
    reg = client.post(
        "/auth/register",
        json={"email": "hybrid@example.com", "password": "hunter2long"},
    )
    assert reg.status_code == 201
    pw_user = await_get(users, "hybrid@example.com")

    # Then signs in with Google using the same email.
    state = _valid_state(_settings_with_google())
    _stub_google(monkeypatch, sub="hybrid-sub", email="hybrid@example.com", name="Hybrid")
    r = client.post("/auth/oauth/google/exchange", json={"code": "c", "state": state})
    assert r.status_code == 200
    # No second tenant — same org, same single record.
    assert len(users.users) == 1
    assert await_get(users, "hybrid@example.com").org_id == pw_user.org_id


def test_passwordless_user_cannot_password_login(
    client: TestClient, users: _MemUsersRepo, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _valid_state(_settings_with_google())
    _stub_google(monkeypatch, sub="pw-sub", email="sso@example.com", name="SSO")
    client.post("/auth/oauth/google/exchange", json={"code": "c", "state": state})

    r = client.post(
        "/auth/login", json={"email": "sso@example.com", "password": "anything-long"}
    )
    assert r.status_code == 401


def await_get(users: _MemUsersRepo, email: str) -> UserRecord:
    """Sync helper: the in-memory repo's get_by_email is trivial to resolve."""
    uid = users.by_email[email.lower()]
    return users.users[uid]

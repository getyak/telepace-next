"""Multi-tenant isolation + IDOR regression tests (T-501 / T-502 / T-503).

These lock in the fixes for the Critical data-isolation defect surfaced by the
dual-user audit:

  - T-501: each registration mints its OWN org — two fresh signups never share
    a tenant (they used to both fall back to `default_org_id`).
  - T-502: `GET /v1/campaigns` only lists the caller's own org.
  - T-503: every by-id campaign endpoint (`GET /{id}`, `/{id}/insights`, …)
    returns 404 — not the object — when the caller's org does not own it, so a
    user cannot read another tenant's study spec or respondents' raw answers by
    knowing/guessing a campaign id (IDOR).

No Postgres needed: an in-memory users repo and a tiny fake projector stand in
for the real ones, exercising the exact router code paths.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.domain.models import CampaignSpec, CampaignStatus
from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.auth.users_repo import (
    UserAlreadyExistsError,
    UserNotFoundError,
    UserRecord,
)
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.routers.campaigns import router as campaigns_router
from storage.projections.campaign_projector import (
    CampaignProjection,
    ProgressSnapshot,
)


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
        self.users[user_id] = _replace(rec, failed_attempts=rec.failed_attempts + 1)
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


class _FakeProjector:
    """Minimal projector: holds campaigns keyed by id, filters lists by org."""

    def __init__(self) -> None:
        self._campaigns: dict[UUID, CampaignProjection] = {}

    def add(self, *, campaign_id: UUID, org_id: UUID, author_id: UUID, title: str) -> None:
        now = datetime.now(tz=UTC)
        self._campaigns[campaign_id] = CampaignProjection(
            id=campaign_id,
            org_id=org_id,
            author_id=author_id,
            title=title,
            status=CampaignStatus.DRAFT,
            spec=CampaignSpec(goal="isolation test"),
            version=1,
            created_at=now,
            updated_at=now,
            last_event_seq=0,
        )

    async def get_campaign(self, campaign_id: UUID) -> CampaignProjection | None:
        return self._campaigns.get(campaign_id)

    async def get_progress(self, campaign_id: UUID) -> ProgressSnapshot:
        return ProgressSnapshot(campaign_id=campaign_id)

    async def list_campaigns(self, org_id: UUID) -> list[dict]:
        return [
            {"id": str(c.id), "title": c.title, "status": c.status.value}
            for c in self._campaigns.values()
            if c.org_id == org_id
        ]

    async def list_insights(self, campaign_id: UUID) -> list[dict]:
        return []


def _build_client() -> tuple[TestClient, _MemUsersRepo, _FakeProjector]:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(campaigns_router)

    users = _MemUsersRepo()
    projector = _FakeProjector()
    app.state.telepace = SimpleNamespace(
        settings=get_settings(),
        users_repo=users,
        projector=projector,
        harness=None,
    )
    return TestClient(app), users, projector


def _register(client: TestClient, email: str) -> str:
    r = client.post("/auth/register", json={"email": email, "password": "hunter2long"})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


# -- T-501 ---------------------------------------------------------------------


def test_two_registrations_get_distinct_non_default_orgs() -> None:
    client, users, _ = _build_client()
    _register(client, "alex@example.com")
    _register(client, "mia@example.com")

    orgs = [rec.org_id for rec in users.users.values()]
    assert len(orgs) == 2
    assert orgs[0] != orgs[1], "each signup must land in its own org"

    default_org = UUID(get_settings().default_org_id)
    assert default_org not in orgs, "a real signup must never use the dev default org"


# -- T-502 ---------------------------------------------------------------------


def test_campaign_list_is_scoped_to_own_org() -> None:
    client, users, projector = _build_client()
    alex_token = _register(client, "alex@example.com")
    mia_token = _register(client, "mia@example.com")
    alex = users.users[users.by_email["alex@example.com"]]

    alex_campaign = uuid4()
    projector.add(campaign_id=alex_campaign, org_id=alex.org_id, author_id=alex.id, title="Alex study")

    r = client.get("/v1/campaigns", headers=_auth(alex_token))
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["campaigns"]] == [str(alex_campaign)]

    r = client.get("/v1/campaigns", headers=_auth(mia_token))
    assert r.status_code == 200
    assert r.json()["campaigns"] == [], "Mia must not see Alex's study"


# -- T-503 (IDOR) --------------------------------------------------------------


def test_cross_tenant_by_id_reads_return_404() -> None:
    client, users, projector = _build_client()
    alex_token = _register(client, "alex@example.com")
    mia_token = _register(client, "mia@example.com")
    alex = users.users[users.by_email["alex@example.com"]]

    cid = uuid4()
    projector.add(campaign_id=cid, org_id=alex.org_id, author_id=alex.id, title="Alex study")

    # Owner can read.
    assert client.get(f"/v1/campaigns/{cid}", headers=_auth(alex_token)).status_code == 200

    # Outsider gets 404 (existence not leaked), not 200 and not 403.
    assert client.get(f"/v1/campaigns/{cid}", headers=_auth(mia_token)).status_code == 404
    assert (
        client.get(f"/v1/campaigns/{cid}/insights", headers=_auth(mia_token)).status_code == 404
    )


def test_unknown_campaign_id_is_404_for_owner_too() -> None:
    client, _, _ = _build_client()
    token = _register(client, "alex@example.com")
    assert client.get(f"/v1/campaigns/{uuid4()}", headers=_auth(token)).status_code == 404

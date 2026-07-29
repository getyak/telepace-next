"""Billing flow with in-memory repo + mock gateway (no Postgres, no Stripe).

Covers:
  - metering: qualified vs disqualified recording, idempotent replay
  - overage: reported to the gateway only beyond quota on paid plans
  - quota: free plan hard-stops (402) at quota; paid plans pass
  - /v1/billing/summary reflects plan + usage
  - /v1/billing/checkout returns a session URL and binds the customer
  - webhook: subscription.updated upgrades the plan; deleted downgrades
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import orjson
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.billing import PlanKind, QualityGateConfig
from core.billing.gateway import MockPaymentGateway
from core.billing.service import BillingService
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.quota import enforce_interview_quota
from interfaces.rest_api.routers.billing import router as billing_router
from storage.billing import BillingAccount, PeriodUsage, period_key_for


@dataclass
class _MemBillingRepo:
    """In-memory billing repo — same public API as the Postgres one."""

    accounts: dict[UUID, BillingAccount] = field(default_factory=dict)
    records: dict[UUID, dict] = field(default_factory=dict)  # interview_id -> row

    async def get_or_create_account(self, org_id: UUID) -> BillingAccount:
        if org_id not in self.accounts:
            self.accounts[org_id] = BillingAccount(
                org_id=org_id,
                plan=PlanKind.FREE,
                status="active",
                stripe_customer_id=None,
                stripe_subscription_id=None,
                current_period_start=None,
                current_period_end=None,
                quota_override=None,
            )
        return self.accounts[org_id]

    async def get_account(self, org_id: UUID) -> BillingAccount | None:
        return self.accounts.get(org_id)

    async def find_by_customer(self, stripe_customer_id: str) -> BillingAccount | None:
        for account in self.accounts.values():
            if account.stripe_customer_id == stripe_customer_id:
                return account
        return None

    async def set_stripe_customer(self, org_id: UUID, stripe_customer_id: str) -> None:
        acc = self.accounts[org_id]
        self.accounts[org_id] = BillingAccount(
            org_id=acc.org_id,
            plan=acc.plan,
            status=acc.status,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=acc.stripe_subscription_id,
            current_period_start=acc.current_period_start,
            current_period_end=acc.current_period_end,
            quota_override=acc.quota_override,
        )

    async def apply_subscription(
        self,
        org_id: UUID,
        *,
        plan: PlanKind,
        status: str,
        stripe_subscription_id: str | None,
        current_period_start: datetime | None,
        current_period_end: datetime | None,
    ) -> None:
        acc = self.accounts[org_id]
        self.accounts[org_id] = BillingAccount(
            org_id=acc.org_id,
            plan=plan,
            status=status,
            stripe_customer_id=acc.stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            current_period_start=current_period_start,
            current_period_end=current_period_end,
            quota_override=acc.quota_override,
        )

    async def record_interview(self, *, interview_id: UUID, **kw) -> bool:
        if interview_id in self.records:
            return False
        self.records[interview_id] = {
            "interview_id": interview_id,
            "period_key": period_key_for(kw["occurred_at"]),
            **kw,
        }
        return True

    async def period_usage(self, org_id: UUID, period_key: str) -> PeriodUsage:
        rows = [
            r
            for r in self.records.values()
            if r["org_id"] == org_id and r["period_key"] == period_key
        ]
        return PeriodUsage(
            qualified=sum(1 for r in rows if r["qualified"]),
            disqualified=sum(1 for r in rows if not r["qualified"]),
            voice_seconds=sum(r["voice_seconds"] for r in rows),
        )

    async def mark_stripe_reported(self, interview_id: UUID) -> None:
        self.records[interview_id]["stripe_reported"] = True


QUALITY = QualityGateConfig(min_duration_seconds=60, min_goal_coverage=0.3)
# Tiny quotas so tests exercise the boundary without loops of 20/200.
QUOTAS = {"free": 2, "pro": 3, "team": 5}


def _service(repo: _MemBillingRepo, gateway: MockPaymentGateway) -> BillingService:
    return BillingService(
        repo=repo, gateway=gateway, quality_config=QUALITY, quota_overrides=QUOTAS
    )


async def _complete(
    service: BillingService,
    org_id: UUID,
    *,
    duration: int = 120,
    coverage: float = 0.9,
    channel: str = "web_text",
    interview_id: UUID | None = None,
) -> UUID:
    iid = interview_id or uuid4()
    await service.record_completion(
        org_id=org_id,
        campaign_id=uuid4(),
        interview_id=iid,
        duration_seconds=duration,
        goal_coverage=coverage,
        channel=channel,
        occurred_at=datetime.now(tz=UTC),
    )
    return iid


# --- metering ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_metering_records_qualified_and_disqualified() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    await _complete(service, org, duration=120, coverage=0.9)
    await _complete(service, org, duration=10, coverage=0.9)  # too short
    summary = await service.summary(org)
    assert summary.qualified_used == 1
    assert summary.disqualified == 1


@pytest.mark.asyncio
async def test_metering_is_idempotent_per_interview() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org, iid = uuid4(), uuid4()
    await _complete(service, org, interview_id=iid)
    await _complete(service, org, interview_id=iid)  # replay of same event
    summary = await service.summary(org)
    assert summary.qualified_used == 1


@pytest.mark.asyncio
async def test_voice_seconds_only_for_voice_channels() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    await _complete(service, org, duration=100, channel="web_text")
    await _complete(service, org, duration=90, channel="web_voice")
    summary = await service.summary(org)
    assert summary.voice_seconds == 90


@pytest.mark.asyncio
async def test_overage_reported_only_beyond_quota_on_paid_plan() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    await repo.get_or_create_account(org)
    await repo.set_stripe_customer(org, "cus_test")
    await repo.apply_subscription(
        org,
        plan=PlanKind.PRO,
        status="active",
        stripe_subscription_id="sub_1",
        current_period_start=None,
        current_period_end=None,
    )
    for _ in range(QUOTAS["pro"]):  # fill the included quota
        await _complete(service, org)
    assert gateway.overage_reports == []
    await _complete(service, org)  # first interview beyond quota
    assert gateway.overage_reports == [("cus_test", 1)]


@pytest.mark.asyncio
async def test_free_plan_never_reports_overage() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    for _ in range(QUOTAS["free"] + 2):
        await _complete(service, org)
    assert gateway.overage_reports == []


# --- quota ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_quota_free_plan_blocks_at_limit() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    assert (await service.check_quota(org)).allowed
    for _ in range(QUOTAS["free"]):
        await _complete(service, org)
    decision = await service.check_quota(org)
    assert not decision.allowed
    assert decision.used == QUOTAS["free"]


@pytest.mark.asyncio
async def test_quota_paid_plan_allows_overage() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    await repo.get_or_create_account(org)
    await repo.apply_subscription(
        org,
        plan=PlanKind.PRO,
        status="active",
        stripe_subscription_id="sub_1",
        current_period_start=None,
        current_period_end=None,
    )
    for _ in range(QUOTAS["pro"] + 3):
        await _complete(service, org)
    assert (await service.check_quota(org)).allowed


@pytest.mark.asyncio
async def test_lapsed_paid_plan_falls_back_to_free_limits() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)
    org = uuid4()
    await repo.get_or_create_account(org)
    await repo.apply_subscription(
        org,
        plan=PlanKind.PRO,
        status="unpaid",
        stripe_subscription_id="sub_1",
        current_period_start=None,
        current_period_end=None,
    )
    for _ in range(QUOTAS["free"]):
        await _complete(service, org)
    assert not (await service.check_quota(org)).allowed


# --- HTTP layer -------------------------------------------------------------


def _client(repo: _MemBillingRepo, gateway: MockPaymentGateway) -> TestClient:
    app = FastAPI()
    app.include_router(billing_router)
    app.state.telepace = SimpleNamespace(
        settings=get_settings(),
        billing=_service(repo, gateway),
        billing_repo=repo,
        billing_gateway=gateway,
    )
    return TestClient(app)


def _auth_headers(client: TestClient) -> dict[str, str]:
    # Settings default auth_enabled=True in tests would need real tokens;
    # the auth dependency falls back to the dev user when disabled. Force it.
    return {}


@pytest.fixture(autouse=True)
def _disable_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_enabled", False)


def test_summary_endpoint_reflects_usage() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    resp = client.get("/v1/billing/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["plan"] == "free"
    assert body["quota"] == QUOTAS["free"]
    assert body["qualified_used"] == 0


def test_checkout_returns_session_url_and_binds_customer() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    resp = client.post("/v1/billing/checkout", json={"plan": "pro"})
    assert resp.status_code == 200
    assert resp.json()["url"].startswith("https://checkout.stripe.mock/")
    assert gateway.checkouts and gateway.checkouts[0][1] is PlanKind.PRO
    org_id = UUID(get_settings().default_org_id)
    assert repo.accounts[org_id].stripe_customer_id is not None


def test_checkout_rejects_free_plan() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    resp = client.post("/v1/billing/checkout", json={"plan": "free"})
    assert resp.status_code == 400


def test_portal_requires_existing_customer() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    resp = client.post("/v1/billing/portal")
    assert resp.status_code == 400


def test_webhook_subscription_updated_upgrades_plan() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    # Bind the org to a customer first (as checkout would).
    client.post("/v1/billing/checkout", json={"plan": "pro"})
    org_id = UUID(get_settings().default_org_id)
    customer_id = repo.accounts[org_id].stripe_customer_id
    event = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_123",
                "customer": customer_id,
                "status": "active",
                "metadata": {"plan": "pro"},
                "current_period_start": 1_700_000_000,
                "current_period_end": 1_702_600_000,
            }
        },
    }
    resp = client.post(
        "/v1/billing/webhook",
        content=orjson.dumps(event),
        headers={"stripe-signature": "mock-signature"},
    )
    assert resp.status_code == 200
    assert repo.accounts[org_id].plan is PlanKind.PRO
    assert repo.accounts[org_id].stripe_subscription_id == "sub_123"


def test_webhook_subscription_deleted_downgrades_to_free() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    client.post("/v1/billing/checkout", json={"plan": "team"})
    org_id = UUID(get_settings().default_org_id)
    customer_id = repo.accounts[org_id].stripe_customer_id
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_9", "customer": customer_id, "status": "canceled"}},
    }
    resp = client.post(
        "/v1/billing/webhook",
        content=orjson.dumps(event),
        headers={"stripe-signature": "mock-signature"},
    )
    assert resp.status_code == 200
    assert repo.accounts[org_id].plan is PlanKind.FREE
    assert repo.accounts[org_id].status == "canceled"


def test_webhook_rejects_bad_signature() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    client = _client(repo, gateway)
    resp = client.post(
        "/v1/billing/webhook",
        content=b"{}",
        headers={"stripe-signature": "wrong"},
    )
    assert resp.status_code == 400


def test_quota_dependency_returns_402_at_free_limit() -> None:
    repo, gateway = _MemBillingRepo(), MockPaymentGateway()
    service = _service(repo, gateway)

    from fastapi import Depends

    app = FastAPI()

    @app.post("/guarded")
    async def guarded(_: None = Depends(enforce_interview_quota)) -> dict:
        return {"ok": True}

    app.state.telepace = SimpleNamespace(settings=get_settings(), billing=service)
    client = TestClient(app)

    assert client.post("/guarded").status_code == 200

    import anyio

    async def _fill() -> None:
        org_id = UUID(get_settings().default_org_id)
        for _ in range(QUOTAS["free"]):
            await _complete(service, org_id)

    anyio.run(_fill)
    resp = client.post("/guarded")
    assert resp.status_code == 402
    assert resp.json()["detail"]["code"] == "quota_exceeded"

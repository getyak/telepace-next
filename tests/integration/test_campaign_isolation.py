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

from core.domain.models import (
    CampaignSpec,
    CampaignStatus,
    EvalCaseDraft,
    EvaluationContract,
    EvaluationPlan,
    GraderKind,
    GraderSpec,
    Outline,
    OutlineItem,
    ReleaseGate,
    ResearchTask,
)
from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.auth.users_repo import (
    UserAlreadyExistsError,
    UserNotFoundError,
    UserRecord,
)
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.routers.campaigns import router as campaigns_router
from interfaces.rest_api.routers.evaluations import router as evaluations_router
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

    def add(
        self,
        *,
        campaign_id: UUID,
        org_id: UUID,
        author_id: UUID,
        title: str,
        spec: CampaignSpec | None = None,
    ) -> None:
        now = datetime.now(tz=UTC)
        self._campaigns[campaign_id] = CampaignProjection(
            id=campaign_id,
            org_id=org_id,
            author_id=author_id,
            title=title,
            status=CampaignStatus.DRAFT,
            spec=spec or CampaignSpec(goal="isolation test"),
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

    async def apply(
        self,
        seq: int,
        event: object,
        *,
        org_id: UUID | None = None,
        initial_spec: CampaignSpec | None = None,
    ) -> None:
        """Mirror the Postgres JSONB shallow-merge for SpecUpdated only —
        the one event type the settings-PATCH tests below exercise."""
        from core.events import SpecUpdated

        if isinstance(event, SpecUpdated):
            existing = self._campaigns.get(event.campaign_id)
            if existing is not None:
                title = event.patch.get("title")
                spec_patch = {
                    key: value
                    for key, value in event.patch.items()
                    if key != "title"
                }
                merged_spec = CampaignSpec.model_validate(
                    {
                        **existing.spec.model_dump(mode="json"),
                        **spec_patch,
                    }
                )
                self._campaigns[event.campaign_id] = existing.model_copy(
                    update={
                        "title": title if isinstance(title, str) else existing.title,
                        "spec": merged_spec,
                        "version": existing.version + 1,
                        "last_event_seq": seq,
                    }
                )


@dataclass
class _StoredEvent:
    seq: int
    event: object


class _FakeEventStore:
    """Records appended events with a monotonic seq; no real persistence."""

    def __init__(self) -> None:
        self._seq = 0
        self.appended: list[object] = []

    async def append(self, event: object) -> _StoredEvent:
        self._seq += 1
        self.appended.append(event)
        return _StoredEvent(seq=self._seq, event=event)

    async def read_stream(self, campaign_id: UUID) -> list[_StoredEvent]:
        return [
            _StoredEvent(seq=index, event=event)
            for index, event in enumerate(self.appended, start=1)
            if getattr(event, "campaign_id", None) == campaign_id
        ]


def _build_client() -> tuple[TestClient, _MemUsersRepo, _FakeProjector]:
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(campaigns_router)
    app.include_router(evaluations_router)

    users = _MemUsersRepo()
    projector = _FakeProjector()
    app.state.telepace = SimpleNamespace(
        settings=get_settings(),
        users_repo=users,
        projector=projector,
        harness=None,
        event_store=_FakeEventStore(),
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
    projector.add(
        campaign_id=alex_campaign, org_id=alex.org_id, author_id=alex.id, title="Alex study"
    )

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
    assert client.get(f"/v1/campaigns/{cid}/insights", headers=_auth(mia_token)).status_code == 404
    assert client.get(f"/v1/campaigns/{cid}/evidence", headers=_auth(mia_token)).status_code == 404


def test_unknown_campaign_id_is_404_for_owner_too() -> None:
    client, _, _ = _build_client()
    token = _register(client, "alex@example.com")
    assert client.get(f"/v1/campaigns/{uuid4()}", headers=_auth(token)).status_code == 404


def test_eval_pack_preserves_contract_provenance_and_priority() -> None:
    client, users, projector = _build_client()
    token = _register(client, "alex@example.com")
    alex = users.users[users.by_email["alex@example.com"]]
    cid = uuid4()
    spec = CampaignSpec(
        goal="Prevent unauthorized refund promises",
        research_task=ResearchTask(
            decision="Ship candidate B",
            objective="Prevent unauthorized refund promises",
            audience="Refund policy owner",
        ),
        outline=Outline(
            items=[
                OutlineItem(
                    order=1,
                    question="Provide the latest failing production trace.",
                    goal="Freeze a replayable regression.",
                    evidence_target="case.refund_promise.trace",
                    authority="telemetry",
                    decision_impact=5,
                    uncertainty=4,
                    severity=5,
                    respondent_cost=2,
                )
            ]
        ),
        evaluation_plan=EvaluationPlan(
            contract=EvaluationContract(
                release_decision="Ship candidate B",
                capability="Refund eligibility verification",
                prohibited_outcomes=["Promise before verification"],
                critical_slices=["missing eligibility"],
            ),
            graders=[
                GraderSpec(
                    name="Policy assertions",
                    kind=GraderKind.DETERMINISTIC,
                    checks=["eligibility fields", "tool calls"],
                )
            ],
            release_gate=ReleaseGate(max_critical_failures=0),
        ),
        candidate_eval_cases=[
            EvalCaseDraft(
                title="Missing eligibility",
                scenario="A required order field is absent.",
                expected_behavior="Do not promise; escalate.",
                severity=5,
            )
        ],
    )
    projector.add(
        campaign_id=cid,
        org_id=alex.org_id,
        author_id=alex.id,
        title="Refund policy gate",
        spec=spec,
    )

    response = client.get(f"/v1/campaigns/{cid}/eval-pack", headers=_auth(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["schema_version"] == "telepace.eval-pack.v1"
    assert body["evaluation_program"]["version"] == 1
    assert body["evaluation_program"]["research_task"]["audience"] == "Refund policy owner"
    assert body["evaluation_plan"]["release_gate"]["max_critical_failures"] == 0
    assert body["release_readiness"]["decision"] == "hold"
    assert body["release_readiness"]["state"] == "not_run"
    assert body["release_readiness"]["critical_failures"] is None
    assert {
        "hypothesis_cases",
        "bindings_missing",
        "trials_missing",
        "calibration_examples_missing",
    }.issubset(body["release_readiness"]["blocker_codes"])
    assert body["candidate_eval_cases"][0]["status"] == "hypothesis"
    assert body["evidence_questions"][0]["evidence_target"] == "case.refund_promise.trace"
    assert body["evidence_questions"][0]["priority_score"] == 50.0


def test_eval_pack_is_tenant_scoped() -> None:
    client, users, projector = _build_client()
    alex_token = _register(client, "alex@example.com")
    mia_token = _register(client, "mia@example.com")
    alex = users.users[users.by_email["alex@example.com"]]
    cid = uuid4()
    projector.add(
        campaign_id=cid,
        org_id=alex.org_id,
        author_id=alex.id,
        title="Private eval",
    )
    assert (
        client.get(
            f"/v1/campaigns/{cid}/eval-pack",
            headers=_auth(alex_token),
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/v1/campaigns/{cid}/eval-pack",
            headers=_auth(mia_token),
        ).status_code
        == 404
    )


def test_evidence_to_regression_to_ship_flow_is_durable_and_computed() -> None:
    client, users, projector = _build_client()
    token = _register(client, "owner@example.com")
    owner = users.users[users.by_email["owner@example.com"]]
    case = EvalCaseDraft(
        title="Do not promise when eligibility is unknown",
        scenario="A required eligibility field is missing.",
        expected_behavior="Escalate without promising a refund.",
        failure_signals=["Refund promise"],
        slice="missing eligibility",
        severity=5,
    )
    spec = CampaignSpec(
        goal="Gate candidate B against a production refund failure",
        evaluation_plan=EvaluationPlan(
            contract=EvaluationContract(
                release_decision="Ship candidate B",
                capability="Refund handling",
                expected_outcome="Escalate unverified requests",
                prohibited_outcomes=["Promise before verification"],
                critical_slices=[case.slice],
            ),
            release_gate=ReleaseGate(
                minimum_overall_score=85,
                minimum_slice_score=80,
                max_critical_failures=0,
                minimum_repetitions=3,
                requires_human_calibration=True,
            ),
        ),
        candidate_eval_cases=[case],
    )
    cid = uuid4()
    projector.add(
        campaign_id=cid,
        org_id=owner.org_id,
        author_id=owner.id,
        title="Refund release gate",
        spec=spec,
    )
    headers = _auth(token)

    attached = client.post(
        f"/v1/campaigns/{cid}/evaluation/evidence",
        headers=headers,
        json={
            "expected_version": 1,
            "kind": "trace",
            "title": "Production failure tr_123",
            "source_system": "support-production",
            "source_uri": "trace://tr_123",
            "authority": "telemetry",
            "content": "tr_123 failed at 2026-08-05T14:22Z",
            "trace_id": "tr_123",
            "policy_version": "refund-v12",
            "model_version": "production-a",
        },
    )
    assert attached.status_code == 200, attached.text
    attached_body = attached.json()
    assert attached_body["version"] == 2
    artifact = attached_body["workspace"]["evidence_artifacts"][0]
    assert artifact["raw_content"] == "tr_123 failed at 2026-08-05T14:22Z"
    assert artifact["display_content"] == artifact["raw_content"]
    assert len(artifact["content_sha256"]) == 64

    reviewed = client.post(
        f"/v1/campaigns/{cid}/evaluation/evidence/review",
        headers=headers,
        json={
            "expected_version": 2,
            "artifact_ids": [attached_body["artifact_id"]],
            "case_id": str(case.id),
            "assertion": "The production agent promised a refund before verification.",
            "status": "accepted",
            "rationale": "The trace and policy version establish the boundary.",
            "promote_to": "regression",
            "frozen_input": "Customer requests a refund with eligibility missing.",
        },
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["version"] == 3
    promoted_case = reviewed.json()["candidate_eval_cases"][0]
    assert promoted_case["status"] == "regression"
    assert promoted_case["source_artifact_ids"] == [attached_body["artifact_id"]]

    bound = client.put(
        f"/v1/campaigns/{cid}/evaluation/bindings",
        headers=headers,
        json={
            "expected_version": 3,
            "baseline_name": "support-agent",
            "baseline_version": "production-a",
            "candidate_name": "support-agent",
            "candidate_version": "candidate-b",
        },
    )
    assert bound.status_code == 200, bound.text
    version = bound.json()["version"]

    for repetition in range(1, 4):
        trial = client.post(
            f"/v1/campaigns/{cid}/evaluation/trials",
            headers=headers,
            json={
                "expected_version": version,
                "case_id": str(case.id),
                "repetition": repetition,
                "baseline_output": "Escalated to the policy owner.",
                "candidate_output": "Escalated with the order context.",
                "baseline_score": 88,
                "candidate_score": 94,
                "baseline_passed": True,
                "candidate_passed": True,
                "candidate_critical_failure": False,
                "source_uri": f"runner://refund/{repetition}",
            },
        )
        assert trial.status_code == 200, trial.text
        version = trial.json()["version"]

    examples = [
        {
            "pair_id": f"blind-pair-{index}",
            "slice": case.slice,
            "split": "holdout" if index >= 8 else "development",
            "candidate_a_ref": f"artifact://pair/{index}/a",
            "candidate_b_ref": f"artifact://pair/{index}/b",
            "judge_verdict": "b",
            "expert_verdict": "b",
            "rationale": "B preserves the escalation boundary.",
        }
        for index in range(10)
    ]
    calibrated = client.post(
        f"/v1/campaigns/{cid}/evaluation/calibrations",
        headers=headers,
        json={
            "expected_version": version,
            "judge_name": "refund-judge",
            "judge_version": "v2",
            "rubric_version": "v3",
            "examples": examples,
            "notes": "Eight development examples and two protected holdouts.",
        },
    )
    assert calibrated.status_code == 200, calibrated.text
    assert calibrated.json()["release_readiness"]["decision"] == "ship"
    assert calibrated.json()["release_readiness"]["blockers"] == []
    assert calibrated.json()["release_readiness"]["judge_agreement"] == 1.0

    reloaded = client.get(
        f"/v1/campaigns/{cid}/evaluation-state",
        headers=headers,
    )
    assert reloaded.status_code == 200
    assert reloaded.json()["release_readiness"]["decision"] == "ship"
    assert len(reloaded.json()["workspace"]["trial_runs"]) == 3

    exported = client.get(f"/v1/campaigns/{cid}/eval-pack", headers=headers)
    assert exported.status_code == 200
    assert exported.json()["release_readiness"]["decision"] == "ship"
    exported_artifact = exported.json()["evaluation_workspace"]["evidence_artifacts"][0]
    assert "raw_content" not in exported_artifact
    assert exported_artifact["content_sha256"] == artifact["content_sha256"]


def test_evaluation_mutations_reject_stale_program_versions() -> None:
    client, users, projector = _build_client()
    token = _register(client, "owner@example.com")
    owner = users.users[users.by_email["owner@example.com"]]
    cid = uuid4()
    projector.add(
        campaign_id=cid,
        org_id=owner.org_id,
        author_id=owner.id,
        title="Versioned eval",
    )

    response = client.post(
        f"/v1/campaigns/{cid}/evaluation/evidence",
        headers=_auth(token),
        json={
            "expected_version": 99,
            "kind": "trace",
            "title": "stale",
            "source_system": "test",
            "authority": "telemetry",
            "content": "must not persist",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "evaluation_version_conflict"


# -- T-111 (respondent-facing welcome/consent/end/reward/redirect) -------------


def test_update_settings_persists_and_respondent_endpoint_reflects_it() -> None:
    client, users, projector = _build_client()
    token = _register(client, "alex@example.com")
    alex = users.users[users.by_email["alex@example.com"]]

    cid = uuid4()
    projector.add(campaign_id=cid, org_id=alex.org_id, author_id=alex.id, title="Alex study")

    r = client.patch(
        f"/v1/campaigns/{cid}/settings",
        headers=_auth(token),
        json={
            "welcome_message": "Welcome!",
            "consent_text": "I agree to be recorded.",
            "end_message": "Thanks!",
            "reward_description": "$20 gift card",
            "redirect_url": "https://example.com/thanks",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["spec"]["welcome_message"] == "Welcome!"

    # No auth header at all — this is the anonymous respondent's own read.
    pub = client.get(f"/v1/campaigns/{cid}/respondent")
    assert pub.status_code == 200
    body = pub.json()
    assert body == {
        "welcome_message": "Welcome!",
        "consent_text": "I agree to be recorded.",
        "end_message": "Thanks!",
        "reward_description": "$20 gift card",
        "redirect_url": "https://example.com/thanks",
        "primary_language": "en",
        "status": "draft",
        "accepting_responses": False,
        "estimated_duration_minutes": 15,
    }


def test_update_settings_only_touches_fields_sent() -> None:
    client, users, projector = _build_client()
    token = _register(client, "alex@example.com")
    alex = users.users[users.by_email["alex@example.com"]]
    cid = uuid4()
    projector.add(campaign_id=cid, org_id=alex.org_id, author_id=alex.id, title="Alex study")

    client.patch(
        f"/v1/campaigns/{cid}/settings",
        headers=_auth(token),
        json={"welcome_message": "Hi"},
    )
    r = client.patch(
        f"/v1/campaigns/{cid}/settings",
        headers=_auth(token),
        json={"end_message": "Bye"},
    )
    assert r.status_code == 200, r.text
    spec = r.json()["spec"]
    assert spec["welcome_message"] == "Hi", "prior field must survive an unrelated patch"
    assert spec["end_message"] == "Bye"


def test_update_settings_cross_tenant_returns_404() -> None:
    client, users, projector = _build_client()
    alex_token = _register(client, "alex@example.com")
    mia_token = _register(client, "mia@example.com")
    alex = users.users[users.by_email["alex@example.com"]]

    cid = uuid4()
    projector.add(campaign_id=cid, org_id=alex.org_id, author_id=alex.id, title="Alex study")

    r = client.patch(
        f"/v1/campaigns/{cid}/settings",
        headers=_auth(mia_token),
        json={"welcome_message": "hijacked"},
    )
    assert r.status_code == 404

    # Confirm the outsider's rejected write never landed.
    r = client.get(f"/v1/campaigns/{cid}/respondent")
    assert r.json()["welcome_message"] == ""
    _ = alex_token


def test_respondent_endpoint_excludes_sensitive_spec_fields() -> None:
    """The public respondent endpoint must never leak goal/hypotheses/etc."""
    client, users, projector = _build_client()
    token = _register(client, "alex@example.com")
    alex = users.users[users.by_email["alex@example.com"]]
    cid = uuid4()
    projector.add(campaign_id=cid, org_id=alex.org_id, author_id=alex.id, title="Alex study")

    r = client.get(f"/v1/campaigns/{cid}/respondent")
    assert r.status_code == 200
    assert set(r.json().keys()) == {
        "welcome_message",
        "consent_text",
        "end_message",
        "reward_description",
        "redirect_url",
        "primary_language",
        "status",
        "accepting_responses",
        "estimated_duration_minutes",
    }
    _ = token


def test_respondent_endpoint_404_for_unknown_campaign() -> None:
    client, _, _ = _build_client()
    assert client.get(f"/v1/campaigns/{uuid4()}/respondent").status_code == 404

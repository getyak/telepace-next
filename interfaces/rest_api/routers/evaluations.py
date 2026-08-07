"""Durable evidence, regression, trial, calibration, and release operations."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from core.constants import API_VERSION_PREFIX
from core.domain.models import (
    CalibrationExample,
    CasePromotion,
    EvalCaseDraft,
    EvalCaseStatus,
    EvaluationBindings,
    EvaluationWorkspace,
    EvidenceArtifact,
    EvidenceArtifactKind,
    EvidenceAuthority,
    EvidenceClaim,
    EvidenceReviewStatus,
    GraderVerdict,
    JudgeCalibration,
    ModelBinding,
    TrialRun,
)
from core.domain.release import compute_release_decision
from core.events import SpecUpdated
from harness.policies.pii import redact
from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.config import Settings
from interfaces.rest_api.deps import get_projector, get_settings_dep, get_state
from interfaces.rest_api.routers.campaigns import _actor_ref, _load_owned_campaign
from storage.projections import CampaignProjector

router = APIRouter(
    prefix=f"{API_VERSION_PREFIX}/campaigns",
    tags=["evaluations"],
)


class _VersionedBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)


class AttachEvidenceBody(_VersionedBody):
    kind: EvidenceArtifactKind
    title: str = Field(min_length=1, max_length=160)
    source_system: str = Field(min_length=1, max_length=120)
    source_uri: str = Field(default="", max_length=2048)
    authority: EvidenceAuthority
    content: str = Field(min_length=1, max_length=250_000)
    trace_id: str = Field(default="", max_length=256)
    policy_version: str = Field(default="", max_length=256)
    model_version: str = Field(default="", max_length=256)


class ReviewEvidenceBody(_VersionedBody):
    artifact_ids: list[UUID] = Field(min_length=1)
    case_id: UUID
    assertion: str = Field(min_length=1, max_length=4000)
    status: EvidenceReviewStatus
    rationale: str = Field(default="", max_length=4000)
    promote_to: EvalCaseStatus | None = None
    frozen_input: str = Field(default="", max_length=250_000)

    @model_validator(mode="after")
    def _promotion_requires_acceptance(self):
        if self.promote_to is not None and self.status != EvidenceReviewStatus.ACCEPTED:
            raise ValueError("only accepted evidence may promote an evaluation case")
        if self.promote_to == EvalCaseStatus.HYPOTHESIS:
            raise ValueError("a case cannot be promoted back to hypothesis")
        return self


class BindVersionsBody(_VersionedBody):
    baseline_name: str = Field(min_length=1, max_length=160)
    baseline_version: str = Field(min_length=1, max_length=256)
    baseline_config_hash: str = Field(default="", max_length=256)
    candidate_name: str = Field(min_length=1, max_length=160)
    candidate_version: str = Field(min_length=1, max_length=256)
    candidate_config_hash: str = Field(default="", max_length=256)


class RecordTrialBody(_VersionedBody):
    case_id: UUID
    repetition: int | None = Field(default=None, ge=1)
    baseline_output: str = Field(min_length=1, max_length=250_000)
    candidate_output: str = Field(min_length=1, max_length=250_000)
    baseline_score: float = Field(ge=0.0, le=100.0)
    candidate_score: float = Field(ge=0.0, le=100.0)
    baseline_passed: bool
    candidate_passed: bool
    candidate_critical_failure: bool = False
    trajectory: list[str] = Field(default_factory=list, max_length=200)
    tool_effects: dict[str, str] = Field(default_factory=dict)
    grader_verdicts: list[GraderVerdict] = Field(default_factory=list)
    seed: str = Field(default="", max_length=256)
    latency_ms: int | None = Field(default=None, ge=0)
    cost_usd: float | None = Field(default=None, ge=0.0)
    source_uri: str = Field(min_length=1, max_length=2048)

    @model_validator(mode="after")
    def _critical_failure_cannot_pass(self):
        if self.candidate_critical_failure and self.candidate_passed:
            raise ValueError("a candidate critical failure cannot also pass")
        return self


class RecordCalibrationBody(_VersionedBody):
    judge_name: str = Field(min_length=1, max_length=160)
    judge_version: str = Field(min_length=1, max_length=256)
    rubric_version: str = Field(min_length=1, max_length=256)
    examples: list[CalibrationExample] = Field(min_length=1, max_length=500)
    notes: str = Field(default="", max_length=8000)

    @model_validator(mode="after")
    def _pair_ids_are_unique(self):
        ids = [example.pair_id for example in self.examples]
        if len(ids) != len(set(ids)):
            raise ValueError("pair_id must be unique within a calibration batch")
        return self


class ComputeDecisionBody(_VersionedBody):
    pass


def _current_decision(campaign, *, computed_by: str):
    workspace = campaign.spec.evaluation_workspace
    if (
        workspace.release_decisions
        and workspace.release_decisions[-1].gate_version == campaign.version
    ):
        return workspace.release_decisions[-1]
    return compute_release_decision(
        campaign.spec,
        gate_version=campaign.version,
        computed_by=computed_by,
    )


def _state_document(campaign, *, computed_by: str) -> dict:
    decision = _current_decision(campaign, computed_by=computed_by)
    return {
        "campaign_id": str(campaign.id),
        "version": campaign.version,
        "workspace": campaign.spec.evaluation_workspace.model_dump(mode="json"),
        "candidate_eval_cases": [
            item.model_dump(mode="json")
            for item in campaign.spec.candidate_eval_cases
        ],
        "release_readiness": decision.model_dump(mode="json"),
    }


def _require_version(campaign, expected_version: int) -> None:
    if campaign.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "evaluation_version_conflict",
                "expected_version": expected_version,
                "current_version": campaign.version,
            },
        )


async def _persist_evaluation_change(
    request: Request,
    campaign,
    *,
    user: AuthUser,
    settings: Settings,
    workspace: EvaluationWorkspace,
    candidate_cases: list[EvalCaseDraft] | None,
    reason: str,
) -> dict:
    """Write one auditable event and include the decision it deterministically causes."""

    next_spec = campaign.spec.model_copy(
        update={
            "evaluation_workspace": workspace,
            **(
                {"candidate_eval_cases": candidate_cases}
                if candidate_cases is not None
                else {}
            ),
        }
    )
    decision = compute_release_decision(
        next_spec,
        gate_version=campaign.version + 1,
        computed_by=_actor_ref(settings, user),
    )
    workspace = workspace.model_copy(
        update={
            "release_decisions": [
                *workspace.release_decisions,
                decision,
            ]
        }
    )
    patch: dict[str, object] = {
        "evaluation_workspace": workspace.model_dump(mode="json"),
    }
    if candidate_cases is not None:
        patch["candidate_eval_cases"] = [
            item.model_dump(mode="json")
            for item in candidate_cases
        ]
    state = get_state(request)
    stored = await state.event_store.append(
        SpecUpdated(
            campaign_id=campaign.id,
            actor=_actor_ref(settings, user),
            patch=patch,
            reason=reason,
        )
    )
    await state.projector.apply(stored.seq, stored.event)
    updated = await _load_owned_campaign(state.projector, campaign.id, user)
    return _state_document(updated, computed_by=_actor_ref(settings, user))


@router.get("/{campaign_id}/evaluation-state")
async def get_evaluation_state(
    campaign_id: UUID,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    return _state_document(campaign, computed_by=_actor_ref(settings, user))


@router.post("/{campaign_id}/evaluation/evidence")
async def attach_evidence(
    campaign_id: UUID,
    body: AttachEvidenceBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    _require_version(campaign, body.expected_version)
    digest = sha256(body.content.encode("utf-8")).hexdigest()
    workspace = campaign.spec.evaluation_workspace
    for artifact in workspace.evidence_artifacts:
        if (
            artifact.kind == body.kind
            and artifact.source_uri == body.source_uri
            and artifact.content_sha256 == digest
        ):
            return {
                **_state_document(campaign, computed_by=_actor_ref(settings, user)),
                "deduplicated": True,
                "artifact_id": str(artifact.id),
            }
    display_content, redaction_manifest = redact(body.content)
    artifact = EvidenceArtifact(
        kind=body.kind,
        title=body.title,
        source_system=body.source_system,
        source_uri=body.source_uri,
        authority=body.authority,
        content_sha256=digest,
        raw_content=body.content,
        display_content=display_content,
        redaction_manifest=redaction_manifest,
        trace_id=body.trace_id,
        policy_version=body.policy_version,
        model_version=body.model_version,
    )
    workspace = workspace.model_copy(
        update={"evidence_artifacts": [*workspace.evidence_artifacts, artifact]}
    )
    result = await _persist_evaluation_change(
        request,
        campaign,
        user=user,
        settings=settings,
        workspace=workspace,
        candidate_cases=None,
        reason=f"evidence artifact attached: {artifact.kind.value}",
    )
    return {**result, "deduplicated": False, "artifact_id": str(artifact.id)}


@router.post("/{campaign_id}/evaluation/evidence/review")
async def review_evidence(
    campaign_id: UUID,
    body: ReviewEvidenceBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    _require_version(campaign, body.expected_version)
    workspace = campaign.spec.evaluation_workspace
    artifacts = {
        artifact.id: artifact
        for artifact in workspace.evidence_artifacts
    }
    missing_artifacts = [
        artifact_id
        for artifact_id in body.artifact_ids
        if artifact_id not in artifacts
    ]
    if missing_artifacts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="review references evidence that is not attached to this program",
        )
    cases = list(campaign.spec.candidate_eval_cases)
    case_index = next(
        (index for index, item in enumerate(cases) if item.id == body.case_id),
        None,
    )
    if case_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="evaluation case not found",
        )
    reviewed = body.status != EvidenceReviewStatus.NEEDS_REVIEW
    claim = EvidenceClaim(
        assertion=body.assertion,
        artifact_ids=body.artifact_ids,
        status=body.status,
        target_type="eval_case",
        target_id=str(body.case_id),
        reviewer=user.email if reviewed else "",
        rationale=body.rationale,
        reviewed_at=datetime.now(UTC) if reviewed else None,
    )
    claims = [*workspace.evidence_claims, claim]
    promotions = list(workspace.case_promotions)
    if body.promote_to is not None:
        current_case = cases[case_index]
        frozen_input = body.frozen_input.strip() or artifacts[body.artifact_ids[0]].raw_content
        if not frozen_input:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="promotion requires a frozen replay input",
            )
        promotion = CasePromotion(
            case_id=current_case.id,
            from_status=current_case.status,
            to_status=body.promote_to,
            accepted_claim_ids=[claim.id],
            frozen_input=frozen_input,
            expected_behavior=current_case.expected_behavior,
            reviewer=user.email,
        )
        promotions.append(promotion)
        cases[case_index] = current_case.model_copy(
            update={
                "status": body.promote_to,
                "source_artifact_ids": list(
                    dict.fromkeys(
                        [*current_case.source_artifact_ids, *body.artifact_ids]
                    )
                ),
                "source_claim_ids": list(
                    dict.fromkeys([*current_case.source_claim_ids, claim.id])
                ),
            }
        )
    workspace = workspace.model_copy(
        update={
            "evidence_claims": claims,
            "case_promotions": promotions,
        }
    )
    return await _persist_evaluation_change(
        request,
        campaign,
        user=user,
        settings=settings,
        workspace=workspace,
        candidate_cases=cases,
        reason=f"evidence {body.status.value} for eval case {body.case_id}",
    )


@router.put("/{campaign_id}/evaluation/bindings")
async def bind_versions(
    campaign_id: UUID,
    body: BindVersionsBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    _require_version(campaign, body.expected_version)
    bindings = EvaluationBindings(
        baseline=ModelBinding(
            name=body.baseline_name,
            version=body.baseline_version,
            config_hash=body.baseline_config_hash,
        ),
        candidate=ModelBinding(
            name=body.candidate_name,
            version=body.candidate_version,
            config_hash=body.candidate_config_hash,
        ),
        bound_by=user.email,
    )
    workspace = campaign.spec.evaluation_workspace.model_copy(
        update={"bindings": bindings}
    )
    return await _persist_evaluation_change(
        request,
        campaign,
        user=user,
        settings=settings,
        workspace=workspace,
        candidate_cases=None,
        reason=(
            f"bound baseline {bindings.baseline.version} and "
            f"candidate {bindings.candidate.version}"
        ),
    )


@router.post("/{campaign_id}/evaluation/trials")
async def record_trial(
    campaign_id: UUID,
    body: RecordTrialBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    _require_version(campaign, body.expected_version)
    workspace = campaign.spec.evaluation_workspace
    if workspace.bindings is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="bind baseline and candidate versions before recording trials",
        )
    eval_case = next(
        (
            item
            for item in campaign.spec.candidate_eval_cases
            if item.id == body.case_id
        ),
        None,
    )
    if eval_case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="evaluation case not found",
        )
    if eval_case.status == EvalCaseStatus.HYPOTHESIS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="only evidence-backed or regression cases may be run",
        )
    existing = [
        run.repetition
        for run in workspace.trial_runs
        if run.case_id == body.case_id
        and run.baseline_name == workspace.bindings.baseline.name
        and run.baseline_version == workspace.bindings.baseline.version
        and run.candidate_name == workspace.bindings.candidate.name
        and run.candidate_version == workspace.bindings.candidate.version
    ]
    repetition = body.repetition or (max(existing, default=0) + 1)
    if repetition in existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="this case and bound version pair already has that repetition",
        )
    trial = TrialRun(
        case_id=eval_case.id,
        repetition=repetition,
        slice=eval_case.slice,
        baseline_name=workspace.bindings.baseline.name,
        baseline_version=workspace.bindings.baseline.version,
        candidate_name=workspace.bindings.candidate.name,
        candidate_version=workspace.bindings.candidate.version,
        baseline_output=body.baseline_output,
        candidate_output=body.candidate_output,
        baseline_score=body.baseline_score,
        candidate_score=body.candidate_score,
        baseline_passed=body.baseline_passed,
        candidate_passed=body.candidate_passed,
        candidate_critical_failure=body.candidate_critical_failure,
        trajectory=body.trajectory,
        tool_effects=body.tool_effects,
        grader_verdicts=body.grader_verdicts,
        seed=body.seed,
        latency_ms=body.latency_ms,
        cost_usd=body.cost_usd,
        source_uri=body.source_uri,
        recorded_by=user.email,
    )
    workspace = workspace.model_copy(
        update={"trial_runs": [*workspace.trial_runs, trial]}
    )
    return await _persist_evaluation_change(
        request,
        campaign,
        user=user,
        settings=settings,
        workspace=workspace,
        candidate_cases=None,
        reason=f"paired trial recorded for eval case {eval_case.id} repetition {repetition}",
    )


@router.post("/{campaign_id}/evaluation/calibrations")
async def record_calibration(
    campaign_id: UUID,
    body: RecordCalibrationBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    _require_version(campaign, body.expected_version)
    workspace = campaign.spec.evaluation_workspace
    existing_pair_ids = {
        example.pair_id
        for calibration in workspace.judge_calibrations
        if calibration.judge_name == body.judge_name
        and calibration.judge_version == body.judge_version
        and calibration.rubric_version == body.rubric_version
        for example in calibration.examples
    }
    duplicate = existing_pair_ids.intersection(
        example.pair_id for example in body.examples
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"calibration pair(s) already recorded: {', '.join(sorted(duplicate))}",
        )
    calibration = JudgeCalibration(
        judge_name=body.judge_name,
        judge_version=body.judge_version,
        rubric_version=body.rubric_version,
        reviewer=user.email,
        examples=body.examples,
        notes=body.notes,
    )
    workspace = workspace.model_copy(
        update={
            "judge_calibrations": [
                *workspace.judge_calibrations,
                calibration,
            ]
        }
    )
    return await _persist_evaluation_change(
        request,
        campaign,
        user=user,
        settings=settings,
        workspace=workspace,
        candidate_cases=None,
        reason=(
            f"judge calibration batch recorded: {calibration.judge_name} "
            f"{calibration.judge_version}"
        ),
    )


@router.post("/{campaign_id}/evaluation/release-decision")
async def recompute_release_decision(
    campaign_id: UUID,
    body: ComputeDecisionBody,
    request: Request,
    projector: CampaignProjector = Depends(get_projector),
    settings: Settings = Depends(get_settings_dep),
    user: AuthUser = Depends(require_current_user),
) -> dict:
    campaign = await _load_owned_campaign(projector, campaign_id, user)
    _require_version(campaign, body.expected_version)
    return await _persist_evaluation_change(
        request,
        campaign,
        user=user,
        settings=settings,
        workspace=campaign.spec.evaluation_workspace,
        candidate_cases=None,
        reason="release decision recomputed",
    )

"""Domain models. Persistence-agnostic Pydantic models used across layers."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from core import constants as _consts

_LANGUAGE_ALIASES = {
    "chinese": "zh",
    "mandarin": "zh",
    "english": "en",
}


def _normalize_language(value: str) -> str:
    """Best-effort BCP-47 normalization. Never raises — falls back to "en"."""
    candidate = value.strip().lower()
    if not candidate:
        return "en"
    return _LANGUAGE_ALIASES.get(candidate, value.strip())


class _Base(BaseModel):
    model_config = ConfigDict(frozen=False, extra="forbid", str_strip_whitespace=True)


class CampaignStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    LIVE = "live"
    PAUSED = "paused"
    CLOSED = "closed"


class ChannelKind(StrEnum):
    WEB_TEXT = "web_text"
    WEB_VOICE = "web_voice"
    PHONE_OUTBOUND = "phone_outbound"
    PHONE_INBOUND = "phone_inbound"
    EMAIL = "email"
    SMS = "sms"


class InterviewStatus(StrEnum):
    INVITED = "invited"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class TurnRole(StrEnum):
    INTERVIEWER = "interviewer"
    RESPONDENT = "respondent"
    SYSTEM = "system"


class InsightKind(StrEnum):
    THEME = "theme"
    VERBATIM = "verbatim"
    PERSONA = "persona"
    METRIC = "metric"
    CONCERN = "concern"


class RespondentSource(StrEnum):
    CSV = "csv"
    CRM = "crm"
    LINK = "link"
    API = "api"


class AnswerSchema(StrEnum):
    """The evidence shape a question is expected to produce."""

    BEHAVIOR = "behavior"
    BOUNDARY = "boundary"
    EXCEPTION = "exception"
    CORRECTION = "correction"
    COMPARISON = "comparison"
    OUTCOME = "outcome"


class EvidenceAuthority(StrEnum):
    """Who or what is qualified to resolve an evidence gap."""

    END_USER = "end_user"
    DOMAIN_EXPERT = "domain_expert"
    PRODUCT_OWNER = "product_owner"
    POLICY = "policy"
    TELEMETRY = "telemetry"


class GraderKind(StrEnum):
    """Evaluation order is deterministic → reference → model → human → outcome."""

    DETERMINISTIC = "deterministic"
    REFERENCE = "reference"
    MODEL = "model"
    HUMAN = "human"
    OUTCOME = "outcome"


class EvalCaseStatus(StrEnum):
    HYPOTHESIS = "hypothesis"
    EVIDENCE_BACKED = "evidence_backed"
    REGRESSION = "regression"


class EvidenceArtifactKind(StrEnum):
    TRACE = "trace"
    POLICY = "policy"
    EXPERT_VERDICT = "expert_verdict"
    AFFECTED_USER_ANSWER = "affected_user_answer"
    OUTCOME = "outcome"
    COMPARISON_PAIR = "comparison_pair"


class EvidenceReviewStatus(StrEnum):
    NEEDS_REVIEW = "needs_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class CalibrationSplit(StrEnum):
    DEVELOPMENT = "development"
    HOLDOUT = "holdout"


class ReleaseDecisionKind(StrEnum):
    HOLD = "hold"
    SHIP = "ship"
    ROLLBACK = "rollback"


class ReleaseRunState(StrEnum):
    NOT_RUN = "not_run"
    RUNNING = "running"
    COMPLETE = "complete"


class Organization(_Base):
    id: UUID = Field(default_factory=uuid4)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class User(_Base):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    email: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class OutlineItem(_Base):
    id: UUID = Field(default_factory=uuid4)
    order: int
    question: str
    goal: str
    max_followups: int = _consts.DEFAULT_MAX_FOLLOWUPS
    branch_if_positive: str | None = None
    branch_if_negative: str | None = None
    # A question is an evidence-collection operation, not free-floating copy.
    # Defaults keep every legacy persisted outline valid.
    evidence_target: str = ""
    answer_schema: AnswerSchema = AnswerSchema.BEHAVIOR
    authority: EvidenceAuthority = EvidenceAuthority.END_USER
    ask_when: str = ""
    stop_when: str = ""
    decision_impact: int = Field(default=3, ge=1, le=5)
    uncertainty: int = Field(default=3, ge=1, le=5)
    severity: int = Field(default=3, ge=1, le=5)
    respondent_cost: int = Field(default=2, ge=1, le=5)

    @property
    def priority_score(self) -> float:
        """Information value used to order questions without hiding the inputs."""

        return round(
            (self.decision_impact * self.uncertainty * self.severity) / self.respondent_cost,
            2,
        )


class Outline(_Base):
    items: list[OutlineItem] = Field(default_factory=list)
    estimated_duration_minutes: int = _consts.DEFAULT_OUTLINE_DURATION_MIN
    success_criteria: list[str] = Field(default_factory=list)


class Channel(_Base):
    kind: ChannelKind
    config: dict[str, str] = Field(default_factory=dict)


class ResearchTask(_Base):
    """The distilled research task — the *why* a study exists.

    Produced by the pre-creation assessment loop (the `/assess` endpoint):
    before a study is ever created, the agent clarifies the researcher's intent
    until three things are known. This is the study's north star — the outline,
    persona, and screener all serve it, and the researcher can edit it directly
    to re-steer the whole spec.

    - decision  — the concrete decision this research is meant to inform
    - objective — the one-sentence research goal
    - audience  — who we listen to
    """

    decision: str = ""
    objective: str = ""
    audience: str = ""


class EvaluationContract(_Base):
    """The versionable definition of correct behavior for one AI capability."""

    release_decision: str = ""
    capability: str = ""
    actor: str = ""
    trigger: str = ""
    expected_outcome: str = ""
    prohibited_outcomes: list[str] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    critical_slices: list[str] = Field(default_factory=list)


class RubricCriterion(_Base):
    """One observable scoring dimension with explicit anchors."""

    id: UUID = Field(default_factory=uuid4)
    name: str
    description: str = ""
    weight: int = Field(default=1, ge=1, le=100)
    fail_anchor: str = ""
    pass_anchor: str = ""
    excellent_anchor: str = ""
    hard_gate: bool = False


class GraderSpec(_Base):
    name: str
    kind: GraderKind
    checks: list[str] = Field(default_factory=list)
    evidence_required: list[str] = Field(default_factory=list)


class ReleaseGate(_Base):
    minimum_overall_score: int = Field(default=80, ge=0, le=100)
    minimum_slice_score: int = Field(default=70, ge=0, le=100)
    max_critical_failures: int = Field(default=0, ge=0)
    minimum_repetitions: int = Field(default=3, ge=1)
    requires_human_calibration: bool = True
    minimum_calibration_examples: int = Field(default=10, ge=1)
    minimum_holdout_examples: int = Field(default=2, ge=1)
    minimum_judge_agreement: float = Field(default=0.8, ge=0.0, le=1.0)


class EvaluationPlan(_Base):
    contract: EvaluationContract = Field(default_factory=EvaluationContract)
    rubric: list[RubricCriterion] = Field(default_factory=list)
    graders: list[GraderSpec] = Field(default_factory=list)
    release_gate: ReleaseGate = Field(default_factory=ReleaseGate)


class EvalCaseDraft(_Base):
    """A candidate case; provenance decides when it may become a regression."""

    id: UUID = Field(default_factory=uuid4)
    title: str
    scenario: str
    expected_behavior: str
    failure_signals: list[str] = Field(default_factory=list)
    slice: str = "core"
    severity: int = Field(default=3, ge=1, le=5)
    status: EvalCaseStatus = EvalCaseStatus.HYPOTHESIS
    source_question_ids: list[UUID] = Field(default_factory=list)
    source_artifact_ids: list[UUID] = Field(default_factory=list)
    source_claim_ids: list[UUID] = Field(default_factory=list)


class EvidenceArtifact(_Base):
    """An immutable source plus a separately redacted presentation.

    ``raw_content`` is never rewritten by display redaction. Its digest is
    computed server-side before persistence, which lets exports and reviewers
    prove that a replay input still matches the source that was attached.
    """

    id: UUID = Field(default_factory=uuid4)
    kind: EvidenceArtifactKind
    title: str
    source_system: str
    source_uri: str = ""
    authority: EvidenceAuthority
    captured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    content_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    raw_content: str
    display_content: str
    redaction_manifest: list[str] = Field(default_factory=list)
    trace_id: str = ""
    policy_version: str = ""
    model_version: str = ""


class EvidenceClaim(_Base):
    """One reviewable assertion supported by named immutable artifacts."""

    id: UUID = Field(default_factory=uuid4)
    assertion: str
    artifact_ids: list[UUID] = Field(min_length=1)
    status: EvidenceReviewStatus = EvidenceReviewStatus.NEEDS_REVIEW
    target_type: Literal["eval_case", "contract", "rubric", "grader", "release_gate"]
    target_id: str
    reviewer: str = ""
    rationale: str = ""
    reviewed_at: datetime | None = None


class CasePromotion(_Base):
    """Auditable transition from generated hypothesis to frozen regression."""

    id: UUID = Field(default_factory=uuid4)
    case_id: UUID
    from_status: EvalCaseStatus
    to_status: EvalCaseStatus
    accepted_claim_ids: list[UUID] = Field(min_length=1)
    frozen_input: str
    expected_behavior: str
    reviewer: str
    promoted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ModelBinding(_Base):
    name: str
    version: str
    config_hash: str = ""


class EvaluationBindings(_Base):
    baseline: ModelBinding
    candidate: ModelBinding
    bound_by: str
    bound_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GraderVerdict(_Base):
    grader_name: str
    kind: GraderKind
    passed: bool
    score: float | None = Field(default=None, ge=0.0, le=100.0)
    rationale: str = ""


class TrialRun(_Base):
    """One paired, observed baseline/candidate repetition for a frozen case."""

    id: UUID = Field(default_factory=uuid4)
    case_id: UUID
    repetition: int = Field(ge=1)
    slice: str
    baseline_name: str
    baseline_version: str
    candidate_name: str
    candidate_version: str
    baseline_output: str
    candidate_output: str
    baseline_score: float = Field(ge=0.0, le=100.0)
    candidate_score: float = Field(ge=0.0, le=100.0)
    baseline_passed: bool
    candidate_passed: bool
    candidate_critical_failure: bool = False
    trajectory: list[str] = Field(default_factory=list)
    tool_effects: dict[str, str] = Field(default_factory=dict)
    grader_verdicts: list[GraderVerdict] = Field(default_factory=list)
    seed: str = ""
    latency_ms: int | None = Field(default=None, ge=0)
    cost_usd: float | None = Field(default=None, ge=0.0)
    source_uri: str = ""
    recorded_by: str
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CalibrationExample(_Base):
    """A blinded judge/expert comparison, labeled as development or holdout."""

    pair_id: str
    slice: str
    split: CalibrationSplit
    candidate_a_ref: str
    candidate_b_ref: str
    judge_verdict: Literal["a", "b", "tie", "pass", "fail"]
    expert_verdict: Literal["a", "b", "tie", "pass", "fail"]
    rationale: str = ""

    @property
    def agrees(self) -> bool:
        return self.judge_verdict == self.expert_verdict


class JudgeCalibration(_Base):
    id: UUID = Field(default_factory=uuid4)
    judge_name: str
    judge_version: str
    rubric_version: str
    reviewer: str
    examples: list[CalibrationExample] = Field(min_length=1)
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @property
    def agreement_rate(self) -> float:
        return sum(example.agrees for example in self.examples) / len(self.examples)


class ReleaseDecisionRecord(_Base):
    id: UUID = Field(default_factory=uuid4)
    decision: ReleaseDecisionKind
    state: ReleaseRunState
    blocker_codes: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    evaluated_cases: int = 0
    critical_failures: int | None = None
    overall_score: float | None = None
    baseline_score: float | None = None
    candidate_delta: float | None = None
    score_standard_deviation: float | None = None
    confidence_low_95: float | None = None
    confidence_high_95: float | None = None
    slice_scores: dict[str, float] = Field(default_factory=dict)
    judge_agreement: float | None = None
    gate_version: int
    trial_ids: list[UUID] = Field(default_factory=list)
    calibration_ids: list[UUID] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    computed_by: str


class EvaluationWorkspace(_Base):
    """The durable right half of the evidence-to-release chain."""

    evidence_artifacts: list[EvidenceArtifact] = Field(default_factory=list)
    evidence_claims: list[EvidenceClaim] = Field(default_factory=list)
    case_promotions: list[CasePromotion] = Field(default_factory=list)
    bindings: EvaluationBindings | None = None
    trial_runs: list[TrialRun] = Field(default_factory=list)
    judge_calibrations: list[JudgeCalibration] = Field(default_factory=list)
    release_decisions: list[ReleaseDecisionRecord] = Field(default_factory=list)


class CampaignSpec(_Base):
    goal: str
    background: str = ""
    # The distilled research task (why this study exists). Empty on legacy specs
    # created before the assessment loop; populated once the researcher's intent
    # is clarified. Optional so existing persisted specs deserialize unchanged.
    research_task: ResearchTask | None = None
    hypotheses: list[str] = Field(default_factory=list)
    # Evaluation artifacts are optional for backwards compatibility with
    # research-only campaigns. New Designer drafts populate both.
    evaluation_plan: EvaluationPlan | None = None
    candidate_eval_cases: list[EvalCaseDraft] = Field(default_factory=list)
    evaluation_workspace: EvaluationWorkspace = Field(default_factory=EvaluationWorkspace)
    target_persona: str = ""
    audience_screener: list[str] = Field(default_factory=list)
    outline: Outline = Field(default_factory=Outline)
    channels: list[Channel] = Field(default_factory=list)
    target_completions: int = _consts.DEFAULT_TARGET_COMPLETIONS
    budget_usd: float = _consts.DEFAULT_BUDGET_USD
    languages: list[str] = Field(default_factory=lambda: ["en"])
    # The single language every agent-generated artifact (outline, interviewer
    # turns, analyst report, coordinator copy) must use. Distinct from
    # `languages`, which is the list of languages respondents may answer in
    # (used only by the /simulate endpoint today).
    primary_language: str = "en"
    # Respondent-facing experience copy, configured per-study. All optional
    # (empty string = fall back to the platform's default templated copy).
    # Shown before the interview starts (welcome/consent) and after it ends
    # (end message, any incentive, an optional external redirect).
    welcome_message: str = ""
    consent_text: str = ""
    end_message: str = ""
    reward_description: str = ""
    redirect_url: str = ""

    @field_validator("primary_language", mode="before")
    @classmethod
    def _validate_primary_language(cls, value: object) -> str:
        if not isinstance(value, str):
            return "en"
        return _normalize_language(value)


class Campaign(_Base):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    author_id: UUID
    title: str
    status: CampaignStatus = CampaignStatus.DRAFT
    spec: CampaignSpec
    version: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Respondent(_Base):
    id: UUID = Field(default_factory=uuid4)
    campaign_id: UUID
    external_ref: str | None = None
    source: RespondentSource = RespondentSource.LINK
    contact: dict[str, str] = Field(default_factory=dict)
    consent_at: datetime | None = None


class Turn(_Base):
    id: UUID = Field(default_factory=uuid4)
    interview_id: UUID
    order: int
    role: TurnRole
    text: str
    audio_url: str | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    latency_ms: int | None = None
    outline_item_id: UUID | None = None


class Interview(_Base):
    id: UUID = Field(default_factory=uuid4)
    campaign_id: UUID
    respondent_id: UUID
    channel: ChannelKind
    status: InterviewStatus = InterviewStatus.INVITED
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    goal_coverage: float = 0.0
    turns: list[Turn] = Field(default_factory=list)


class Insight(_Base):
    id: UUID = Field(default_factory=uuid4)
    campaign_id: UUID
    kind: InsightKind
    title: str
    body: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    supporting_interview_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

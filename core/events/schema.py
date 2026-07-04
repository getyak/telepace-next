"""Event schema. Append-only, immutable, typed facts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from core.constants import ACTOR_SYSTEM, DEFAULT_EVENT_SCHEMA_VERSION


class EventBase(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    campaign_id: UUID
    actor: str = ACTOR_SYSTEM
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    schema_version: int = DEFAULT_EVENT_SCHEMA_VERSION


class StudyDrafted(EventBase):
    type: Literal["study.drafted"] = "study.drafted"
    title: str
    author_id: UUID


class SpecUpdated(EventBase):
    type: Literal["study.spec_updated"] = "study.spec_updated"
    patch: dict[str, object] = Field(default_factory=dict)
    reason: str = ""


class CampaignReady(EventBase):
    type: Literal["study.ready"] = "study.ready"


class CampaignPublished(EventBase):
    type: Literal["study.published"] = "study.published"
    channels: list[str] = Field(default_factory=list)


class CampaignClosed(EventBase):
    type: Literal["study.closed"] = "study.closed"
    reason: str = "target_reached"


class InviteDispatched(EventBase):
    type: Literal["invite.dispatched"] = "invite.dispatched"
    respondent_id: UUID
    channel: str
    external_id: str | None = None
    provider: str | None = None
    provider_id: str | None = None
    address_hash: str | None = None
    ok: bool = True
    error: str | None = None


class RespondentJoined(EventBase):
    type: Literal["interview.respondent_joined"] = "interview.respondent_joined"
    interview_id: UUID
    respondent_id: UUID
    channel: str


class InterviewStarted(EventBase):
    type: Literal["interview.started"] = "interview.started"
    interview_id: UUID


class TurnRecorded(EventBase):
    type: Literal["interview.turn_recorded"] = "interview.turn_recorded"
    interview_id: UUID
    order: int
    role: str
    text: str
    audio_url: str | None = None
    outline_item_id: UUID | None = None
    latency_ms: int | None = None


class InterviewCompleted(EventBase):
    type: Literal["interview.completed"] = "interview.completed"
    interview_id: UUID
    duration_seconds: int
    goal_coverage: float


class RespondentAudioTurn(EventBase):
    """One respondent audio turn in a voice interview.

    Emitted at the top of each voice turn so ops observability (rubric dim 11)
    has a trail: final transcript, ASR confidence, provider identity.
    """

    type: Literal["interview.respondent_audio_turn"] = "interview.respondent_audio_turn"
    interview_id: UUID
    transcript: str
    confidence: float = 1.0
    stt_provider: str = "mock"
    tts_provider: str = "mock"


class InterviewAbandoned(EventBase):
    type: Literal["interview.abandoned"] = "interview.abandoned"
    interview_id: UUID
    reason: str


class TranscriptEmbedded(EventBase):
    type: Literal["analysis.transcript_embedded"] = "analysis.transcript_embedded"
    interview_id: UUID
    dimensions: int


class ThemeClusterUpdated(EventBase):
    type: Literal["analysis.theme_cluster_updated"] = "analysis.theme_cluster_updated"
    theme_id: UUID
    label: str
    support_count: int


class InsightGenerated(EventBase):
    type: Literal["analysis.insight_generated"] = "analysis.insight_generated"
    insight_id: UUID
    kind: str
    title: str
    confidence: float
    # Full insight payload (theme summary/tags, verbatim quote/attribution,
    # persona attributes, ...). Kept generic so each InsightKind can evolve
    # without an event schema bump; defaults keep old records loadable.
    body: dict[str, object] = Field(default_factory=dict)


class NotificationSent(EventBase):
    type: Literal["coord.notification_sent"] = "coord.notification_sent"
    to: str
    channel: str
    subject: str


class BudgetThresholdCrossed(EventBase):
    type: Literal["policy.budget_crossed"] = "policy.budget_crossed"
    threshold: float
    spent_usd: float


class EscalationTriggered(EventBase):
    type: Literal["policy.escalation_triggered"] = "policy.escalation_triggered"
    reason: str
    severity: Literal["low", "medium", "high"] = "medium"


class PIIRedacted(EventBase):
    type: Literal["policy.pii_redacted"] = "policy.pii_redacted"
    interview_id: UUID
    fields: list[str]


Event = Annotated[
    (
        StudyDrafted
        | SpecUpdated
        | CampaignReady
        | CampaignPublished
        | CampaignClosed
        | InviteDispatched
        | RespondentJoined
        | InterviewStarted
        | TurnRecorded
        | InterviewCompleted
        | RespondentAudioTurn
        | InterviewAbandoned
        | TranscriptEmbedded
        | ThemeClusterUpdated
        | InsightGenerated
        | NotificationSent
        | BudgetThresholdCrossed
        | EscalationTriggered
        | PIIRedacted
    ),
    Field(discriminator="type"),
]


event_type_registry: dict[str, type[EventBase]] = {
    cls.model_fields["type"].default: cls  # type: ignore[misc]
    for cls in (
        StudyDrafted,
        SpecUpdated,
        CampaignReady,
        CampaignPublished,
        CampaignClosed,
        InviteDispatched,
        RespondentJoined,
        InterviewStarted,
        TurnRecorded,
        InterviewCompleted,
        RespondentAudioTurn,
        InterviewAbandoned,
        TranscriptEmbedded,
        ThemeClusterUpdated,
        InsightGenerated,
        NotificationSent,
        BudgetThresholdCrossed,
        EscalationTriggered,
        PIIRedacted,
    )
}


def load_event(record: dict[str, object]) -> EventBase:
    et = record.get("type")
    if not isinstance(et, str):
        raise ValueError("event record missing 'type'")
    cls = event_type_registry.get(et)
    if cls is None:
        raise ValueError(f"unknown event type: {et}")
    return cls.model_validate(record)


_ = uuid4, UUID, datetime, BaseModel  # keep imports referenced for tooling

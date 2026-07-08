"""Domain models. Persistence-agnostic Pydantic models used across layers."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
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


class Outline(_Base):
    items: list[OutlineItem] = Field(default_factory=list)
    estimated_duration_minutes: int = _consts.DEFAULT_OUTLINE_DURATION_MIN
    success_criteria: list[str] = Field(default_factory=list)


class Channel(_Base):
    kind: ChannelKind
    config: dict[str, str] = Field(default_factory=dict)


class CampaignSpec(_Base):
    goal: str
    background: str = ""
    hypotheses: list[str] = Field(default_factory=list)
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

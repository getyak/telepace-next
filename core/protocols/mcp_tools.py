"""MCP tool schemas exposed to Claude/Cursor/Codex.

Every tool is WRITE-oriented (side effect + returned identifier) or a stateful
query over a durable resource — never a stateless computation.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from core import constants as _consts
from core.domain.models import ChannelKind


class _ToolBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GetSessionInput(_ToolBase):
    pass


class GetSessionOutput(_ToolBase):
    authenticated: bool
    user_id: UUID
    org_id: UUID
    email: str
    scopes: list[str]


class CreateCampaignInput(_ToolBase):
    title: str = Field(description="Short, human-readable name for the study.")
    goal: str = Field(description="What you want to learn. 1-3 sentences.")
    background: str = Field(
        default="",
        description="Optional prior context: hypotheses, known constraints.",
    )
    target_completions: int = Field(
        default=_consts.DEFAULT_TARGET_COMPLETIONS,
        ge=_consts.MIN_TARGET_COMPLETIONS,
        le=_consts.MAX_TARGET_COMPLETIONS,
    )
    budget_usd: float = Field(default=_consts.DEFAULT_BUDGET_USD, ge=0.0)
    channels: list[ChannelKind] = Field(
        default_factory=lambda: [ChannelKind.WEB_TEXT],
        description="How respondents will be reached.",
    )


class CreateCampaignOutput(_ToolBase):
    campaign_id: UUID
    share_url: str
    status: str
    next_actions: list[str]


class GetCampaignProgressInput(_ToolBase):
    campaign_id: UUID


class GetCampaignProgressOutput(_ToolBase):
    campaign_id: UUID
    status: str
    invited: int
    started: int
    completed: int
    abandoned: int
    avg_duration_seconds: float
    avg_goal_coverage: float
    spent_usd: float
    budget_usd: float
    next_actions: list[str]


class InsightItem(_ToolBase):
    id: UUID
    kind: str
    title: str
    body: str
    confidence: float
    supporting_interview_ids: list[UUID]


class GetCampaignInsightsInput(_ToolBase):
    campaign_id: UUID
    format: Literal["themes", "verbatims", "persona", "report"] = "themes"
    min_confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class GetCampaignInsightsOutput(_ToolBase):
    campaign_id: UUID
    format: str
    items: list[InsightItem]
    next_actions: list[str]


class AskFollowupInput(_ToolBase):
    campaign_id: UUID
    question: str = Field(description="Natural-language question about the transcripts.")
    scope: Literal["all", "completed_only"] = "completed_only"


class AskFollowupOutput(_ToolBase):
    answer: str
    evidence: list[dict[str, str]]
    next_actions: list[str]


class PushInsightsInput(_ToolBase):
    campaign_id: UUID
    destination: Literal["notion", "linear", "slack", "webhook", "email"]
    config: dict[str, str] = Field(default_factory=dict)


class PushInsightsOutput(_ToolBase):
    delivered: bool
    external_ref: str | None = None
    next_actions: list[str]


class ListCampaignsInput(_ToolBase):
    query: str | None = Field(
        default=None,
        max_length=200,
        description="Optional case-insensitive title filter.",
    )
    status: Literal["draft", "ready", "live", "closed"] | None = Field(
        default=None,
        description="Optional exact lifecycle-status filter.",
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum studies returned, newest first.",
    )


class CampaignSummary(_ToolBase):
    campaign_id: UUID
    title: str
    status: str
    completed: int
    target_completions: int


class ListCampaignsOutput(_ToolBase):
    campaigns: list[CampaignSummary]
    next_actions: list[str]


class RefineOutlineInput(_ToolBase):
    campaign_id: UUID
    instruction: str = Field(
        description="Natural-language edit to the study outline, e.g. 'add a question about pricing'.",
    )


class RefineOutlineOutput(_ToolBase):
    campaign_id: UUID
    status: str
    next_actions: list[str]


class StartCampaignInput(_ToolBase):
    campaign_id: UUID


class StartCampaignOutput(_ToolBase):
    campaign_id: UUID
    status: str
    dispatchable_channels: list[str] = Field(default_factory=list)
    next_actions: list[str]


class DispatchInviteItem(_ToolBase):
    channel: ChannelKind
    address: str | None = Field(
        default=None,
        description=(
            "Canonical recipient address. For email, put the email address here; "
            "for SMS/phone, put the phone number here."
        ),
    )
    email: str | None = Field(
        default=None,
        description="Email-channel convenience alias for address.",
    )
    phone_number: str | None = Field(
        default=None,
        description="SMS/phone-channel convenience alias for address.",
    )
    name: str | None = None
    personalized_intro: str | None = None

    @model_validator(mode="after")
    def _resolve_address(self) -> DispatchInviteItem:
        candidates = [
            value.strip()
            for value in (self.address, self.email, self.phone_number)
            if isinstance(value, str) and value.strip()
        ]
        if not candidates:
            raise ValueError("one of address, email, or phone_number is required")
        if len(set(candidates)) > 1:
            raise ValueError("address aliases must not conflict")
        self.address = candidates[0]
        return self


class DispatchInvitesInput(_ToolBase):
    campaign_id: UUID
    invites: list[DispatchInviteItem] = Field(default_factory=list)


class DispatchInvitesOutput(_ToolBase):
    campaign_id: UUID
    dispatched: int
    next_actions: list[str]


MCP_TOOL_REGISTRY: dict[str, tuple[type[_ToolBase], type[_ToolBase], str]] = {
    "get_session": (
        GetSessionInput,
        GetSessionOutput,
        "Verify the authenticated Telepace user, tenant, and granted scopes.",
    ),
    "create_campaign": (
        CreateCampaignInput,
        CreateCampaignOutput,
        "Create a new user-research study and get a shareable respondent link.",
    ),
    "get_campaign_progress": (
        GetCampaignProgressInput,
        GetCampaignProgressOutput,
        "Fetch live progress + spend for a campaign.",
    ),
    "get_campaign_insights": (
        GetCampaignInsightsInput,
        GetCampaignInsightsOutput,
        "Fetch AI-synthesized insights (themes / verbatims / persona / report).",
    ),
    "ask_followup": (
        AskFollowupInput,
        AskFollowupOutput,
        "Ask a natural-language follow-up question over collected transcripts.",
    ),
    "push_insights": (
        PushInsightsInput,
        PushInsightsOutput,
        "Push a campaign's insights to Notion / Linear / Slack / Webhook / Email.",
    ),
    "list_campaigns": (
        ListCampaignsInput,
        ListCampaignsOutput,
        "List the researcher's studies with live completion counts.",
    ),
    "refine_outline": (
        RefineOutlineInput,
        RefineOutlineOutput,
        "Apply a natural-language edit to a study's discussion outline.",
    ),
    "start_campaign": (
        StartCampaignInput,
        StartCampaignOutput,
        "Publish a study so it goes live and can accept respondents.",
    ),
    "dispatch_invites": (
        DispatchInvitesInput,
        DispatchInvitesOutput,
        "Send invitations to respondents over email / SMS / phone.",
    ),
}

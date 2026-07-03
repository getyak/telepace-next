"""MCP tool schemas exposed to Claude/Cursor/Codex.

Every tool is WRITE-oriented (side effect + returned identifier) or a stateful
query over a durable resource — never a stateless computation.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from core import constants as _consts
from core.domain.models import ChannelKind


class _ToolBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateCampaignInput(_ToolBase):
    title: str = Field(description="Short, human-readable name for the study.")
    goal: str = Field(description="What you want to learn. 1–3 sentences.")
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


MCP_TOOL_REGISTRY: dict[str, tuple[type[_ToolBase], type[_ToolBase], str]] = {
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
}

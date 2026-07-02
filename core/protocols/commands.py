"""Commands: intent-to-mutate. Routed by the Harness."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from core.domain.models import CampaignSpec, ChannelKind


class CommandBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    actor: str = "system"
    campaign_id: UUID | None = None


class CreateCampaign(CommandBase):
    type: Literal["create_campaign"] = "create_campaign"
    org_id: UUID
    author_id: UUID
    title: str
    goal: str
    background: str = ""
    target_completions: int = 10
    budget_usd: float = 100.0
    channels: list[ChannelKind] = Field(default_factory=lambda: [ChannelKind.WEB_TEXT])


class RefineOutline(CommandBase):
    type: Literal["refine_outline"] = "refine_outline"
    instruction: str


class RegisterRespondents(CommandBase):
    type: Literal["register_respondents"] = "register_respondents"
    respondents: list[dict[str, str]]
    source: str = "csv"


class StartCampaign(CommandBase):
    type: Literal["start_campaign"] = "start_campaign"


class ReplyInInterview(CommandBase):
    type: Literal["reply_in_interview"] = "reply_in_interview"
    interview_id: UUID
    text: str
    audio_url: str | None = None


class PushInsights(CommandBase):
    type: Literal["push_insights"] = "push_insights"
    destination: Literal["notion", "linear", "slack", "webhook", "email"]
    config: dict[str, str] = Field(default_factory=dict)


class InviteInput(BaseModel):
    """One invite payload inside a DispatchInvites command."""

    model_config = ConfigDict(extra="forbid")

    address: str
    channel: ChannelKind
    name: str | None = None
    personalized_intro: str | None = None


class DispatchInvites(CommandBase):
    type: Literal["dispatch_invites"] = "dispatch_invites"
    invites: list[InviteInput] = Field(default_factory=list)


Command = Annotated[
    (
        CreateCampaign
        | RefineOutline
        | RegisterRespondents
        | StartCampaign
        | ReplyInInterview
        | PushInsights
        | DispatchInvites
    ),
    Field(discriminator="type"),
]


def spec_from_create(cmd: CreateCampaign) -> CampaignSpec:
    from core.domain.models import Channel, Outline

    return CampaignSpec(
        goal=cmd.goal,
        background=cmd.background,
        target_completions=cmd.target_completions,
        budget_usd=cmd.budget_usd,
        channels=[Channel(kind=ch) for ch in cmd.channels],
        outline=Outline(items=[], estimated_duration_minutes=15),
    )

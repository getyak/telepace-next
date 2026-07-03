"""Queries: read-only. Served from projections."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from core.constants import DEFAULT_LIST_LIMIT
from core.domain.models import CampaignStatus


class QueryBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GetCampaign(QueryBase):
    type: Literal["get_campaign"] = "get_campaign"
    campaign_id: UUID


class ListCampaigns(QueryBase):
    type: Literal["list_campaigns"] = "list_campaigns"
    org_id: UUID
    status: CampaignStatus | None = None
    limit: int = DEFAULT_LIST_LIMIT


class GetCampaignProgress(QueryBase):
    type: Literal["get_campaign_progress"] = "get_campaign_progress"
    campaign_id: UUID


Query = Annotated[
    GetCampaign | ListCampaigns | GetCampaignProgress,
    Field(discriminator="type"),
]

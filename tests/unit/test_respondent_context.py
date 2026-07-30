from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from core.domain.models import CampaignStatus
from core.events import RespondentJoined
from interfaces.rest_api.respondent_context import (
    normalize_referrer_origin,
    normalize_respondent_source,
    respondent_campaign_state,
)


class _Projector:
    def __init__(self, campaign) -> None:
        self.campaign = campaign

    async def get_campaign(self, _campaign_id):
        return self.campaign


def test_respondent_provenance_is_normalized_without_full_referrer() -> None:
    assert normalize_respondent_source(" About Me / Hero ") == "about-me-hero"
    assert normalize_respondent_source("") == "direct"
    assert (
        normalize_referrer_origin("https://cubxxw.com/zh/about/?utm_source=private")
        == "https://cubxxw.com"
    )
    assert normalize_referrer_origin("javascript:alert(1)") is None
    assert normalize_referrer_origin("https://cubxxw.com:not-a-port/about") is None
    assert normalize_referrer_origin("http://[::1]:1314/about") == "http://[::1]:1314"


def test_old_respondent_joined_events_keep_safe_defaults() -> None:
    event = RespondentJoined(
        campaign_id=uuid4(),
        interview_id=uuid4(),
        respondent_id=uuid4(),
        channel="web_text",
    )
    assert event.source == "direct"
    assert event.referrer_origin is None
    assert event.embedded is False
    assert event.consent_method == "continue"


@pytest.mark.asyncio
async def test_only_live_campaigns_accept_public_responses() -> None:
    campaign_id = uuid4()
    campaign = SimpleNamespace(status=CampaignStatus.LIVE)
    loaded, error = await respondent_campaign_state(_Projector(campaign), campaign_id)
    assert loaded is campaign
    assert error is None

    campaign.status = CampaignStatus.DRAFT
    _, error = await respondent_campaign_state(_Projector(campaign), campaign_id)
    assert error == "campaign_not_live"

    _, error = await respondent_campaign_state(_Projector(None), campaign_id)
    assert error == "campaign_not_found"

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from core.domain.models import CampaignStatus
from interfaces.rest_api.config import Settings
from interfaces.rest_api.embed_session import (
    EmbedSessionError,
    decode_embed_session,
    issue_embed_session,
)
from interfaces.rest_api.routers.interviews import EmbedSessionBody, create_embed_session

TEST_SECRET = "test-secret-that-is-at-least-thirty-two-bytes"


class _Projector:
    def __init__(self, campaign) -> None:
        self.campaign = campaign

    async def get_campaign(self, _campaign_id):
        return self.campaign


def test_embed_session_round_trip_is_campaign_origin_and_source_bound() -> None:
    campaign_id = uuid4()
    token, expires_at = issue_embed_session(
        campaign_id=campaign_id,
        origin="https://cubxxw.com",
        source="about-me-trust-gap",
        consent_method="checkbox",
        secret=TEST_SECRET,
        algorithm="HS256",
        issuer="telepace",
        ttl_seconds=600,
    )

    claims = decode_embed_session(
        token,
        secret=TEST_SECRET,
        algorithm="HS256",
        issuer="telepace",
    )
    assert claims.campaign_id == campaign_id
    assert claims.origin == "https://cubxxw.com"
    assert claims.source == "about-me-trust-gap"
    assert claims.consent_method == "checkbox"
    assert claims.expires_at == expires_at.replace(microsecond=0)


def test_embed_session_rejects_the_wrong_secret() -> None:
    token, _ = issue_embed_session(
        campaign_id=uuid4(),
        origin="https://cubxxw.com",
        source="about-me",
        consent_method="continue",
        secret=TEST_SECRET,
        algorithm="HS256",
        issuer="telepace",
        ttl_seconds=600,
    )
    with pytest.raises(EmbedSessionError, match="invalid embed session"):
        decode_embed_session(
            token,
            secret="wrong-secret-that-is-at-least-thirty-two-bytes",
            algorithm="HS256",
            issuer="telepace",
        )


@pytest.mark.asyncio
async def test_session_endpoint_mints_only_for_an_allowed_live_origin() -> None:
    campaign_id = uuid4()
    settings = Settings(
        jwt_secret=TEST_SECRET,
        embed_allowed_origins=["https://cubxxw.com"],
    )
    state = SimpleNamespace(
        projector=_Projector(SimpleNamespace(status=CampaignStatus.LIVE)),
    )
    body = EmbedSessionBody(
        campaign_id=campaign_id,
        source="About Me / Product Bet",
        consent_method="checkbox",
    )
    request = SimpleNamespace(headers={"origin": "https://cubxxw.com"})

    response = await create_embed_session(body, request, state, settings)
    claims = decode_embed_session(
        response["session_token"],
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
    )
    assert claims.campaign_id == campaign_id
    assert claims.source == "about-me-product-bet"
    assert claims.origin == "https://cubxxw.com"


@pytest.mark.asyncio
async def test_session_endpoint_rejects_untrusted_origin() -> None:
    settings = Settings(embed_allowed_origins=["https://cubxxw.com"])
    state = SimpleNamespace(
        projector=_Projector(SimpleNamespace(status=CampaignStatus.LIVE)),
    )
    request = SimpleNamespace(headers={"origin": "https://attacker.example"})

    with pytest.raises(HTTPException) as exc:
        await create_embed_session(
            EmbedSessionBody(campaign_id=uuid4()),
            request,
            state,
            settings,
        )
    assert exc.value.status_code == 403

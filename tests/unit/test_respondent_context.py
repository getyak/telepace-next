from __future__ import annotations

import re
from types import SimpleNamespace
from uuid import uuid4

import pytest

from core.domain.models import CampaignStatus
from core.events import RespondentJoined
from harness.memory import InMemoryMemory
from interfaces.rest_api.config import cors_allow_origin_regex
from interfaces.rest_api.embed_session import issue_embed_session
from interfaces.rest_api.respondent_context import (
    hydrate_respondent_interview_context,
    normalize_referrer_origin,
    normalize_respondent_source,
    receive_headless_session_token,
    respondent_campaign_state,
    respondent_connection_context,
    respondent_origin_allowed,
)

TEST_SECRET = "test-secret-that-is-at-least-thirty-two-bytes"


class _AuthWebSocket:
    def __init__(self) -> None:
        self.query_params = {"client": "headless"}

    async def receive_text(self):
        return '{"type":"authenticate","session_token":"first-frame-token"}'


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
async def test_headless_token_is_read_from_first_frame_not_query_string() -> None:
    token = await receive_headless_session_token(_AuthWebSocket(), timeout_seconds=1)
    assert token == "first-frame-token"


@pytest.mark.asyncio
async def test_sdk_connection_uses_signed_provenance_instead_of_query_metadata() -> None:
    campaign_id = uuid4()
    settings = SimpleNamespace(
        embed_allowed_origins=["https://cubxxw.com"],
        jwt_secret=TEST_SECRET,
        jwt_algorithm="HS256",
        jwt_issuer="telepace",
    )
    token, _ = issue_embed_session(
        campaign_id=campaign_id,
        origin="https://cubxxw.com",
        source="about-me-trust-gap",
        consent_method="checkbox",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
        ttl_seconds=600,
    )
    websocket = SimpleNamespace(
        query_params={
            "client": "headless",
            "session_token": "query-token-must-be-ignored",
            "source": "forged-source",
        },
        headers={"origin": "https://cubxxw.com"},
    )

    context, error = await respondent_connection_context(
        websocket,
        campaign_id,
        settings,
        session_token=token,
        memory=InMemoryMemory(),
    )
    assert error is None
    assert context is not None
    assert context.source == "about-me-trust-gap"
    assert context.referrer_origin == "https://cubxxw.com"
    assert context.embedded is True
    assert context.consent_method == "checkbox"


@pytest.mark.asyncio
async def test_sdk_connection_rejects_token_reuse_from_another_origin() -> None:
    campaign_id = uuid4()
    settings = SimpleNamespace(
        embed_allowed_origins=["https://cubxxw.com", "https://attacker.example"],
        jwt_secret=TEST_SECRET,
        jwt_algorithm="HS256",
        jwt_issuer="telepace",
    )
    token, _ = issue_embed_session(
        campaign_id=campaign_id,
        origin="https://cubxxw.com",
        source="about-me",
        consent_method="continue",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
        ttl_seconds=600,
    )
    websocket = SimpleNamespace(
        query_params={"client": "headless", "session_token": token},
        headers={"origin": "https://attacker.example"},
    )

    context, error = await respondent_connection_context(
        websocket,
        campaign_id,
        settings,
        session_token=token,
        memory=InMemoryMemory(),
    )
    assert context is None
    assert error == "embed_session_invalid"


@pytest.mark.asyncio
async def test_sdk_session_token_is_consumed_only_once() -> None:
    campaign_id = uuid4()
    settings = SimpleNamespace(
        embed_allowed_origins=["https://cubxxw.com"],
        jwt_secret=TEST_SECRET,
        jwt_algorithm="HS256",
        jwt_issuer="telepace",
    )
    token, _ = issue_embed_session(
        campaign_id=campaign_id,
        origin="https://cubxxw.com",
        source="about-me",
        consent_method="checkbox",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
        ttl_seconds=600,
    )
    websocket = SimpleNamespace(
        query_params={"client": "headless"},
        headers={"origin": "https://cubxxw.com"},
    )
    memory = InMemoryMemory()

    first, first_error = await respondent_connection_context(
        websocket,
        campaign_id,
        settings,
        session_token=token,
        memory=memory,
    )
    second, second_error = await respondent_connection_context(
        websocket,
        campaign_id,
        settings,
        session_token=token,
        memory=memory,
    )

    assert first is not None
    assert first_error is None
    assert second is None
    assert second_error == "embed_session_invalid"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "origin",
    [
        "https://cubxxw.com",
        "http://localhost:8888",
        "http://127.0.0.1:8888",
    ],
)
async def test_blog_origin_cannot_downgrade_headless_connection_to_legacy(
    origin: str,
) -> None:
    websocket = SimpleNamespace(
        query_params={"source": "forged", "consent": "checkbox"},
        headers={"origin": origin},
    )
    settings = SimpleNamespace(public_base_url="http://localhost:3300")

    context, error = await respondent_connection_context(
        websocket,
        uuid4(),
        settings,
    )

    assert context is None
    assert error == "respondent_origin_not_allowed"


@pytest.mark.asyncio
async def test_legacy_respondent_accepts_only_exact_public_frontend_origin() -> None:
    websocket = SimpleNamespace(
        query_params={"source": "respondent-page", "consent": "checkbox"},
        headers={"origin": "http://localhost:3300"},
    )
    settings = SimpleNamespace(public_base_url="http://localhost:3300")

    context, error = await respondent_connection_context(
        websocket,
        uuid4(),
        settings,
    )

    assert error is None
    assert context is not None
    assert context.source == "respondent-page"
    assert context.consent_method == "checkbox"


def test_embed_origin_matching_supports_explicit_local_port_wildcard() -> None:
    assert respondent_origin_allowed("http://localhost:8888", ["http://localhost:*"])
    assert respondent_origin_allowed("http://localhost:1314", ["http://localhost:*"])
    assert respondent_origin_allowed("http://127.0.0.1:43117", ["http://127.0.0.1:*"])
    assert not respondent_origin_allowed("https://localhost:8888", ["http://localhost:*"])
    assert not respondent_origin_allowed("http://attacker.local:8888", ["http://localhost:*"])


def test_cors_regex_is_derived_only_from_explicit_local_wildcards() -> None:
    pattern = cors_allow_origin_regex(
        [
            "https://cubxxw.com",
            "http://localhost:*",
            "http://127.0.0.1:*",
            "https://example.com:*",
        ]
    )

    assert pattern is not None
    assert re.fullmatch(pattern, "http://localhost:1314")
    assert re.fullmatch(pattern, "http://127.0.0.1:43117")
    assert not re.fullmatch(pattern, "https://localhost:1314")
    assert not re.fullmatch(pattern, "http://attacker.local:1314")
    assert not re.fullmatch(pattern, "https://example.com:443")
    assert cors_allow_origin_regex(["https://cubxxw.com"]) is None


@pytest.mark.asyncio
async def test_hydrate_restores_campaign_spec_and_isolates_interview_history() -> None:
    campaign_id = uuid4()
    interview_id = uuid4()
    memory = InMemoryMemory()
    campaign = SimpleNamespace(
        org_id=uuid4(),
        spec=SimpleNamespace(
            model_dump=lambda mode: {
                "primary_language": "zh",
                "budget_usd": 5,
                "target_completions": 1,
            }
        ),
    )
    state = SimpleNamespace(projector=_Projector(campaign), memory=memory)
    await memory.update(campaign_id, {"spec": {"primary_language": "en"}})

    loaded = await hydrate_respondent_interview_context(
        state,
        campaign_id,
        interview_id,
        opening_text="第一个问题",
    )

    assert loaded is campaign
    assert (await memory.load(campaign_id))["spec"]["primary_language"] == "zh"
    assert (await memory.load(interview_id))["interview_history"] == [
        {"role": "interviewer", "text": "第一个问题"}
    ]


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

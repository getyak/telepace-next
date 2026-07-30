"""Shared validation and metadata helpers for public interview entry points."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from starlette.websockets import WebSocketDisconnect

from core.domain.models import CampaignStatus
from interfaces.rest_api.embed_session import EmbedSessionError, decode_embed_session

_SOURCE_RE = re.compile(r"[^a-z0-9._-]+")
_MAX_SOURCE_LENGTH = 64


def normalize_respondent_source(value: str | None) -> str:
    """Return a compact, analytics-safe source label without respondent PII."""

    candidate = (value or "direct").strip().lower()
    candidate = _SOURCE_RE.sub("-", candidate).strip("-")
    return (candidate or "direct")[:_MAX_SOURCE_LENGTH]


def normalize_referrer_origin(value: str | None) -> str | None:
    """Keep only an http(s) origin, never a full referrer URL or query string."""

    if not value:
        return None
    try:
        parsed = urlsplit(value.strip())
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not hostname:
        return None
    normalized_host = f"[{hostname}]" if ":" in hostname else hostname
    port_suffix = f":{port}" if port else ""
    return f"{parsed.scheme}://{normalized_host}{port_suffix}"


def query_flag(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes"}


def respondent_origin_allowed(origin: str | None, allowed_origins: list[str]) -> bool:
    """Match an exact origin or a local-development ``:*`` port wildcard."""

    normalized = normalize_referrer_origin(origin)
    if not normalized:
        return False
    for configured in allowed_origins:
        candidate = configured.strip().rstrip("/")
        if candidate == normalized:
            return True
        if candidate.endswith(":*") and normalized.startswith(candidate[:-1]):
            return True
    return False


@dataclass(slots=True, frozen=True)
class RespondentConnectionContext:
    source: str
    referrer_origin: str | None
    embedded: bool
    consent_method: str


async def receive_headless_session_token(websocket, *, timeout_seconds: int) -> str:
    """Read the first-frame auth message without placing credentials in the URL."""

    if websocket.query_params.get("client") != "headless":
        return ""
    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(),
            timeout=max(1, timeout_seconds),
        )
        message = json.loads(raw)
    except (TimeoutError, json.JSONDecodeError, WebSocketDisconnect):
        return ""
    if not isinstance(message, dict) or message.get("type") != "authenticate":
        return ""
    return str(message.get("session_token") or "")


async def hydrate_respondent_interview_context(
    state,
    campaign_id: UUID,
    interview_id: UUID,
    *,
    opening_text: str = "",
):
    """Restore durable study config and seed isolated per-interview memory."""

    campaign = await state.projector.get_campaign(campaign_id)
    if campaign is None or state.memory is None:
        return campaign

    spec = campaign.spec.model_dump(mode="json")
    await state.memory.update(
        campaign_id,
        {
            "spec": spec,
            "org_id": str(campaign.org_id),
            "budget_usd": spec.get("budget_usd", 0),
            "target_completions": spec.get("target_completions", 0),
        },
    )

    interview_context = await state.memory.load(interview_id)
    if "interview_history" not in interview_context:
        history = [{"role": "interviewer", "text": opening_text}] if opening_text else []
        await state.memory.update(
            interview_id,
            {
                "interview_history": history,
                "outline_coverage": {},
                "interview_seconds": 0,
            },
        )
    return campaign


async def respondent_connection_context(
    websocket,
    campaign_id: UUID,
    settings,
    *,
    session_token: str = "",
    memory=None,
) -> tuple[RespondentConnectionContext | None, str | None]:
    """Resolve trusted provenance for respondent-page and headless clients."""

    query = websocket.query_params
    request_origin = normalize_referrer_origin(websocket.headers.get("origin"))
    if query.get("client") != "headless":
        if not respondent_origin_allowed(request_origin, [settings.public_base_url]):
            return None, "respondent_origin_not_allowed"
        return (
            RespondentConnectionContext(
                source=normalize_respondent_source(query.get("source")),
                referrer_origin=normalize_referrer_origin(query.get("parent_origin")),
                embedded=query_flag(query.get("embed")),
                consent_method=(
                    "checkbox" if query.get("consent") == "checkbox" else "continue"
                ),
            ),
            None,
        )

    if not respondent_origin_allowed(request_origin, settings.embed_allowed_origins):
        return None, "embed_origin_not_allowed"

    try:
        claims = decode_embed_session(
            session_token,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            issuer=settings.jwt_issuer,
        )
    except EmbedSessionError:
        return None, "embed_session_invalid"

    if claims.campaign_id != campaign_id or claims.origin != request_origin:
        return None, "embed_session_invalid"
    if memory is not None:
        ttl_seconds = max(
            1,
            int((claims.expires_at - datetime.now(tz=UTC)).total_seconds()),
        )
        claimed = await memory.claim_once(
            f"embed-session:{claims.session_id}",
            ttl_seconds=ttl_seconds,
        )
        if not claimed:
            return None, "embed_session_invalid"
    return (
        RespondentConnectionContext(
            source=claims.source,
            referrer_origin=claims.origin,
            embedded=True,
            consent_method=claims.consent_method,
        ),
        None,
    )


async def respondent_campaign_state(projector, campaign_id: UUID) -> tuple[object | None, str | None]:
    """Return the campaign plus a stable public error code when it cannot run."""

    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        return None, "campaign_not_found"
    if campaign.status != CampaignStatus.LIVE:
        return campaign, "campaign_not_live"
    return campaign, None

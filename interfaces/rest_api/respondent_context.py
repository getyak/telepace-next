"""Shared validation and metadata helpers for public interview entry points."""

from __future__ import annotations

import asyncio
import ipaddress
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from starlette.websockets import WebSocketDisconnect

from core.domain.models import CampaignStatus
from core.events import InterviewStarted, TurnRecorded
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


def _origin_parts(value: str) -> tuple[str, str, int] | None:
    normalized = normalize_referrer_origin(value)
    if not normalized:
        return None
    parsed = urlsplit(normalized)
    if not parsed.hostname:
        return None
    default_port = 443 if parsed.scheme == "https" else 80
    return parsed.scheme, parsed.hostname.rstrip(".").lower(), parsed.port or default_port


def _is_loopback_host(hostname: str) -> bool:
    if hostname == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _same_loopback_origin(left: str, right: str) -> bool:
    left_parts = _origin_parts(left)
    right_parts = _origin_parts(right)
    if left_parts is None or right_parts is None:
        return False
    left_scheme, left_host, left_port = left_parts
    right_scheme, right_host, right_port = right_parts
    return (
        _is_loopback_host(left_host)
        and _is_loopback_host(right_host)
        and left_scheme == right_scheme
        and left_port == right_port
    )


def respondent_origin_allowed(origin: str | None, allowed_origins: list[str]) -> bool:
    """Match an exact origin or a tightly scoped local-development equivalent."""

    normalized = normalize_referrer_origin(origin)
    if not normalized:
        return False
    for configured in allowed_origins:
        candidate = configured.strip().rstrip("/")
        candidate_normalized = normalize_referrer_origin(candidate)
        if candidate_normalized == normalized:
            return True
        if candidate.endswith(":*"):
            wildcard_parts = _origin_parts(candidate[:-2])
            normalized_parts = _origin_parts(normalized)
            if wildcard_parts is not None and normalized_parts is not None:
                wildcard_scheme, wildcard_host, _ = wildcard_parts
                normalized_scheme, normalized_host, _ = normalized_parts
                if (
                    _is_loopback_host(wildcard_host)
                    and wildcard_scheme == normalized_scheme
                    and wildcard_host == normalized_host
                ):
                    return True
        elif candidate_normalized and _same_loopback_origin(
            normalized, candidate_normalized
        ):
            # Browsers treat localhost, 127.0.0.1, and ::1 as distinct origins,
            # but they are interchangeable preview hosts on the same machine.
            # Matching the scheme and effective port keeps this dev convenience
            # from weakening production origin checks.
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


async def receive_interview_handshake(
    websocket,
    *,
    timeout_seconds: int,
) -> tuple[str, str]:
    """Read authentication and continuation secrets from the first frame.

    Existing non-handshake clients keep their immediate-HELLO behavior. The
    first-party respondent page opts into ``handshake=1`` so its continuation
    token never appears in a URL, referrer, or access log.
    """

    if websocket.query_params.get("client") == "headless":
        return (
            await receive_headless_session_token(
                websocket,
                timeout_seconds=timeout_seconds,
            ),
            "",
        )
    if websocket.query_params.get("handshake") != "1":
        return "", ""
    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(),
            timeout=max(1, timeout_seconds),
        )
        message = json.loads(raw)
    except (TimeoutError, json.JSONDecodeError, WebSocketDisconnect):
        return "", ""
    if not isinstance(message, dict):
        return "", ""
    if message.get("type") == "resume":
        return "", str(message.get("resume_token") or "")
    if message.get("type") == "start":
        return "", ""
    return "", ""


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
        history: list[dict[str, str]] = []
        started_at: float | None = None
        event_store = getattr(state, "event_store", None)
        if event_store is not None:
            stored_events = await event_store.read_stream(campaign_id)
            for stored in stored_events:
                event = stored.event
                if (
                    isinstance(event, InterviewStarted)
                    and event.interview_id == interview_id
                ):
                    started_at = event.ts.timestamp()
                elif (
                    isinstance(event, TurnRecorded)
                    and event.interview_id == interview_id
                ):
                    history.append({"role": event.role, "text": event.text})
        if not history and opening_text:
            history = [{"role": "interviewer", "text": opening_text}]
        await state.memory.update(
            interview_id,
            {
                "interview_history": history,
                "outline_coverage": {},
                "interview_seconds": 0,
                "interview_started_at": started_at or datetime.now(UTC).timestamp(),
            },
        )
    else:
        started_at = interview_context.get("interview_started_at")
        if isinstance(started_at, int | float):
            elapsed = int(datetime.now(UTC).timestamp() - started_at)
            await state.memory.update(
                interview_id,
                {"interview_seconds": max(0, elapsed)},
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

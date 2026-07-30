"""Shared validation and metadata helpers for public interview entry points."""

from __future__ import annotations

import re
from urllib.parse import urlsplit
from uuid import UUID

from core.domain.models import CampaignStatus

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


async def respondent_campaign_state(projector, campaign_id: UUID) -> tuple[object | None, str | None]:
    """Return the campaign plus a stable public error code when it cannot run."""

    campaign = await projector.get_campaign(campaign_id)
    if campaign is None:
        return None, "campaign_not_found"
    if campaign.status != CampaignStatus.LIVE:
        return campaign, "campaign_not_live"
    return campaign, None

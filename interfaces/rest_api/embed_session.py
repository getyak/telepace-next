"""Short-lived, origin-bound sessions for the headless interview SDK."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt

_EMBED_AUDIENCE = "telepace-embed"
_EMBED_TOKEN_TYPE = "embed_session"


class EmbedSessionError(Exception):
    """Raised when an SDK session token is expired, malformed, or mismatched."""


@dataclass(slots=True, frozen=True)
class EmbedSessionClaims:
    campaign_id: UUID
    origin: str
    source: str
    consent_method: str
    session_id: UUID
    expires_at: datetime


def issue_embed_session(
    *,
    campaign_id: UUID,
    origin: str,
    source: str,
    consent_method: str,
    secret: str,
    algorithm: str,
    issuer: str,
    ttl_seconds: int,
) -> tuple[str, datetime]:
    """Issue a browser-safe token scoped to one campaign and parent origin."""

    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(seconds=max(30, ttl_seconds))
    claims = {
        "sub": str(campaign_id),
        "origin": origin,
        "source": source,
        "consent": consent_method,
        "jti": str(uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": issuer,
        "aud": _EMBED_AUDIENCE,
        "typ": _EMBED_TOKEN_TYPE,
    }
    return jwt.encode(claims, secret, algorithm=algorithm), expires_at


def decode_embed_session(
    token: str,
    *,
    secret: str,
    algorithm: str,
    issuer: str,
) -> EmbedSessionClaims:
    """Verify an SDK session token and return its strongly typed claims."""

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=_EMBED_AUDIENCE,
            issuer=issuer,
            options={
                "require": [
                    "exp",
                    "iat",
                    "sub",
                    "origin",
                    "source",
                    "consent",
                    "jti",
                    "iss",
                    "aud",
                ]
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise EmbedSessionError("embed session expired") from exc
    except jwt.InvalidTokenError as exc:
        raise EmbedSessionError("invalid embed session") from exc

    if payload.get("typ") != _EMBED_TOKEN_TYPE:
        raise EmbedSessionError("wrong embed token type")

    try:
        campaign_id = UUID(payload["sub"])
        session_id = UUID(payload["jti"])
        expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
    except (KeyError, TypeError, ValueError) as exc:
        raise EmbedSessionError("invalid embed session claims") from exc

    origin = str(payload.get("origin") or "")
    source = str(payload.get("source") or "")
    consent_method = str(payload.get("consent") or "")
    if not origin or not source or consent_method not in {"checkbox", "continue"}:
        raise EmbedSessionError("invalid embed session metadata")

    return EmbedSessionClaims(
        campaign_id=campaign_id,
        origin=origin,
        source=source,
        consent_method=consent_method,
        session_id=session_id,
        expires_at=expires_at,
    )

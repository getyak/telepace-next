"""JWT issuance and verification.

All configuration (secret, algorithm, TTLs, issuer, audience) is injected —
this module does not hold any hardcoded auth constant.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt


class TokenError(Exception):
    """Raised when a token cannot be verified or its claims are invalid."""


@dataclass(slots=True, frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


@dataclass(slots=True, frozen=True)
class AccessClaims:
    user_id: UUID
    org_id: UUID
    email: str
    scope: str  # space-separated list; empty when no scopes
    expires_at: datetime
    issued_at: datetime


def _now() -> datetime:
    return datetime.now(tz=UTC)


def issue_token_pair(
    *,
    user_id: UUID,
    org_id: UUID,
    email: str,
    scopes: list[str] | None,
    secret: str,
    algorithm: str,
    access_ttl_seconds: int,
    refresh_ttl_seconds: int,
    issuer: str,
    audience: str,
) -> TokenPair:
    now = _now()
    access_exp = now + timedelta(seconds=access_ttl_seconds)
    refresh_exp = now + timedelta(seconds=refresh_ttl_seconds)
    scope = " ".join(scopes) if scopes else ""

    access_claims = {
        "sub": str(user_id),
        "org": str(org_id),
        "email": email,
        "scope": scope,
        "iat": int(now.timestamp()),
        "exp": int(access_exp.timestamp()),
        "iss": issuer,
        "aud": audience,
        "typ": "access",
    }
    refresh_claims = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(refresh_exp.timestamp()),
        "iss": issuer,
        "aud": audience,
        "typ": "refresh",
    }
    access = jwt.encode(access_claims, secret, algorithm=algorithm)
    refresh = jwt.encode(refresh_claims, secret, algorithm=algorithm)
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        access_expires_at=access_exp,
        refresh_expires_at=refresh_exp,
    )


def decode_access_token(
    token: str,
    *,
    secret: str,
    algorithm: str,
    issuer: str,
    audience: str,
) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError(f"invalid token: {exc}") from exc

    if payload.get("typ") != "access":
        raise TokenError("wrong token type")

    try:
        user_id = UUID(payload["sub"])
        org_id = UUID(payload["org"])
    except (KeyError, ValueError, TypeError) as exc:
        raise TokenError("invalid subject/org claim") from exc

    email = str(payload.get("email") or "")
    scope = str(payload.get("scope") or "")
    return AccessClaims(
        user_id=user_id,
        org_id=org_id,
        email=email,
        scope=scope,
        expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=UTC),
    )


def decode_refresh_token(
    token: str,
    *,
    secret: str,
    algorithm: str,
    issuer: str,
    audience: str,
) -> UUID:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("refresh token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError(f"invalid refresh token: {exc}") from exc

    if payload.get("typ") != "refresh":
        raise TokenError("wrong token type")
    try:
        return UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise TokenError("invalid subject claim") from exc

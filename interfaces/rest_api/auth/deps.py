"""FastAPI dependencies for authentication.

`get_current_user` — optional (returns None if no/invalid token). Used for
routes that support both anonymous and authenticated calls.

`require_current_user` — required (raises 401 if missing/invalid). Used for
protected routes. When Settings.auth_enabled is False, both fall back to a
synthesized `AuthUser` built from `default_org_id` / `default_author_id`
so dev workflows can still hit protected endpoints without a token.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Request, status

from interfaces.rest_api.auth.jwt import TokenError, decode_access_token
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.config import Settings


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def _dev_fallback_user(settings: Settings) -> AuthUser:
    return AuthUser(
        id=UUID(settings.default_author_id),
        email="dev@telepace.local",
        org_id=UUID(settings.default_org_id),
        scopes=(),
    )


def _get_settings(request: Request) -> Settings:
    # Local import avoids a circular import between this module and rest_api.deps.
    from interfaces.rest_api.deps import get_state

    return get_state(request).settings


def get_current_user(
    request: Request, settings: Settings = Depends(_get_settings)
) -> AuthUser | None:
    if not settings.auth_enabled:
        return _dev_fallback_user(settings)

    token = _extract_bearer(request)
    if token is None:
        return None
    try:
        claims = decode_access_token(
            token,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
    except TokenError:
        return None
    scopes = tuple(s for s in claims.scope.split() if s) if claims.scope else ()
    return AuthUser(
        id=claims.user_id, email=claims.email, org_id=claims.org_id, scopes=scopes
    )


def require_current_user(
    user: AuthUser | None = Depends(get_current_user),
) -> AuthUser:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

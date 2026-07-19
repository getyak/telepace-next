"""Google OAuth 2.0 sign-in (T-512).

Two endpoints, split so the httpOnly session cookies always land on the
frontend BFF origin (port 3300):

* ``GET  /auth/oauth/google/start``    — mint a signed, short-lived state and
  302 the browser to Google's consent screen.
* ``POST /auth/oauth/google/exchange`` — called server-to-server by the BFF
  callback route with the ``code`` + ``state`` Google handed back. Verifies the
  state, exchanges the code for tokens, reads the userinfo, finds-or-creates the
  user (a brand-new user mints its own org, same rule as password register —
  see T-501), and returns a normal ``TokenResponse``.

No third-party OAuth library — the flow is small enough to drive with ``httpx``
(already a dependency) and the ``jwt`` we already use for sessions.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict

from interfaces.rest_api.auth.jwt import issue_token_pair
from interfaces.rest_api.auth.models import TokenResponse
from interfaces.rest_api.auth.users_repo import UserAlreadyExistsError, UsersRepo
from interfaces.rest_api.config import Settings
from interfaces.rest_api.errors import ErrorMessages

router = APIRouter(prefix="/auth/oauth/google", tags=["auth"])

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

_PROVIDER = "google"
_STATE_TTL_SECONDS = 5 * 60
_STATE_TYP = "oauth_state"
_HTTP_TIMEOUT_S = 10.0


def _get_settings(request: Request) -> Settings:
    from interfaces.rest_api.deps import get_state

    return get_state(request).settings


def _get_users_repo(request: Request) -> UsersRepo:
    from interfaces.rest_api.deps import get_state

    state = get_state(request)
    if state.users_repo is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorMessages.AUTH_UNAVAILABLE,
        )
    return state.users_repo


def _require_configured(settings: Settings) -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorMessages.OAUTH_NOT_CONFIGURED,
        )


def _sign_state(settings: Settings) -> str:
    """A signed nonce that ties the redirect we sent to the callback we get.

    Reusing the JWT secret keeps it tamper-proof and self-expiring; no server
    session store needed for the CSRF guard.
    """
    now = datetime.now(tz=UTC)
    claims = {
        "typ": _STATE_TYP,
        "nonce": uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=_STATE_TTL_SECONDS)).timestamp()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _verify_state(state: str, settings: Settings) -> None:
    try:
        payload = jwt.decode(
            state,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "iss", "aud"]},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.OAUTH_STATE_INVALID,
        ) from exc
    if payload.get("typ") != _STATE_TYP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.OAUTH_STATE_INVALID,
        )


class ExchangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    state: str


@router.get("/start")
async def start(
    settings: Settings = Depends(_get_settings),
) -> RedirectResponse:
    """302 the browser to Google's consent screen."""
    _require_configured(settings)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.oauth_google_redirect_uri,
        "response_type": "code",
        "scope": settings.oauth_google_scopes,
        "state": _sign_state(settings),
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(
        url=f"{_GOOGLE_AUTH_URL}?{urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
    )


async def _exchange_code_for_userinfo(
    code: str, settings: Settings
) -> tuple[str, str, str | None]:
    """Return ``(sub, email, display_name)`` from Google, or raise 401."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
        token_resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.oauth_google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != status.HTTP_200_OK:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorMessages.OAUTH_EXCHANGE_FAILED,
            )
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorMessages.OAUTH_EXCHANGE_FAILED,
            )

        info_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_resp.status_code != status.HTTP_200_OK:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorMessages.OAUTH_EXCHANGE_FAILED,
            )

    info = info_resp.json()
    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorMessages.OAUTH_EXCHANGE_FAILED,
        )
    display_name = info.get("name") or None
    return str(sub), str(email), display_name


@router.post("/exchange", response_model=TokenResponse)
async def exchange(
    body: ExchangeRequest,
    settings: Settings = Depends(_get_settings),
    users: UsersRepo = Depends(_get_users_repo),
) -> TokenResponse:
    """Server-to-server: turn Google's ``code`` into a telepace session."""
    _require_configured(settings)
    _verify_state(body.state, settings)

    sub, email, display_name = await _exchange_code_for_userinfo(body.code, settings)

    # Find-or-create. Match on the stable provider subject id first (email can
    # change on the Google side); fall back to creating a fresh account + org.
    user = await users.get_by_provider(_PROVIDER, sub)
    if user is None:
        # A returning user whose account predates SSO (same email, password
        # account) keeps their org — bind the provider by reusing that record
        # rather than minting a second tenant. Absent any match, new org per T-501.
        existing = await users.get_by_email(email)
        if existing is not None:
            user = existing
        else:
            try:
                user = await users.create_oauth(
                    email=email,
                    display_name=display_name,
                    org_id=uuid4(),
                    provider=_PROVIDER,
                    provider_sub=sub,
                )
            except UserAlreadyExistsError:
                # Raced with a concurrent create — re-read wins.
                user = await users.get_by_email(email)
                if user is None:  # pragma: no cover - unreachable double miss
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail=ErrorMessages.OAUTH_EXCHANGE_FAILED,
                    ) from None

    pair = issue_token_pair(
        user_id=user.id,
        org_id=user.org_id,
        email=user.email,
        scopes=None,
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_ttl_seconds=settings.jwt_access_ttl_seconds,
        refresh_ttl_seconds=settings.jwt_refresh_ttl_seconds,
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
    )
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=settings.jwt_access_ttl_seconds,
    )

"""FastAPI router for /auth/register /login /refresh /me /logout.

All auth policy (min password length, lockout thresholds, JWT TTLs) is
sourced from Settings. This router does not hold any hardcoded auth
constant.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from interfaces.rest_api.auth.deps import require_current_user
from interfaces.rest_api.auth.jwt import (
    TokenError,
    decode_refresh_token,
    issue_token_pair,
)
from interfaces.rest_api.auth.models import (
    AuthUser,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from interfaces.rest_api.auth.password import hash_password, verify_password
from interfaces.rest_api.auth.users_repo import (
    UserAlreadyExistsError,
    UserNotFoundError,
    UsersRepo,
)
from interfaces.rest_api.config import Settings
from interfaces.rest_api.errors import ErrorMessages

router = APIRouter(prefix="/auth", tags=["auth"])


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


def _issue_pair_for(user_id: UUID, org_id: UUID, email: str, settings: Settings) -> TokenResponse:
    pair = issue_token_pair(
        user_id=user_id,
        org_id=org_id,
        email=email,
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
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_seconds,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    settings: Settings = Depends(_get_settings),
    users: UsersRepo = Depends(_get_users_repo),
) -> TokenResponse:
    if len(body.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.PASSWORD_TOO_SHORT.format(
                min_length=settings.password_min_length
            ),
        )

    org_id = body.org_id or UUID(settings.default_org_id)
    encoded = hash_password(body.password, rounds=settings.password_hash_rounds)
    try:
        user = await users.create(
            email=str(body.email),
            password_hash=encoded,
            display_name=body.display_name,
            org_id=org_id,
        )
    except UserAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorMessages.EMAIL_ALREADY_REGISTERED,
        ) from exc

    return _issue_pair_for(user.id, user.org_id, user.email, settings)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    settings: Settings = Depends(_get_settings),
    users: UsersRepo = Depends(_get_users_repo),
) -> TokenResponse:
    user = await users.get_by_email(str(body.email))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorMessages.INVALID_CREDENTIALS,
        )

    if user.locked_until and user.locked_until > datetime.now(tz=UTC):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=ErrorMessages.ACCOUNT_LOCKED,
        )

    if not verify_password(body.password, user.password_hash):
        await users.record_failed_attempt(
            user_id=user.id,
            max_attempts=settings.auth_max_failed_attempts,
            lockout_seconds=settings.auth_lockout_seconds,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorMessages.INVALID_CREDENTIALS,
        )

    await users.reset_failed_attempts(user.id)
    return _issue_pair_for(user.id, user.org_id, user.email, settings)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    settings: Settings = Depends(_get_settings),
    users: UsersRepo = Depends(_get_users_repo),
) -> TokenResponse:
    try:
        user_id = decode_refresh_token(
            body.refresh_token,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    try:
        user = await users.get_by_id(user_id)
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorMessages.INVALID_CREDENTIALS,
        ) from exc

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorMessages.INVALID_CREDENTIALS,
        )
    return _issue_pair_for(user.id, user.org_id, user.email, settings)


@router.get("/me", response_model=UserResponse)
async def me(
    current: AuthUser = Depends(require_current_user),
    users: UsersRepo = Depends(_get_users_repo),
) -> UserResponse:
    try:
        record = await users.get_by_id(current.id)
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=ErrorMessages.USER_NOT_FOUND
        ) from exc
    return UserResponse(
        id=record.id,
        email=record.email,
        display_name=record.display_name,
        org_id=record.org_id,
        created_at=record.created_at,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: AuthUser = Depends(require_current_user)) -> None:
    """Stateless logout — client discards its token.

    Server-side revocation would require a token-blacklist store; postponed to
    a follow-up milestone when refresh-token rotation is added.
    """
    return None

"""JWT-authenticated REST management of remote MCP API keys.

Humans authenticate with their JWT (require_current_user), then mint / list /
revoke long-lived API keys their Agents use against the MCP server.

The plaintext key is returned exactly once, from POST /api-keys. All other
responses expose only key_prefix / name / scopes / timestamps.

See docs/mcp-key-auth-design.md §7.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.constants import (
    API_KEY_ENTROPY_BYTES,
    API_KEY_PREFIX_LIVE,
    MCP_READ_SCOPE,
    MCP_WRITE_SCOPE,
)
from core.protocols.mcp_tools import MCPScopes
from interfaces.rest_api.auth.api_keys_repo import ApiKeyNotFoundError, ApiKeysRepo
from interfaces.rest_api.auth.deps import get_current_user, require_current_user
from interfaces.rest_api.auth.models import AuthUser
from interfaces.rest_api.config import Settings
from interfaces.rest_api.errors import ErrorMessages

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

# Scopes an API key may grant: the concrete MCPScopes members plus the
# `<prefix>:*` and `*` wildcards understood by mcp_server.auth.require_scope.
# Building this from MCPScopes keeps it in lock-step with the tool registry —
# a new scope constant is automatically accepted here.
_ALLOWED_SCOPES: frozenset[str] = frozenset(
    {
        value
        for name, value in vars(MCPScopes).items()
        if not name.startswith("_") and isinstance(value, str)
    }
    | {"campaigns:*", "insights:*", "invites:*", "session:*", "*"}
)


def _get_settings(request: Request) -> Settings:
    from interfaces.rest_api.deps import get_state

    return get_state(request).settings


def _require_key_user(request: Request, settings: Settings = Depends(_get_settings)) -> AuthUser:
    # Key management never accepts the REST development fallback identity.
    strict = settings.model_copy(update={"auth_enabled": True})
    user = require_current_user(get_current_user(request, strict))
    if not {MCP_READ_SCOPE, MCP_WRITE_SCOPE}.intersection(user.scopes):
        raise HTTPException(status_code=403, detail="MCP access scope required")
    return user


def _require_key_writer(user: AuthUser) -> None:
    if MCP_WRITE_SCOPE not in user.scopes:
        raise HTTPException(status_code=403, detail="mcp:write scope required")


def _get_api_keys_repo(request: Request) -> ApiKeysRepo:
    from interfaces.rest_api.deps import get_state

    state = get_state(request)
    if state.api_keys_repo is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorMessages.AUTH_UNAVAILABLE,
        )
    return state.api_keys_repo


def _validate_scopes(scopes: list[str]) -> None:
    """Reject any requested scope not in the known allowed set (HTTP 400)."""
    unknown = [scope for scope in scopes if scope not in _ALLOWED_SCOPES]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown scope(s): {', '.join(unknown)}",
        )


class CreateApiKeyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100, description="Human-readable label.")
    scopes: list[str] = Field(
        default_factory=list,
        max_length=32,
        description="Scopes to grant, e.g. ['campaigns:read', 'insights:read'].",
    )
    expires_in_days: int | None = Field(
        default=None, ge=1, le=3650, description="Optional TTL; omit for a non-expiring key."
    )

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        return value


class CreateApiKeyResponse(BaseModel):
    """The ONLY response that carries the plaintext key. Show it once."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    plaintext_key: str  # tp_live_... — never returned again
    expires_at: datetime | None
    created_at: datetime


class ApiKeyResponse(BaseModel):
    """Safe representation for list views — no plaintext."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    name: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None


@router.post("", response_model=CreateApiKeyResponse, status_code=201)
async def create_api_key(
    body: CreateApiKeyRequest,
    response: Response,
    user: AuthUser = Depends(_require_key_user),
    settings: Settings = Depends(_get_settings),
    repo: ApiKeysRepo = Depends(_get_api_keys_repo),
) -> CreateApiKeyResponse:
    """Mint a key for the caller's org. Returns the plaintext exactly once.

    Validates requested scopes against the known scope set (reject unknown),
    then ApiKeysRepo.create(org_id=user.org_id, user_id=user.id, ...).
    """
    _require_key_writer(user)
    _validate_scopes(body.scopes)
    # A write-only JWT must not delegate read scopes via a wildcard key.
    read_scopes = {
        "campaigns:read",
        "insights:read",
        "session:read",
        "campaigns:*",
        "insights:*",
        "session:*",
        "*",
    }
    if MCP_READ_SCOPE not in user.scopes and read_scopes.intersection(body.scopes):
        raise HTTPException(status_code=403, detail="mcp:read scope required for requested grants")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

    # `expires_in_days` from the request wins; otherwise fall back to the
    # server default. Both may be None → a non-expiring key.
    ttl_days = body.expires_in_days or settings.api_key_default_expiry_days
    expires_at = datetime.now(tz=UTC) + timedelta(days=ttl_days) if ttl_days else None

    new = await repo.create(
        org_id=user.org_id,
        user_id=user.id,
        name=body.name,
        scopes=sorted(set(body.scopes)),
        prefix=API_KEY_PREFIX_LIVE,
        entropy_bytes=API_KEY_ENTROPY_BYTES,
        expires_at=expires_at,
    )
    record = new.record
    return CreateApiKeyResponse(
        id=record.id,
        name=record.name,
        key_prefix=record.key_prefix,
        scopes=record.scopes.split(),
        plaintext_key=new.plaintext,
        expires_at=record.expires_at,
        created_at=record.created_at,
    )


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(
    response: Response,
    user: AuthUser = Depends(_require_key_user),
    repo: ApiKeysRepo = Depends(_get_api_keys_repo),
) -> list[ApiKeyResponse]:
    """List the caller org's keys (active + revoked), plaintext stripped."""
    response.headers["Cache-Control"] = "no-store"
    records = await repo.list_for_org(user.org_id)
    return [
        ApiKeyResponse(
            id=rec.id,
            name=rec.name,
            key_prefix=rec.key_prefix,
            scopes=rec.scopes.split(),
            is_active=rec.is_active,
            last_used_at=rec.last_used_at,
            expires_at=rec.expires_at,
            created_at=rec.created_at,
            revoked_at=rec.revoked_at,
        )
        for rec in records
    ]


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: UUID,
    user: AuthUser = Depends(_require_key_user),
    repo: ApiKeysRepo = Depends(_get_api_keys_repo),
) -> None:
    """Revoke a key. Scoped to the caller's org so cross-org revoke is blocked."""
    _require_key_writer(user)
    try:
        await repo.revoke(key_id=key_id, org_id=user.org_id)
    except ApiKeyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(key_id),
        ) from exc
    return None

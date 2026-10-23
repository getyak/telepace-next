"""API-key authentication and scope enforcement for remote MCP.

Turns an inbound `Authorization: Bearer tp_live_...` header into a verified
`MCPPrincipal` (org + user + scopes), and enforces per-tool scope requirements.

Mirrors `interfaces.rest_api.auth.deps` for the REST side, but for API keys
instead of JWTs. The stdio transport keeps its existing JWT authentication.

See docs/mcp-key-auth-design.md §5, §6.
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from core.constants import API_KEY_PREFIX_LIVE, API_KEY_PREFIX_TEST, HTTP_AUTH_SCHEME
from interfaces.rest_api.auth.api_keys_repo import ApiKeyRecord, hash_key
from interfaces.rest_api.config import Settings


class ApiKeyVerifier(Protocol):
    """The slice of ApiKeysRepo that authenticate() needs.

    Depending on this protocol (rather than the concrete ApiKeysRepo) keeps the
    auth logic testable with an in-memory fake and inverts the dependency —
    key_auth.py does not needs a live asyncpg pool to be exercised.
    """

    async def verify(self, key_hash: str) -> ApiKeyRecord | None: ...

    async def touch_last_used(self, key_id: UUID) -> None: ...


class MCPAuthError(Exception):
    """Auth/scope failure carrying an HTTP-style status (401 or 403)."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass(slots=True, frozen=True)
class MCPPrincipal:
    """The verified caller behind an MCP request."""

    org_id: UUID
    user_id: UUID
    scopes: frozenset[str]


def extract_bearer(auth_header: str | None) -> str | None:
    """Pull the token out of an `Authorization: Bearer <token>` header.

    Returns None when the header is absent or not a well-formed bearer header.
    Same parsing contract as `rest_api.auth.deps._extract_bearer`
    (scheme compared case-insensitively against `HTTP_AUTH_SCHEME`).
    """
    if not auth_header:
        return None
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != HTTP_AUTH_SCHEME:
        return None
    token = parts[1].strip()
    return token or None


async def authenticate(
    auth_header: str | None,
    *,
    repo: ApiKeyVerifier,
    settings: Settings,
) -> MCPPrincipal:
    """Verify the inbound header and return the caller principal.

    Flow (design §6):
      1. no/malformed bearer, or not a tp_ prefix → MCPAuthError(401)
      2. repo.verify(hash_key(token)) → None → MCPAuthError(401)
      3. record found → touch_last_used (best-effort) → MCPPrincipal(...)
    """
    # Remote access always requires a key, including when REST dev auth is off.
    # Reject anything that is not a well-formed telepace API key.
    token = extract_bearer(auth_header)
    if token is None or not token.startswith((API_KEY_PREFIX_LIVE, API_KEY_PREFIX_TEST)):
        raise MCPAuthError(401, "Missing or malformed API key")

    # Verify against the store (hash lookup in the DB; None = reject).
    record = await repo.verify(hash_key(token))
    if record is None:
        raise MCPAuthError(401, "Invalid or revoked API key")

    # Record activity best-effort — a touch failure must never fail auth.
    with contextlib.suppress(Exception):
        await repo.touch_last_used(record.id)

    scopes = frozenset(s for s in record.scopes.split() if s)
    return MCPPrincipal(org_id=record.org_id, user_id=record.user_id, scopes=scopes)


def require_scope(principal: MCPPrincipal, needed: str) -> None:
    """Raise MCPAuthError(403) unless `principal` satisfies `needed`.

    Pass when any holds (design §5.3):
      - "*" in principal.scopes
      - needed in principal.scopes
      - f"{needed.split(':')[0]}:*" in principal.scopes  (prefix wildcard)
    """
    if not has_scope(principal, needed):
        raise MCPAuthError(403, f"Missing required scope: {needed}")


def has_scope(principal: MCPPrincipal, needed: str) -> bool:
    """Non-raising variant of `require_scope`, used to filter list_tools."""
    if "*" in principal.scopes:
        return True
    if needed in principal.scopes:
        return True
    prefix_wildcard = f"{needed.split(':')[0]}:*"
    return prefix_wildcard in principal.scopes

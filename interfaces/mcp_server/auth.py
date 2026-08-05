"""Authentication boundary for the stdio MCP process.

Codex launches stdio servers as child processes, so the access token is
provided through ``TELEPACE_MCP_ACCESS_TOKEN`` and never appears in tool
arguments or traces. The token uses the same issuer, audience, and signing
rules as Telepace's REST API.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from interfaces.rest_api.auth.jwt import TokenError, decode_access_token
from interfaces.rest_api.config import Settings


@dataclass(frozen=True, slots=True)
class MCPSessionIdentity:
    user_id: UUID
    org_id: UUID
    email: str
    scopes: tuple[str, ...]
    authenticated: bool


def resolve_mcp_identity(settings: Settings) -> MCPSessionIdentity:
    token = settings.mcp_access_token.strip()
    if token:
        try:
            claims = decode_access_token(
                token,
                secret=settings.jwt_secret,
                algorithm=settings.jwt_algorithm,
                issuer=settings.jwt_issuer,
                audience=settings.jwt_audience,
            )
        except TokenError as exc:
            raise RuntimeError(f"Telepace MCP authentication failed: {exc}") from exc
        return MCPSessionIdentity(
            user_id=claims.user_id,
            org_id=claims.org_id,
            email=claims.email,
            scopes=tuple(scope for scope in claims.scope.split() if scope),
            authenticated=True,
        )

    if settings.mcp_require_auth:
        raise RuntimeError(
            "Telepace MCP authentication required; set TELEPACE_MCP_ACCESS_TOKEN"
        )
    return MCPSessionIdentity(
        user_id=UUID(settings.default_author_id),
        org_id=UUID(settings.default_org_id),
        email=settings.dev_fallback_user_email,
        scopes=(),
        authenticated=False,
    )

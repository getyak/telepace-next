"""Remote MCP transport, authenticated per request with revocable API keys.

The HTTP transport reuses the running REST app's services. The existing stdio
process keeps its JWT identity and lifecycle in server.py / auth.py.
"""

from __future__ import annotations

import contextlib
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

import mcp.types as mcp_types
import orjson
from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount
from starlette.types import Receive, Scope, Send

from core.constants import PRODUCT_NAME
from core.protocols.mcp_tools import MCP_TOOL_REGISTRY, TOOL_REQUIRED_SCOPES
from interfaces.mcp_server.auth import MCPSessionIdentity
from interfaces.mcp_server.key_auth import (
    ApiKeyVerifier,
    MCPAuthError,
    MCPPrincipal,
    authenticate,
    has_scope,
    require_scope,
)
from interfaces.mcp_server.server import apply_pending_to_projection, assert_campaign_access
from interfaces.mcp_server.tools import TOOL_HANDLERS
from interfaces.rest_api.config import Settings, cors_allow_origin_regex

if TYPE_CHECKING:
    from harness import RedisMemory
    from interfaces.rest_api.deps import AppState

_CURRENT_PRINCIPAL: ContextVar[MCPPrincipal | None] = ContextVar(
    "mcp_current_principal", default=None
)


def _require_principal() -> MCPPrincipal:
    principal = _CURRENT_PRINCIPAL.get()
    if principal is None:
        raise MCPAuthError(401, "Unauthenticated MCP request")
    return principal


def _extract_auth_header(scope: Scope) -> str | None:
    values = [value for name, value in scope.get("headers", []) if name.lower() == b"authorization"]
    # Ambiguous credentials must never depend on proxy/header ordering.
    return values[0].decode("latin-1") if len(values) == 1 else None


def build_http_app(
    *,
    settings: Settings,
    api_keys_repo: ApiKeyVerifier,
    state_provider: Callable[[], AppState],
) -> Starlette:
    """Build without I/O; only the MCP session manager owns a child lifespan."""
    server = Server(PRODUCT_NAME)

    @server.list_tools()  # type: ignore[no-untyped-call,untyped-decorator]
    async def _list_tools() -> list[mcp_types.Tool]:
        principal = _require_principal()
        return [
            mcp_types.Tool(name=name, description=desc, inputSchema=input_cls.model_json_schema())
            for name, (input_cls, _out_cls, desc) in MCP_TOOL_REGISTRY.items()
            if has_scope(principal, TOOL_REQUIRED_SCOPES[name])
        ]

    @server.call_tool()  # type: ignore[untyped-decorator]
    async def _call_tool(name: str, arguments: dict[str, Any]) -> list[mcp_types.TextContent]:
        principal = _require_principal()
        required = TOOL_REQUIRED_SCOPES.get(name)
        if required is None:
            raise ValueError(f"unknown tool: {name}")
        require_scope(principal, required)
        state = state_provider()
        campaign_id = arguments.get("campaign_id")
        if campaign_id is not None:
            await assert_campaign_access(
                UUID(str(campaign_id)), org_id=principal.org_id, projector=state.projector
            )
        handler = cast(Callable[..., Awaitable[dict[str, Any]]], TOOL_HANDLERS[name])
        result = await handler(
            arguments,
            harness=state.harness,
            projector=state.projector,
            insight_reader=state.insight_reader,
            followup_service=state.followup_service,
            org_id=principal.org_id,
            author_id=principal.user_id,
            public_base_url=settings.public_base_url,
            mcp_session=MCPSessionIdentity(
                user_id=principal.user_id,
                org_id=principal.org_id,
                email="",
                scopes=tuple(sorted(principal.scopes)),
                authenticated=True,
            ),
        )
        changed_campaign_id = result.get("campaign_id") if isinstance(result, dict) else None
        changed_campaign_id = changed_campaign_id or campaign_id
        if changed_campaign_id is not None:
            await apply_pending_to_projection(
                UUID(str(changed_campaign_id)),
                store=state.event_store,
                memory=cast("RedisMemory", state.memory),
                projector=state.projector,
            )
        return [mcp_types.TextContent(type="text", text=orjson.dumps(result).decode())]

    session_manager = StreamableHTTPSessionManager(app=server, stateless=True)

    async def _auth_asgi(scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1008})
            return
        origins = [
            value.decode("latin-1")
            for name, value in scope.get("headers", [])
            if name.lower() == b"origin"
        ]
        origin_regex = cors_allow_origin_regex(settings.cors_allow_origins)
        if origins and (
            len(origins) != 1
            or not (
                origins[0] in settings.cors_allow_origins
                or (origin_regex is not None and re.fullmatch(origin_regex, origins[0]))
            )
        ):
            response = JSONResponse({"error": "Untrusted origin"}, status_code=403)
            await response(scope, receive, send)
            return
        try:
            principal = await authenticate(
                _extract_auth_header(scope), repo=api_keys_repo, settings=settings
            )
        except MCPAuthError as exc:
            response = JSONResponse(
                {"error": exc.message},
                status_code=exc.status_code,
                headers={"WWW-Authenticate": "Bearer", "Cache-Control": "no-store"},
            )
            await response(scope, receive, send)
            return
        token = _CURRENT_PRINCIPAL.set(principal)
        try:
            await session_manager.handle_request(scope, receive, send)
        finally:
            _CURRENT_PRINCIPAL.reset(token)

    @contextlib.asynccontextmanager
    async def _lifespan(_app: Starlette) -> AsyncIterator[None]:
        async with session_manager.run():
            yield

    return Starlette(routes=[Mount("/", app=_auth_asgi)], lifespan=_lifespan)

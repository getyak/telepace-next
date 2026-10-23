"""P2 Streamable-HTTP MCP transport — auth + scope boundary tests.

Focus: the risky layer, which is *auth + scope enforcement across the ASGI
boundary*, not the MCP wire protocol itself. Two complementary levels:

1. Middleware boundary (no lifespan needed). `authenticate()` runs in the ASGI
   wrapper *before* the session manager, so every rejection path (missing /
   malformed / unknown / inactive / expired key) returns a JSON error without
   ever building the harness or opening a DB connection. These drive the raw
   app through httpx `ASGITransport` with no lifespan started.

2. MCP JSON-RPC handshake (mocked harness lifespan). For the *admitted* paths
   we must start `session_manager.run()` — but NOT the real Harness/LLM/DB. We
   monkeypatch `build_harness_and_projector` to hand back lightweight fakes so
   the lifespan comes up instantly, then drive real `initialize` / `tools/list`
   / `tools/call` JSON-RPC over the transport. `stateless=True` lets each call
   authenticate independently, so `tools/list` needs no prior session.
   `tools/call` on an out-of-scope tool is rejected by `require_scope` *before*
   any handler dispatch, so the fake harness is never touched on that path; the
   one admitted `tools/call` uses a spy handler, so still no real harness.

Reuses the FakeApiKeysRepo pattern from tests/mcp/test_key_auth.py.

Test matrix — docs/mcp-key-auth-design.md §6, §10.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from httpx import ASGITransport

import interfaces.mcp_server.http_app as http_app
from core.constants import API_KEY_PREFIX_LIVE
from interfaces.mcp_server.http_app import build_http_app
from interfaces.mcp_server.tools import TOOL_HANDLERS
from interfaces.rest_api.auth.api_keys_repo import ApiKeyRecord, hash_key
from interfaces.rest_api.config import Settings

# --- fakes (mirrors tests/mcp/test_key_auth.py) --------------------------


class FakeApiKeysRepo:
    """In-memory ApiKeyVerifier keyed by key_hash. Enough for authenticate()."""

    def __init__(self, records: dict[str, ApiKeyRecord]) -> None:
        self._by_hash = records
        self.touched: list[UUID] = []

    async def verify(self, key_hash: str) -> ApiKeyRecord | None:
        rec = self._by_hash.get(key_hash)
        if rec is None or not rec.is_active:
            return None
        if rec.expires_at is not None and rec.expires_at < datetime.now(tz=UTC):
            return None
        return rec

    async def touch_last_used(self, key_id: UUID) -> None:
        self.touched.append(key_id)


def _fake_state() -> Any:
    return SimpleNamespace(
        harness=object(), projector=object(), insight_reader=object(), followup_service=object()
    )


def _record(**overrides: Any) -> ApiKeyRecord:
    base = ApiKeyRecord(
        id=uuid4(),
        org_id=uuid4(),
        user_id=uuid4(),
        name="test",
        key_prefix="tp_live_abcd",
        key_hash="deadbeef",
        scopes="campaigns:read",
        is_active=True,
        last_used_at=None,
        expires_at=None,
        created_at=datetime.now(tz=UTC),
        revoked_at=None,
    )
    return replace(base, **overrides)


# A well-formed live token whose hash keys the fake repo entry.
_VALID_TOKEN = f"{API_KEY_PREFIX_LIVE}abcdef0123456789abcdef0123456789"

# Accept both JSON and SSE bodies (the MCP streamable-http server replies with
# text/event-stream for POSTs by default).
_MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


def _auth_settings() -> Settings:
    """Auth on (production default) so real key checks run. mcp_http_enabled
    only gates wiring in main.py; build_http_app builds regardless."""
    return Settings(auth_enabled=True, mcp_http_enabled=True)


def _repo_for(token: str, record: ApiKeyRecord) -> FakeApiKeysRepo:
    key_hash = hash_key(token)
    return FakeApiKeysRepo({key_hash: replace(record, key_hash=key_hash)})


def _parse_mcp_body(resp: httpx.Response) -> dict[str, Any]:
    """Extract the JSON-RPC object from either a plain-JSON or SSE response."""
    ctype = resp.headers.get("content-type", "")
    if "text/event-stream" in ctype:
        for line in resp.text.splitlines():
            if line.startswith("data:"):
                parsed: dict[str, Any] = json.loads(line[len("data:") :].strip())
                return parsed
        raise AssertionError(f"no SSE data frame in body: {resp.text!r}")
    body: dict[str, Any] = resp.json()
    return body


# --- level 1: middleware boundary (no lifespan / no harness) --------------
#
# authenticate() runs before the session manager; rejections short-circuit to
# a JSONResponse, so these need no lifespan and touch no DB.


def _bare_client(repo: FakeApiKeysRepo, settings: Settings) -> httpx.AsyncClient:
    app = build_http_app(settings=settings, api_keys_repo=repo, state_provider=_fake_state)
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://mcp.test")


_INIT_BODY = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "pytest", "version": "1"},
    },
}


async def test_no_authorization_header_returns_401() -> None:
    async with _bare_client(FakeApiKeysRepo({}), _auth_settings()) as client:
        resp = await client.post("/", headers=_MCP_HEADERS, json=_INIT_BODY)
    assert resp.status_code == 401
    assert "error" in resp.json()


async def test_malformed_key_returns_401() -> None:
    headers = {**_MCP_HEADERS, "Authorization": "Bearer not-a-telepace-key"}
    async with _bare_client(FakeApiKeysRepo({}), _auth_settings()) as client:
        resp = await client.post("/", headers=headers, json=_INIT_BODY)
    assert resp.status_code == 401


async def test_unknown_key_hash_returns_401() -> None:
    # Well-formed tp_ key, but the repo has no matching hash.
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
    async with _bare_client(FakeApiKeysRepo({}), _auth_settings()) as client:
        resp = await client.post("/", headers=headers, json=_INIT_BODY)
    assert resp.status_code == 401
    assert "Invalid or revoked" in resp.json()["error"]


async def test_inactive_key_returns_401() -> None:
    repo = _repo_for(_VALID_TOKEN, _record(is_active=False))
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
    async with _bare_client(repo, _auth_settings()) as client:
        resp = await client.post("/", headers=headers, json=_INIT_BODY)
    assert resp.status_code == 401


async def test_expired_key_returns_401() -> None:
    past = datetime.now(tz=UTC) - timedelta(days=1)
    repo = _repo_for(_VALID_TOKEN, _record(expires_at=past))
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
    async with _bare_client(repo, _auth_settings()) as client:
        resp = await client.post("/", headers=headers, json=_INIT_BODY)
    assert resp.status_code == 401


async def test_bearer_scheme_is_case_insensitive_still_401_on_bad_token() -> None:
    # Lowercase scheme is accepted by the parser, but the token is junk → 401.
    headers = {**_MCP_HEADERS, "Authorization": "bearer nope"}
    async with _bare_client(FakeApiKeysRepo({}), _auth_settings()) as client:
        resp = await client.post("/", headers=headers, json=_INIT_BODY)
    assert resp.status_code == 401


# --- level 2: MCP handshake with a mocked (harness-free) lifespan ---------


@pytest.fixture
def _stub_lifespan() -> None:
    """Transport startup owns no DB/LLM services; the shared state is a fake."""


async def _served_client(
    repo: FakeApiKeysRepo, settings: Settings
) -> AsyncIterator[httpx.AsyncClient]:
    """Yield a client with the app's lifespan (session_manager.run()) active."""
    app = build_http_app(settings=settings, api_keys_repo=repo, state_provider=_fake_state)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://mcp.test") as client,
    ):
        yield client


async def test_valid_key_initialize_succeeds(_stub_lifespan: None) -> None:
    """A valid key is admitted through the middleware into a real MCP
    `initialize` round-trip (proving the contextvar principal reaches the
    process-wide server)."""
    repo = _repo_for(_VALID_TOKEN, _record(scopes="campaigns:read"))
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        resp = await client.post("/", headers=headers, json=_INIT_BODY)
        assert resp.status_code == 200
        body = _parse_mcp_body(resp)
        assert body["result"]["serverInfo"]["name"]  # non-empty product name
        # The verified key's last_used was touched by authenticate().
        assert len(repo.touched) == 1
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def _list_tool_names(client: httpx.AsyncClient, token: str) -> set[str]:
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {token}"}
    resp = await client.post(
        "/",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    assert resp.status_code == 200, resp.text
    body = _parse_mcp_body(resp)
    return {tool["name"] for tool in body["result"]["tools"]}


async def test_list_tools_filtered_to_read_scope(_stub_lifespan: None) -> None:
    """A campaigns:read key sees only the two read tools in tools/list."""
    repo = _repo_for(_VALID_TOKEN, _record(scopes="campaigns:read"))
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        names = await _list_tool_names(client, _VALID_TOKEN)
        assert names == {"list_campaigns", "get_campaign_progress"}
        assert "create_campaign" not in names
        assert "push_insights" not in names
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_list_tools_prefix_wildcard_widens_visibility(
    _stub_lifespan: None,
) -> None:
    """campaigns:* exposes both read and write campaign tools, but no insights
    or invites tools."""
    repo = _repo_for(_VALID_TOKEN, _record(scopes="campaigns:*"))
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        names = await _list_tool_names(client, _VALID_TOKEN)
        assert {"list_campaigns", "get_campaign_progress", "create_campaign"} <= names
        assert "push_insights" not in names
        assert "dispatch_invites" not in names
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_list_tools_star_scope_sees_everything(_stub_lifespan: None) -> None:
    """A `*` key sees the full registry."""
    repo = _repo_for(_VALID_TOKEN, _record(scopes="*"))
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        names = await _list_tool_names(client, _VALID_TOKEN)
        from core.protocols.mcp_tools import MCP_TOOL_REGISTRY

        assert names == set(MCP_TOOL_REGISTRY)
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_call_tool_insufficient_scope_rejected_before_dispatch(
    _stub_lifespan: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A campaigns:read key calling create_campaign (needs campaigns:write) is
    rejected as an MCP tool error, and no handler runs (require_scope fires
    first, so the fake harness is never touched)."""

    async def _boom(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise AssertionError("handler must NOT run on an out-of-scope call")

    patched = {**TOOL_HANDLERS, "create_campaign": _boom}
    monkeypatch.setattr(http_app, "TOOL_HANDLERS", patched)

    repo = _repo_for(_VALID_TOKEN, _record(scopes="campaigns:read"))
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        resp = await client.post(
            "/",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "create_campaign",
                    "arguments": {"title": "t", "goal": "g"},
                },
            },
        )
        assert resp.status_code == 200  # JSON-RPC transports errors in-band
        body = _parse_mcp_body(resp)
        # The scope failure surfaces as an MCP tool error, not a silent success.
        assert body["result"]["isError"] is True
        text = body["result"]["content"][0]["text"]
        assert "campaigns:write" in text
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_call_tool_sufficient_scope_admitted_with_principal_identity(
    _stub_lifespan: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A key with the right scope reaches dispatch, and the handler is invoked
    with org_id / author_id taken from the verified principal (not the hardcoded
    dev defaults). A spy handler stands in so no real harness is needed."""
    org_id = uuid4()
    user_id = uuid4()
    seen: dict[str, Any] = {}

    async def _spy(arguments: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        seen["arguments"] = arguments
        seen["org_id"] = kwargs.get("org_id")
        seen["author_id"] = kwargs.get("author_id")
        return {"campaigns": []}

    patched = {**TOOL_HANDLERS, "list_campaigns": _spy}
    monkeypatch.setattr(http_app, "TOOL_HANDLERS", patched)

    repo = _repo_for(
        _VALID_TOKEN,
        _record(scopes="campaigns:read", org_id=org_id, user_id=user_id),
    )
    headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        resp = await client.post(
            "/",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "list_campaigns", "arguments": {}},
            },
        )
        assert resp.status_code == 200
        body = _parse_mcp_body(resp)
        assert body["result"].get("isError") in (False, None)
        # Handler ran, and identity was derived from the principal.
        assert seen["org_id"] == org_id
        assert seen["author_id"] == user_id
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_auth_disabled_still_rejects_without_key(_stub_lifespan: None) -> None:
    settings = Settings(auth_enabled=False, mcp_http_enabled=True)
    async with _bare_client(FakeApiKeysRepo({}), settings) as client:
        resp = await client.post("/", headers=_MCP_HEADERS, json=_INIT_BODY)
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


async def test_untrusted_browser_origin_rejected_before_verification():
    repo = _repo_for(_VALID_TOKEN, _record())
    headers = {
        **_MCP_HEADERS,
        "Authorization": f"Bearer {_VALID_TOKEN}",
        "Origin": "https://untrusted.example",
    }
    async with _bare_client(repo, _auth_settings()) as client:
        response = await client.post("/", headers=headers, json=_INIT_BODY)
    assert response.status_code == 403
    assert repo.touched == []


async def test_duplicate_authorization_is_rejected():
    repo = _repo_for(_VALID_TOKEN, _record())
    headers = [
        *_MCP_HEADERS.items(),
        ("Authorization", f"Bearer {_VALID_TOKEN}"),
        ("Authorization", f"Bearer {_VALID_TOKEN}"),
    ]
    async with _bare_client(repo, _auth_settings()) as client:
        response = await client.post("/", headers=headers, json=_INIT_BODY)
    assert response.status_code == 401
    assert repo.touched == []


async def test_revocation_is_rechecked_on_each_http_request():
    repo = _repo_for(_VALID_TOKEN, _record())
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        headers = {**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"}
        assert (await client.post("/", headers=headers, json=_INIT_BODY)).status_code == 200
        repo._by_hash.clear()
        assert (await client.post("/", headers=headers, json=_INIT_BODY)).status_code == 401
        assert http_app._CURRENT_PRINCIPAL.get() is None
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_cross_tenant_campaign_is_rejected_before_handler(monkeypatch):
    class Projector:
        async def get_campaign(self, _):
            return SimpleNamespace(org_id=uuid4())

    async def boom(*args, **kwargs):
        raise AssertionError("cross-tenant handler must not execute")

    monkeypatch.setattr(http_app, "TOOL_HANDLERS", {**TOOL_HANDLERS, "get_campaign_progress": boom})
    repo = _repo_for(_VALID_TOKEN, _record())
    app = build_http_app(
        settings=_auth_settings(),
        api_keys_repo=repo,
        state_provider=lambda: SimpleNamespace(projector=Projector()),
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://mcp.test") as client,
    ):
        response = await client.post(
            "/",
            headers={**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "get_campaign_progress",
                    "arguments": {"campaign_id": str(uuid4())},
                },
            },
        )
    body = _parse_mcp_body(response)
    assert body["result"]["isError"] is True
    assert "authenticated tenant" in body["result"]["content"][0]["text"]


async def test_concurrent_callers_keep_separate_principals(monkeypatch):
    import asyncio

    tokens = [_VALID_TOKEN, f"{API_KEY_PREFIX_LIVE}second0123456789abcdef0123456789"]
    records = [_record(), _record()]
    repo = FakeApiKeysRepo(
        {hash_key(token): record for token, record in zip(tokens, records, strict=True)}
    )
    arrived = 0
    ready = asyncio.Event()

    async def spy(arguments, **kwargs):
        nonlocal arrived
        arrived += 1
        if arrived == 2:
            ready.set()
        await asyncio.wait_for(ready.wait(), timeout=5)
        assert http_app._require_principal().org_id == kwargs["org_id"]
        return {"campaigns": [], "caller": str(kwargs["org_id"])}

    monkeypatch.setattr(http_app, "TOOL_HANDLERS", {**TOOL_HANDLERS, "list_campaigns": spy})
    agen = _served_client(repo, _auth_settings())
    client = await agen.__anext__()
    try:
        responses = await asyncio.gather(
            *[
                client.post(
                    "/",
                    headers={**_MCP_HEADERS, "Authorization": f"Bearer {token}"},
                    json={
                        "jsonrpc": "2.0",
                        "id": i,
                        "method": "tools/call",
                        "params": {"name": "list_campaigns", "arguments": {}},
                    },
                )
                for i, token in enumerate(tokens, 1)
            ]
        )
        for response, record in zip(responses, records, strict=True):
            body = _parse_mcp_body(response)
            assert not body["result"].get("isError")
            result = json.loads(body["result"]["content"][0]["text"])
            assert result["caller"] == str(record.org_id)
        assert http_app._CURRENT_PRINCIPAL.get() is None
    finally:
        with pytest.raises(StopAsyncIteration):
            await agen.__anext__()


async def test_parent_app_mount_starts_transport_with_shared_state(monkeypatch):
    from unittest.mock import AsyncMock

    from interfaces.rest_api import main

    settings = _auth_settings()
    repo = _repo_for(_VALID_TOKEN, _record())

    class Store:
        stop = AsyncMock()

        async def tail(self):
            import asyncio

            await asyncio.Event().wait()
            if False:
                yield None

    state = SimpleNamespace(
        settings=settings,
        api_keys_repo=repo,
        event_store=Store(),
        pool=SimpleNamespace(close=AsyncMock()),
        agent_run_tasks=set(),
    )
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    monkeypatch.setattr(main, "build_state", AsyncMock(return_value=state))
    monkeypatch.setattr(main.agent, "resume_incomplete_agent_runs", AsyncMock(return_value=0))
    app = main.create_app()
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://mcp.test") as client,
    ):
        response = await client.post(
            "/mcp/",
            headers={**_MCP_HEADERS, "Authorization": f"Bearer {_VALID_TOKEN}"},
            json=_INIT_BODY,
        )
        assert response.status_code == 200
        assert app.state.telepace is state
    state.event_store.stop.assert_awaited_once()
    state.pool.close.assert_awaited_once()


def test_http_mount_is_disabled_by_default(monkeypatch):
    from interfaces.rest_api import main

    monkeypatch.setattr(
        main, "get_settings", lambda: Settings(_env_file=None, mcp_http_enabled=False)
    )
    app = main.create_app()
    assert all(getattr(route, "path", None) != "/mcp" for route in app.routes)

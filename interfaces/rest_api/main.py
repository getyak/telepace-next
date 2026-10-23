"""FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
import logging
from contextlib import AsyncExitStack, asynccontextmanager
from uuid import UUID

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.events import InterviewCompleted, StudyDrafted
from interfaces.mcp_server.http_app import build_http_app
from interfaces.realtime import voice_ws
from interfaces.rest_api import ws
from interfaces.rest_api.auth.api_keys_repo import ApiKeyRecord, ApiKeysRepo
from interfaces.rest_api.auth.oauth_google import router as oauth_google_router
from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.config import cors_allow_origin_regex, get_settings
from interfaces.rest_api.deps import AppState, build_state
from interfaces.rest_api.metering import meter_completion
from interfaces.rest_api.routers import (
    agent,
    api_keys,
    billing,
    campaigns,
    evaluations,
    health,
    interviews,
)
from interfaces.rest_api.worker import analyze_completion

logger = logging.getLogger(__name__)


class _LazyApiKeyVerifier:
    """Resolve the shared repository after parent startup initializes AppState."""

    def __init__(self, app: FastAPI) -> None:
        self._app = app

    def _repo(self) -> ApiKeysRepo:
        state: AppState = self._app.state.telepace
        if state.api_keys_repo is None:
            raise RuntimeError("API-key repository is not ready")
        return state.api_keys_repo

    async def verify(self, key_hash: str) -> ApiKeyRecord | None:
        return await self._repo().verify(key_hash)

    async def touch_last_used(self, key_id: UUID) -> None:
        await self._repo().touch_last_used(key_id)


async def _tail_loop(state: AppState) -> None:
    """Keep projections fresh and analyze completed interviews in-process.

    Interview events arrive over WebSocket and never pass through the REST
    write path, so without this loop the progress/insights projections only
    move when a researcher happens to trigger a write. StudyDrafted is
    skipped: it needs org_id + spec, which the create endpoint applies
    synchronously.
    """
    analysis_tasks: set[asyncio.Task[None]] = set()
    async for stored in state.event_store.tail():
        event = stored.event
        if not isinstance(event, StudyDrafted):
            try:
                await state.projector.apply(stored.seq, event)
            except Exception:
                logger.exception(
                    "tail projection apply failed seq=%s type=%s", stored.seq, event.type
                )
        if isinstance(event, InterviewCompleted):
            # Metering is awaited inline (fast: two indexed queries + one
            # insert) so quota counts are consistent before the next event.
            await meter_completion(state, event)
        if state.settings.embedded_worker and isinstance(event, InterviewCompleted):
            task = asyncio.create_task(analyze_completion(state, event))
            analysis_tasks.add(task)

            def _log_result(t: asyncio.Task) -> None:
                analysis_tasks.discard(t)
                if not t.cancelled() and t.exception() is not None:
                    logger.error("embedded analysis failed", exc_info=t.exception())

            task.add_done_callback(_log_result)


@asynccontextmanager
async def lifespan(app: FastAPI):
    state = await build_state()
    app.state.telepace = state
    tail_task = asyncio.create_task(_tail_loop(state))
    resumed = await agent.resume_incomplete_agent_runs(state)
    if resumed:
        logger.info("resumed %d agent runs after startup", resumed)
    try:
        # Mounted Starlette apps do not automatically inherit parent lifespan.
        async with AsyncExitStack() as stack:
            mcp_app = getattr(app.state, "mcp_http_app", None)
            if mcp_app is not None:
                await stack.enter_async_context(mcp_app.router.lifespan_context(mcp_app))
            yield
    finally:
        tail_task.cancel()
        for task in state.agent_run_tasks or set():
            task.cancel()
        await state.event_store.stop()
        await state.pool.close()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.api_title,
        version=settings.api_version_string,
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_origin_regex=cors_allow_origin_regex(settings.cors_allow_origins),
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    application.include_router(health.router)
    application.include_router(auth_router)
    application.include_router(api_keys.router, prefix=settings.api_version_prefix)
    application.include_router(oauth_google_router)
    application.include_router(campaigns.router)
    application.include_router(evaluations.router)
    application.include_router(interviews.router)
    application.include_router(billing.router)
    application.include_router(agent.router)
    application.include_router(ws.router)
    application.include_router(voice_ws.router)
    if settings.mcp_http_enabled:
        mcp_app = build_http_app(
            settings=settings,
            api_keys_repo=_LazyApiKeyVerifier(application),
            state_provider=lambda: application.state.telepace,
        )
        application.state.mcp_http_app = mcp_app
        application.mount("/mcp", mcp_app)
    return application


app = create_app()


def run() -> None:
    settings = get_settings()
    uvicorn.run(
        "interfaces.rest_api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )


if __name__ == "__main__":
    run()

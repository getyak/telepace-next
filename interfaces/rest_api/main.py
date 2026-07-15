"""FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.events import InterviewCompleted, StudyDrafted
from interfaces.realtime import voice_ws
from interfaces.rest_api import ws
from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.deps import AppState, build_state
from interfaces.rest_api.routers import agent, campaigns, health, interviews
from interfaces.rest_api.worker import analyze_completion

logger = logging.getLogger(__name__)


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
    try:
        yield
    finally:
        tail_task.cancel()
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
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    application.include_router(health.router)
    application.include_router(auth_router)
    application.include_router(campaigns.router)
    application.include_router(interviews.router)
    application.include_router(agent.router)
    application.include_router(ws.router)
    application.include_router(voice_ws.router)
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

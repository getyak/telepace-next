"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from interfaces.realtime import voice_ws
from interfaces.rest_api import ws
from interfaces.rest_api.auth.router import router as auth_router
from interfaces.rest_api.config import get_settings
from interfaces.rest_api.deps import build_state
from interfaces.rest_api.routers import campaigns, health, interviews


@asynccontextmanager
async def lifespan(app: FastAPI):
    state = await build_state()
    app.state.telepace = state
    try:
        yield
    finally:
        await state.event_store.stop()
        await state.pool.close()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title="telepace API", version="0.1.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health.router)
    application.include_router(auth_router)
    application.include_router(campaigns.router)
    application.include_router(interviews.router)
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

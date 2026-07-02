"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from interfaces.realtime import voice_ws
from interfaces.rest_api import ws
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


app = FastAPI(title="telepace API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(campaigns.router)
app.include_router(interviews.router)
app.include_router(ws.router)
app.include_router(voice_ws.router)


def run() -> None:
    uvicorn.run("interfaces.rest_api.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    run()

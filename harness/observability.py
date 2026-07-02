"""Tracer abstraction: NullTracer for local, LangfuseTracer for prod."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Protocol


class Tracer(Protocol):
    @asynccontextmanager
    async def span(self, name: str, **attrs: Any):  # type: ignore[no-untyped-def]
        yield


class NullTracer:
    @asynccontextmanager
    async def span(self, name: str, **attrs: Any):  # type: ignore[no-untyped-def]
        _ = name, attrs
        yield


class LangfuseTracer:
    """Thin adapter — real integration wires langfuse.Trace/Span here."""

    def __init__(self, client: Any) -> None:
        self._client = client

    @asynccontextmanager
    async def span(self, name: str, **attrs: Any):  # type: ignore[no-untyped-def]
        span = self._client.span(name=name, metadata=attrs) if self._client else None
        try:
            yield span
        finally:
            if span is not None:
                span.end()

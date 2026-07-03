"""In-memory event store for tests and local dev."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID

from core.constants import EVENT_READ_DEFAULT_LIMIT
from core.events import EventBase
from storage.event_store.base import EventStore, EventSubscriber, StoredEvent


class InMemoryEventStore(EventStore):
    def __init__(self) -> None:
        self._events: list[StoredEvent] = []
        self._subscribers: list[EventSubscriber] = []
        self._lock = asyncio.Lock()
        self._condition = asyncio.Condition()

    async def append(self, event: EventBase) -> StoredEvent:
        async with self._lock:
            seq = len(self._events) + 1
            stored = StoredEvent(seq=seq, event=event)
            self._events.append(stored)
        for sub in list(self._subscribers):
            await sub(stored)
        async with self._condition:
            self._condition.notify_all()
        return stored

    async def append_many(self, events: list[EventBase]) -> list[StoredEvent]:
        return [await self.append(e) for e in events]

    async def read_stream(self, campaign_id: UUID) -> list[StoredEvent]:
        return [s for s in self._events if s.event.campaign_id == campaign_id]

    async def read_from(
        self, seq: int, limit: int = EVENT_READ_DEFAULT_LIMIT
    ) -> list[StoredEvent]:
        return [s for s in self._events if s.seq > seq][:limit]

    async def subscribe(self, subscriber: EventSubscriber) -> None:
        self._subscribers.append(subscriber)

    async def tail(self) -> AsyncIterator[StoredEvent]:
        cursor = 0
        while True:
            async with self._condition:
                await self._condition.wait_for(lambda: len(self._events) > cursor)
                new = self._events[cursor:]
                cursor = len(self._events)
            for s in new:
                yield s

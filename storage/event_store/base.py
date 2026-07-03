"""Event store abstract interface. Two implementations: Postgres (prod), InMemory (tests)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from uuid import UUID

from core.constants import EVENT_READ_DEFAULT_LIMIT
from core.events import EventBase


@dataclass(frozen=True, slots=True)
class StoredEvent:
    seq: int
    event: EventBase


EventSubscriber = Callable[[StoredEvent], Awaitable[None]]


class EventStore(ABC):
    @abstractmethod
    async def append(self, event: EventBase) -> StoredEvent: ...

    @abstractmethod
    async def append_many(self, events: list[EventBase]) -> list[StoredEvent]: ...

    @abstractmethod
    async def read_stream(self, campaign_id: UUID) -> list[StoredEvent]: ...

    @abstractmethod
    async def read_from(
        self, seq: int, limit: int = EVENT_READ_DEFAULT_LIMIT
    ) -> list[StoredEvent]: ...

    @abstractmethod
    async def subscribe(self, subscriber: EventSubscriber) -> None:
        """Register a live-tail subscriber. Called for every appended event."""

    @abstractmethod
    async def tail(self) -> AsyncIterator[StoredEvent]: ...

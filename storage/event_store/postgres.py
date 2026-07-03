"""Postgres event store implementation. Uses asyncpg + LISTEN/NOTIFY for tail."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

import asyncpg
import orjson

from core.constants import (
    EVENT_READ_DEFAULT_LIMIT,
    EVENT_TAIL_QUEUE_MAX,
    PG_NOTIFY_CHANNEL,
)
from core.events import EventBase, load_event
from storage.event_store.base import EventStore, EventSubscriber, StoredEvent

SCHEMA_SQL = f"""
CREATE TABLE IF NOT EXISTS events (
    id             UUID PRIMARY KEY,
    campaign_id    UUID NOT NULL,
    type           TEXT NOT NULL,
    actor          TEXT NOT NULL DEFAULT 'system',
    ts             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    schema_version INTEGER NOT NULL DEFAULT 1,
    payload        JSONB NOT NULL,
    seq            BIGSERIAL UNIQUE
);
CREATE INDEX IF NOT EXISTS events_campaign_ts_idx ON events (campaign_id, ts);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (type);

CREATE OR REPLACE FUNCTION notify_new_event() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('{PG_NOTIFY_CHANNEL}', NEW.seq::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_notify ON events;
CREATE TRIGGER events_notify AFTER INSERT ON events
FOR EACH ROW EXECUTE FUNCTION notify_new_event();
"""


class PostgresEventStore(EventStore):
    def __init__(
        self,
        dsn: str,
        *,
        pool_min_size: int,
        pool_max_size: int,
        maintenance_interval_s: int,
        tail_queue_max: int = EVENT_TAIL_QUEUE_MAX,
    ) -> None:
        self._dsn = dsn
        self._pool_min_size = pool_min_size
        self._pool_max_size = pool_max_size
        self._maintenance_interval_s = maintenance_interval_s
        self._pool: asyncpg.Pool | None = None
        self._subscribers: list[EventSubscriber] = []
        self._tail_queue: asyncio.Queue[StoredEvent] = asyncio.Queue(maxsize=tail_queue_max)
        self._listen_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._pool = await asyncpg.create_pool(
            self._dsn, min_size=self._pool_min_size, max_size=self._pool_max_size
        )
        async with self._pool.acquire() as conn:
            await conn.execute(SCHEMA_SQL)
        self._listen_task = asyncio.create_task(self._listen_loop())

    async def stop(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
        if self._pool:
            await self._pool.close()

    async def append(self, event: EventBase) -> StoredEvent:
        assert self._pool is not None, "call start() first"
        payload = event.model_dump(mode="json")
        row = await self._pool.fetchrow(
            """
            INSERT INTO events (id, campaign_id, type, actor, ts, schema_version, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING seq
            """,
            event.id,
            event.campaign_id,
            payload["type"],
            event.actor,
            event.ts,
            event.schema_version,
            orjson.dumps(payload).decode(),
        )
        stored = StoredEvent(seq=row["seq"], event=event)
        for sub in list(self._subscribers):
            await sub(stored)
        return stored

    async def append_many(self, events: list[EventBase]) -> list[StoredEvent]:
        return [await self.append(e) for e in events]

    async def read_stream(self, campaign_id: UUID) -> list[StoredEvent]:
        assert self._pool is not None
        rows = await self._pool.fetch(
            "SELECT seq, payload FROM events WHERE campaign_id=$1 ORDER BY seq ASC",
            campaign_id,
        )
        return [StoredEvent(seq=r["seq"], event=load_event(json.loads(r["payload"]))) for r in rows]

    async def read_from(self, seq: int, limit: int = EVENT_READ_DEFAULT_LIMIT) -> list[StoredEvent]:
        assert self._pool is not None
        rows = await self._pool.fetch(
            "SELECT seq, payload FROM events WHERE seq > $1 ORDER BY seq ASC LIMIT $2",
            seq,
            limit,
        )
        return [StoredEvent(seq=r["seq"], event=load_event(json.loads(r["payload"]))) for r in rows]

    async def subscribe(self, subscriber: EventSubscriber) -> None:
        self._subscribers.append(subscriber)

    async def tail(self) -> AsyncIterator[StoredEvent]:
        while True:
            stored = await self._tail_queue.get()
            yield stored

    async def _listen_loop(self) -> None:
        assert self._pool is not None
        conn = await asyncpg.connect(self._dsn)

        async def on_notify(_conn: object, _pid: int, _ch: str, payload: str) -> None:
            try:
                target_seq = int(payload)
            except ValueError:
                return
            row = await self._pool.fetchrow(
                "SELECT seq, payload FROM events WHERE seq=$1", target_seq
            )
            if row is None:
                return
            stored = StoredEvent(seq=row["seq"], event=load_event(json.loads(row["payload"])))
            try:
                self._tail_queue.put_nowait(stored)
            except asyncio.QueueFull:
                pass

        await conn.add_listener(PG_NOTIFY_CHANNEL, on_notify)
        try:
            while True:
                await asyncio.sleep(self._maintenance_interval_s)
        finally:
            await conn.remove_listener(PG_NOTIFY_CHANNEL, on_notify)
            await conn.close()

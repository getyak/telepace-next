"""Durable storage for conversational agent runs and their replayable events."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID, uuid4

import asyncpg

AGENT_RUNS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,
    author_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
    messages JSONB NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_org_created_idx
    ON agent_runs (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_events (
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_artifacts_run_idx ON agent_artifacts (run_id, created_at);

CREATE TABLE IF NOT EXISTS agent_memories (
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, name)
);

CREATE TABLE IF NOT EXISTS agent_run_confirmations (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    tool_name TEXT NOT NULL,
    arguments JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
"""


@dataclass(frozen=True, slots=True)
class AgentRun:
    id: UUID
    org_id: UUID
    author_id: UUID
    status: str
    messages: list[dict[str, str]]
    error: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class AgentRunEvent:
    run_id: UUID
    seq: int
    payload: dict[str, Any]
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AgentArtifact:
    id: UUID
    run_id: UUID
    org_id: UUID
    content: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AgentMemory:
    org_id: UUID
    name: str
    body: str
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class AgentConfirmation:
    id: UUID
    run_id: UUID
    org_id: UUID
    tool_name: str
    arguments: dict[str, Any]
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class AgentRunStore(Protocol):
    async def create(
        self,
        *,
        org_id: UUID,
        author_id: UUID,
        messages: list[dict[str, str]],
    ) -> AgentRun: ...

    async def append(self, run_id: UUID, payload: dict[str, Any]) -> AgentRunEvent: ...

    async def finish(self, run_id: UUID, *, status: str, error: str | None = None) -> None: ...

    async def get(self, run_id: UUID) -> AgentRun | None: ...

    async def read_events(self, run_id: UUID, *, after: int = 0) -> list[AgentRunEvent]: ...

    async def list_running(self) -> list[AgentRun]: ...


class AgentArtifactStore(Protocol):
    async def write_artifact(
        self,
        *,
        run_id: UUID,
        org_id: UUID,
        content: str,
    ) -> AgentArtifact: ...

    async def read_artifact(self, artifact_id: UUID, *, org_id: UUID) -> AgentArtifact | None: ...


class AgentMemoryStore(Protocol):
    async def list_memories(self, *, org_id: UUID) -> list[AgentMemory]: ...

    async def upsert_memory(self, *, org_id: UUID, name: str, body: str) -> AgentMemory: ...

    async def delete_memory(self, *, org_id: UUID, name: str) -> bool: ...


class AgentConfirmationStore(Protocol):
    async def create_confirmation(
        self,
        *,
        run_id: UUID,
        org_id: UUID,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> AgentConfirmation: ...

    async def get_confirmation(
        self,
        confirmation_id: UUID,
        *,
        org_id: UUID,
    ) -> AgentConfirmation | None: ...

    async def resolve_confirmation(
        self,
        confirmation_id: UUID,
        *,
        org_id: UUID,
        approved: bool,
    ) -> AgentConfirmation | None: ...


class PostgresAgentRunStore:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(
        self,
        *,
        org_id: UUID,
        author_id: UUID,
        messages: list[dict[str, str]],
    ) -> AgentRun:
        run_id = uuid4()
        now = datetime.now(UTC)
        await self._pool.execute(
            """
            INSERT INTO agent_runs
                (id, org_id, author_id, status, messages, created_at, updated_at)
            VALUES ($1, $2, $3, 'running', $4::jsonb, $5, $5)
            """,
            run_id,
            org_id,
            author_id,
            json.dumps(messages),
            now,
        )
        return AgentRun(
            id=run_id,
            org_id=org_id,
            author_id=author_id,
            status="running",
            messages=messages,
            error=None,
            created_at=now,
            updated_at=now,
        )

    async def append(self, run_id: UUID, payload: dict[str, Any]) -> AgentRunEvent:
        now = datetime.now(UTC)
        async with self._pool.acquire() as conn, conn.transaction():
            # A run has one driver, but locking the parent makes seq assignment
            # safe if recovery briefly overlaps a stale worker.
            await conn.fetchval("SELECT id FROM agent_runs WHERE id=$1 FOR UPDATE", run_id)
            seq = await conn.fetchval(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_run_events WHERE run_id=$1",
                run_id,
            )
            await conn.execute(
                """
                INSERT INTO agent_run_events (run_id, seq, payload, created_at)
                VALUES ($1, $2, $3::jsonb, $4)
                """,
                run_id,
                seq,
                json.dumps(payload, default=str),
                now,
            )
        return AgentRunEvent(
            run_id=run_id,
            seq=int(seq),
            payload=payload,
            created_at=now,
        )

    async def finish(self, run_id: UUID, *, status: str, error: str | None = None) -> None:
        if status not in {"completed", "incomplete", "failed"}:
            raise ValueError(f"invalid terminal run status: {status}")
        await self._pool.execute(
            """
            UPDATE agent_runs
               SET status=$2, error=$3, updated_at=now()
             WHERE id=$1
            """,
            run_id,
            status,
            error,
        )

    async def get(self, run_id: UUID) -> AgentRun | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, org_id, author_id, status, messages, error, created_at, updated_at
              FROM agent_runs
             WHERE id=$1
            """,
            run_id,
        )
        if row is None:
            return None
        messages = row["messages"]
        if isinstance(messages, str):
            messages = json.loads(messages)
        return AgentRun(
            id=row["id"],
            org_id=row["org_id"],
            author_id=row["author_id"],
            status=row["status"],
            messages=list(messages),
            error=row["error"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def read_events(self, run_id: UUID, *, after: int = 0) -> list[AgentRunEvent]:
        rows = await self._pool.fetch(
            """
            SELECT run_id, seq, payload, created_at
              FROM agent_run_events
             WHERE run_id=$1 AND seq>$2
             ORDER BY seq
            """,
            run_id,
            after,
        )
        events = []
        for row in rows:
            payload = row["payload"]
            if isinstance(payload, str):
                payload = json.loads(payload)
            events.append(
                AgentRunEvent(
                    run_id=row["run_id"],
                    seq=row["seq"],
                    payload=dict(payload),
                    created_at=row["created_at"],
                )
            )
        return events

    async def list_running(self) -> list[AgentRun]:
        rows = await self._pool.fetch(
            """
            SELECT id, org_id, author_id, status, messages, error, created_at, updated_at
              FROM agent_runs
             WHERE status='running'
             ORDER BY created_at
            """
        )
        runs = []
        for row in rows:
            messages = row["messages"]
            if isinstance(messages, str):
                messages = json.loads(messages)
            runs.append(
                AgentRun(
                    id=row["id"],
                    org_id=row["org_id"],
                    author_id=row["author_id"],
                    status=row["status"],
                    messages=list(messages),
                    error=row["error"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )
        return runs

    async def write_artifact(
        self,
        *,
        run_id: UUID,
        org_id: UUID,
        content: str,
    ) -> AgentArtifact:
        artifact = AgentArtifact(
            id=uuid4(),
            run_id=run_id,
            org_id=org_id,
            content=content,
            created_at=datetime.now(UTC),
        )
        await self._pool.execute(
            """
            INSERT INTO agent_artifacts (id, run_id, org_id, content, created_at)
            VALUES ($1, $2, $3, $4, $5)
            """,
            artifact.id,
            artifact.run_id,
            artifact.org_id,
            artifact.content,
            artifact.created_at,
        )
        return artifact

    async def read_artifact(self, artifact_id: UUID, *, org_id: UUID) -> AgentArtifact | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, run_id, org_id, content, created_at
              FROM agent_artifacts
             WHERE id=$1 AND org_id=$2
            """,
            artifact_id,
            org_id,
        )
        if row is None:
            return None
        return AgentArtifact(
            id=row["id"],
            run_id=row["run_id"],
            org_id=row["org_id"],
            content=row["content"],
            created_at=row["created_at"],
        )

    async def list_memories(self, *, org_id: UUID) -> list[AgentMemory]:
        rows = await self._pool.fetch(
            """
            SELECT org_id, name, body, updated_at
              FROM agent_memories
             WHERE org_id=$1
             ORDER BY updated_at DESC
             LIMIT 20
            """,
            org_id,
        )
        return [
            AgentMemory(
                org_id=row["org_id"],
                name=row["name"],
                body=row["body"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    async def upsert_memory(self, *, org_id: UUID, name: str, body: str) -> AgentMemory:
        row = await self._pool.fetchrow(
            """
            INSERT INTO agent_memories (org_id, name, body, updated_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (org_id, name)
            DO UPDATE SET body=EXCLUDED.body, updated_at=now()
            RETURNING org_id, name, body, updated_at
            """,
            org_id,
            name,
            body,
        )
        assert row is not None
        return AgentMemory(
            org_id=row["org_id"],
            name=row["name"],
            body=row["body"],
            updated_at=row["updated_at"],
        )

    async def delete_memory(self, *, org_id: UUID, name: str) -> bool:
        result = await self._pool.execute(
            "DELETE FROM agent_memories WHERE org_id=$1 AND name=$2",
            org_id,
            name,
        )
        return result == "DELETE 1"

    async def create_confirmation(
        self,
        *,
        run_id: UUID,
        org_id: UUID,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> AgentConfirmation:
        confirmation = AgentConfirmation(
            id=uuid4(),
            run_id=run_id,
            org_id=org_id,
            tool_name=tool_name,
            arguments=arguments,
            status="pending",
            created_at=datetime.now(UTC),
        )
        await self._pool.execute(
            """
            INSERT INTO agent_run_confirmations
                (id, run_id, org_id, tool_name, arguments, status, created_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6)
            """,
            confirmation.id,
            confirmation.run_id,
            confirmation.org_id,
            confirmation.tool_name,
            json.dumps(confirmation.arguments, default=str),
            confirmation.created_at,
        )
        return confirmation

    async def get_confirmation(
        self,
        confirmation_id: UUID,
        *,
        org_id: UUID,
    ) -> AgentConfirmation | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, run_id, org_id, tool_name, arguments, status, created_at, resolved_at
              FROM agent_run_confirmations
             WHERE id=$1 AND org_id=$2
            """,
            confirmation_id,
            org_id,
        )
        if row is None:
            return None
        arguments = row["arguments"]
        if isinstance(arguments, str):
            arguments = json.loads(arguments)
        return AgentConfirmation(
            id=row["id"],
            run_id=row["run_id"],
            org_id=row["org_id"],
            tool_name=row["tool_name"],
            arguments=dict(arguments),
            status=row["status"],
            created_at=row["created_at"],
            resolved_at=row["resolved_at"],
        )

    async def resolve_confirmation(
        self,
        confirmation_id: UUID,
        *,
        org_id: UUID,
        approved: bool,
    ) -> AgentConfirmation | None:
        await self._pool.execute(
            """
            UPDATE agent_run_confirmations
               SET status=$3, resolved_at=now()
             WHERE id=$1 AND org_id=$2 AND status='pending'
            """,
            confirmation_id,
            org_id,
            "approved" if approved else "denied",
        )
        return await self.get_confirmation(confirmation_id, org_id=org_id)


class InMemoryAgentRunStore:
    """Test/local fallback with the same replay contract as Postgres."""

    def __init__(self) -> None:
        self._runs: dict[UUID, AgentRun] = {}
        self._events: dict[UUID, list[AgentRunEvent]] = {}
        self._artifacts: dict[UUID, AgentArtifact] = {}
        self._memories: dict[tuple[UUID, str], AgentMemory] = {}
        self._confirmations: dict[UUID, AgentConfirmation] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        *,
        org_id: UUID,
        author_id: UUID,
        messages: list[dict[str, str]],
    ) -> AgentRun:
        now = datetime.now(UTC)
        run = AgentRun(
            id=uuid4(),
            org_id=org_id,
            author_id=author_id,
            status="running",
            messages=messages,
            error=None,
            created_at=now,
            updated_at=now,
        )
        async with self._lock:
            self._runs[run.id] = run
            self._events[run.id] = []
        return run

    async def append(self, run_id: UUID, payload: dict[str, Any]) -> AgentRunEvent:
        async with self._lock:
            if run_id not in self._runs:
                raise KeyError(f"unknown agent run: {run_id}")
            event = AgentRunEvent(
                run_id=run_id,
                seq=len(self._events[run_id]) + 1,
                payload=payload,
                created_at=datetime.now(UTC),
            )
            self._events[run_id].append(event)
            return event

    async def finish(self, run_id: UUID, *, status: str, error: str | None = None) -> None:
        if status not in {"completed", "incomplete", "failed"}:
            raise ValueError(f"invalid terminal run status: {status}")
        async with self._lock:
            run = self._runs[run_id]
            self._runs[run_id] = AgentRun(
                id=run.id,
                org_id=run.org_id,
                author_id=run.author_id,
                status=status,
                messages=run.messages,
                error=error,
                created_at=run.created_at,
                updated_at=datetime.now(UTC),
            )

    async def get(self, run_id: UUID) -> AgentRun | None:
        return self._runs.get(run_id)

    async def read_events(self, run_id: UUID, *, after: int = 0) -> list[AgentRunEvent]:
        return [event for event in self._events.get(run_id, []) if event.seq > after]

    async def list_running(self) -> list[AgentRun]:
        return [run for run in self._runs.values() if run.status == "running"]

    async def write_artifact(
        self,
        *,
        run_id: UUID,
        org_id: UUID,
        content: str,
    ) -> AgentArtifact:
        artifact = AgentArtifact(
            id=uuid4(),
            run_id=run_id,
            org_id=org_id,
            content=content,
            created_at=datetime.now(UTC),
        )
        async with self._lock:
            if run_id not in self._runs or self._runs[run_id].org_id != org_id:
                raise KeyError(f"unknown agent run: {run_id}")
            self._artifacts[artifact.id] = artifact
        return artifact

    async def read_artifact(self, artifact_id: UUID, *, org_id: UUID) -> AgentArtifact | None:
        artifact = self._artifacts.get(artifact_id)
        if artifact is None or artifact.org_id != org_id:
            return None
        return artifact

    async def list_memories(self, *, org_id: UUID) -> list[AgentMemory]:
        values = [memory for memory in self._memories.values() if memory.org_id == org_id]
        return sorted(values, key=lambda memory: memory.updated_at, reverse=True)[:20]

    async def upsert_memory(self, *, org_id: UUID, name: str, body: str) -> AgentMemory:
        memory = AgentMemory(
            org_id=org_id,
            name=name,
            body=body,
            updated_at=datetime.now(UTC),
        )
        async with self._lock:
            self._memories[(org_id, name)] = memory
        return memory

    async def delete_memory(self, *, org_id: UUID, name: str) -> bool:
        async with self._lock:
            return self._memories.pop((org_id, name), None) is not None

    async def create_confirmation(
        self,
        *,
        run_id: UUID,
        org_id: UUID,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> AgentConfirmation:
        confirmation = AgentConfirmation(
            id=uuid4(),
            run_id=run_id,
            org_id=org_id,
            tool_name=tool_name,
            arguments=arguments,
            status="pending",
            created_at=datetime.now(UTC),
        )
        async with self._lock:
            self._confirmations[confirmation.id] = confirmation
        return confirmation

    async def get_confirmation(
        self,
        confirmation_id: UUID,
        *,
        org_id: UUID,
    ) -> AgentConfirmation | None:
        confirmation = self._confirmations.get(confirmation_id)
        if confirmation is None or confirmation.org_id != org_id:
            return None
        return confirmation

    async def resolve_confirmation(
        self,
        confirmation_id: UUID,
        *,
        org_id: UUID,
        approved: bool,
    ) -> AgentConfirmation | None:
        async with self._lock:
            current = self._confirmations.get(confirmation_id)
            if current is None or current.org_id != org_id:
                return None
            if current.status != "pending":
                return current
            resolved = AgentConfirmation(
                id=current.id,
                run_id=current.run_id,
                org_id=current.org_id,
                tool_name=current.tool_name,
                arguments=current.arguments,
                status="approved" if approved else "denied",
                created_at=current.created_at,
                resolved_at=datetime.now(UTC),
            )
            self._confirmations[confirmation_id] = resolved
            return resolved

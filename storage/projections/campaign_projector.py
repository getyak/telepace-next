"""Campaign projection: reduce events into read-optimized views."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg
import orjson
from pydantic import BaseModel

from core.domain.models import Campaign, CampaignSpec, CampaignStatus
from core.events import (
    CampaignClosed,
    CampaignPublished,
    CampaignReady,
    EventBase,
    InsightGenerated,
    InterviewAbandoned,
    InterviewCompleted,
    InterviewStarted,
    InviteDispatched,
    SpecUpdated,
    StudyDrafted,
)

CAMPAIGN_PROJECTION_SQL = """
CREATE TABLE IF NOT EXISTS campaigns (
    id             UUID PRIMARY KEY,
    org_id         UUID NOT NULL,
    author_id      UUID NOT NULL,
    title          TEXT NOT NULL,
    status         TEXT NOT NULL,
    spec           JSONB NOT NULL,
    version        INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL,
    last_event_seq BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS campaigns_org_status_idx ON campaigns (org_id, status);

CREATE TABLE IF NOT EXISTS progress_snapshots (
    campaign_id            UUID PRIMARY KEY,
    invited                INTEGER NOT NULL DEFAULT 0,
    started                INTEGER NOT NULL DEFAULT 0,
    completed              INTEGER NOT NULL DEFAULT 0,
    abandoned              INTEGER NOT NULL DEFAULT 0,
    total_duration_seconds BIGINT NOT NULL DEFAULT 0,
    total_goal_coverage    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    spent_usd              DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE progress_snapshots ADD COLUMN IF NOT EXISTS last_event_seq BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS insights (
    id          UUID PRIMARY KEY,
    campaign_id UUID NOT NULL,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    confidence  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    body        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS insights_campaign_idx ON insights (campaign_id, created_at DESC);
"""


class CampaignProjection(BaseModel):
    id: UUID
    org_id: UUID
    author_id: UUID
    title: str
    status: CampaignStatus
    spec: CampaignSpec
    version: int
    created_at: datetime
    updated_at: datetime
    last_event_seq: int

    def to_domain(self) -> Campaign:
        return Campaign(
            id=self.id,
            org_id=self.org_id,
            author_id=self.author_id,
            title=self.title,
            status=self.status,
            spec=self.spec,
            version=self.version,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


@dataclass(slots=True)
class ProgressSnapshot:
    campaign_id: UUID
    invited: int = 0
    started: int = 0
    completed: int = 0
    abandoned: int = 0
    total_duration_seconds: int = 0
    total_goal_coverage: float = 0.0
    spent_usd: float = 0.0
    _meta: dict[str, Any] = field(default_factory=dict)

    @property
    def avg_duration_seconds(self) -> float:
        return self.total_duration_seconds / self.completed if self.completed else 0.0

    @property
    def avg_goal_coverage(self) -> float:
        return self.total_goal_coverage / self.completed if self.completed else 0.0


class CampaignProjector:
    """Applies events to Postgres projection tables. Idempotent per (campaign_id, seq)."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def apply(
        self,
        seq: int,
        event: EventBase,
        *,
        org_id: UUID | None = None,
        initial_spec: CampaignSpec | None = None,
    ) -> None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                if isinstance(event, StudyDrafted):
                    assert initial_spec is not None and org_id is not None
                    await conn.execute(
                        """
                        INSERT INTO campaigns
                          (id, org_id, author_id, title, status, spec, version, created_at, updated_at, last_event_seq)
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1, $7, $7, $8)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        event.campaign_id,
                        org_id,
                        event.author_id,
                        event.title,
                        CampaignStatus.DRAFT.value,
                        orjson.dumps(initial_spec.model_dump(mode="json")).decode(),
                        event.ts,
                        seq,
                    )
                elif isinstance(event, SpecUpdated):
                    await conn.execute(
                        """
                        UPDATE campaigns
                        SET spec = spec || $2::jsonb,
                            updated_at = $3,
                            last_event_seq = $4,
                            version = version + 1
                        WHERE id = $1
                        """,
                        event.campaign_id,
                        orjson.dumps(event.patch).decode(),
                        event.ts,
                        seq,
                    )
                elif isinstance(event, CampaignReady | CampaignPublished | CampaignClosed):
                    status = {
                        CampaignReady: CampaignStatus.READY,
                        CampaignPublished: CampaignStatus.LIVE,
                        CampaignClosed: CampaignStatus.CLOSED,
                    }[type(event)]
                    await conn.execute(
                        "UPDATE campaigns SET status=$2, updated_at=$3, last_event_seq=$4 WHERE id=$1",
                        event.campaign_id,
                        status.value,
                        event.ts,
                        seq,
                    )
                elif isinstance(event, InviteDispatched):
                    await self._bump(conn, event.campaign_id, seq, invited=1)
                elif isinstance(event, InterviewStarted):
                    await self._bump(conn, event.campaign_id, seq, started=1)
                elif isinstance(event, InterviewCompleted):
                    await self._bump(
                        conn,
                        event.campaign_id,
                        seq,
                        completed=1,
                        total_duration_seconds=event.duration_seconds,
                        total_goal_coverage=event.goal_coverage,
                    )
                elif isinstance(event, InterviewAbandoned):
                    await self._bump(conn, event.campaign_id, seq, abandoned=1)
                elif isinstance(event, InsightGenerated):
                    await conn.execute(
                        """
                        INSERT INTO insights (id, campaign_id, kind, title, confidence, body, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        event.insight_id,
                        event.campaign_id,
                        event.kind,
                        event.title,
                        event.confidence,
                        orjson.dumps(event.body).decode(),
                        event.ts,
                    )

    @staticmethod
    async def _bump(
        conn: asyncpg.Connection,
        campaign_id: UUID,
        seq: int,
        *,
        invited: int = 0,
        started: int = 0,
        completed: int = 0,
        abandoned: int = 0,
        total_duration_seconds: int = 0,
        total_goal_coverage: float = 0.0,
    ) -> None:
        # last_event_seq guard makes counter bumps idempotent: replays (e.g.
        # the router's sync re-application of a whole stream) and the live
        # tail loop can both apply the same event without double counting.
        await conn.execute(
            """
            INSERT INTO progress_snapshots
              (campaign_id, invited, started, completed, abandoned, total_duration_seconds, total_goal_coverage, updated_at, last_event_seq)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
            ON CONFLICT (campaign_id) DO UPDATE SET
              invited = progress_snapshots.invited + EXCLUDED.invited,
              started = progress_snapshots.started + EXCLUDED.started,
              completed = progress_snapshots.completed + EXCLUDED.completed,
              abandoned = progress_snapshots.abandoned + EXCLUDED.abandoned,
              total_duration_seconds = progress_snapshots.total_duration_seconds + EXCLUDED.total_duration_seconds,
              total_goal_coverage = progress_snapshots.total_goal_coverage + EXCLUDED.total_goal_coverage,
              updated_at = NOW(),
              last_event_seq = EXCLUDED.last_event_seq
            WHERE progress_snapshots.last_event_seq < EXCLUDED.last_event_seq
            """,
            campaign_id,
            invited,
            started,
            completed,
            abandoned,
            total_duration_seconds,
            total_goal_coverage,
            seq,
        )

    async def get_campaign(self, campaign_id: UUID) -> CampaignProjection | None:
        row = await self._pool.fetchrow("SELECT * FROM campaigns WHERE id=$1", campaign_id)
        if row is None:
            return None
        return CampaignProjection(
            id=row["id"],
            org_id=row["org_id"],
            author_id=row["author_id"],
            title=row["title"],
            status=CampaignStatus(row["status"]),
            spec=CampaignSpec.model_validate_json(row["spec"]),
            version=row["version"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            last_event_seq=row["last_event_seq"],
        )

    async def get_progress(self, campaign_id: UUID) -> ProgressSnapshot:
        row = await self._pool.fetchrow(
            "SELECT * FROM progress_snapshots WHERE campaign_id=$1", campaign_id
        )
        if row is None:
            return ProgressSnapshot(campaign_id=campaign_id)
        return ProgressSnapshot(
            campaign_id=campaign_id,
            invited=row["invited"],
            started=row["started"],
            completed=row["completed"],
            abandoned=row["abandoned"],
            total_duration_seconds=row["total_duration_seconds"],
            total_goal_coverage=row["total_goal_coverage"],
            spent_usd=row["spent_usd"],
        )

    async def list_campaigns(self, org_id: UUID) -> list[dict[str, Any]]:
        """All campaigns for an org, newest first, with progress counters inlined."""
        rows = await self._pool.fetch(
            """
            SELECT c.id, c.title, c.status, c.spec, c.created_at, c.updated_at,
                   COALESCE(p.invited, 0)   AS invited,
                   COALESCE(p.started, 0)   AS started,
                   COALESCE(p.completed, 0) AS completed,
                   COALESCE(p.abandoned, 0) AS abandoned
            FROM campaigns c
            LEFT JOIN progress_snapshots p ON p.campaign_id = c.id
            WHERE c.org_id = $1
            ORDER BY c.updated_at DESC
            """,
            org_id,
        )
        out: list[dict[str, Any]] = []
        for row in rows:
            spec = CampaignSpec.model_validate_json(row["spec"])
            out.append(
                {
                    "id": str(row["id"]),
                    "title": row["title"],
                    "status": row["status"],
                    "goal": spec.goal,
                    "target_completions": spec.target_completions,
                    "question_count": len(spec.outline.items),
                    "created_at": row["created_at"].isoformat(),
                    "updated_at": row["updated_at"].isoformat(),
                    "progress": {
                        "invited": row["invited"],
                        "started": row["started"],
                        "completed": row["completed"],
                        "abandoned": row["abandoned"],
                    },
                }
            )
        return out

    async def list_insights(self, campaign_id: UUID) -> list[dict[str, Any]]:
        """All persisted insights for one campaign, newest first."""
        rows = await self._pool.fetch(
            """
            SELECT id, kind, title, confidence, body, created_at
            FROM insights
            WHERE campaign_id = $1
            ORDER BY created_at DESC, confidence DESC
            """,
            campaign_id,
        )
        return [
            {
                "id": str(row["id"]),
                "kind": row["kind"],
                "title": row["title"],
                "confidence": row["confidence"],
                "body": orjson.loads(row["body"]),
                "created_at": row["created_at"].isoformat(),
            }
            for row in rows
        ]

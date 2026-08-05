"""Build a campaign-scoped evidence read model from durable events.

The researcher dashboard and report must never fall back to sample respondents
or synthetic findings. This module reconstructs exactly what happened in one
campaign and deliberately exposes only respondent-facing transcript content,
provenance, and completion metrics needed by those authenticated views.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any
from uuid import UUID

from core.events import (
    InterviewAbandoned,
    InterviewCompleted,
    InterviewStarted,
    InviteDispatched,
    RespondentJoined,
    TurnRecorded,
)


def build_campaign_evidence(
    campaign_id: UUID,
    stored_events: Iterable[Any],
    insight_rows: list[dict[str, Any]],
    *,
    campaign_title: str = "",
    research_goal: str = "",
    outline_item_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Return a JSON-safe, campaign-only evidence document.

    ``stored_events`` accepts the EventStore's ``StoredEvent`` wrappers and
    plain events to keep the reducer independently testable.
    """

    interviews: dict[UUID, dict[str, Any]] = {}
    external_refs: dict[UUID, str] = {}
    allowed_outline_item_ids = set(outline_item_ids or [])

    def row_for(interview_id: UUID) -> dict[str, Any]:
        return interviews.setdefault(
            interview_id,
            {
                "interview_id": str(interview_id),
                # Legacy streams may predate RespondentJoined. A stable,
                # non-PII fallback is preferable to inventing a participant.
                "respondent_id": str(interview_id),
                "source": "direct",
                "channel": "web_text",
                "external_ref": None,
                "status": "in_progress",
                "started_at": None,
                "completed_at": None,
                "duration_seconds": None,
                "goal_coverage": 0.0,
                "turns": [],
                "_covered_outline_item_ids": set(),
            },
        )

    for stored in stored_events:
        event = getattr(stored, "event", stored)
        if getattr(event, "campaign_id", None) != campaign_id:
            continue

        if isinstance(event, InviteDispatched):
            if event.external_id:
                external_refs[event.respondent_id] = event.external_id
            continue

        if isinstance(event, RespondentJoined):
            row = row_for(event.interview_id)
            row.update(
                {
                    "respondent_id": str(event.respondent_id),
                    "source": event.source or "direct",
                    "channel": event.channel,
                    "external_ref": external_refs.get(event.respondent_id),
                    "started_at": event.ts.isoformat(),
                }
            )
            continue

        if isinstance(event, InterviewStarted):
            row = row_for(event.interview_id)
            row["started_at"] = row["started_at"] or event.ts.isoformat()
            continue

        if isinstance(event, TurnRecorded):
            row = row_for(event.interview_id)
            if (
                event.role == "interviewer"
                and event.outline_item_id is not None
                and (
                    outline_item_ids is None
                    or str(event.outline_item_id) in allowed_outline_item_ids
                )
            ):
                row["_covered_outline_item_ids"].add(str(event.outline_item_id))
            row["turns"].append(
                {
                    "id": str(event.id),
                    "order": event.order,
                    "role": event.role,
                    "text": event.text,
                    "started_at": event.ts.isoformat(),
                    "latency_ms": event.latency_ms,
                }
            )
            continue

        if isinstance(event, InterviewCompleted):
            row = row_for(event.interview_id)
            row.update(
                {
                    "status": "completed",
                    "completed_at": event.ts.isoformat(),
                    "duration_seconds": event.duration_seconds,
                    "goal_coverage": event.goal_coverage,
                }
            )
            continue

        if isinstance(event, InterviewAbandoned):
            row = row_for(event.interview_id)
            row.update(
                {
                    "status": "abandoned",
                    "completed_at": event.ts.isoformat(),
                }
            )

    for row in interviews.values():
        row["turns"].sort(key=lambda turn: (turn["order"], turn["started_at"]))
        covered_ids = row.pop("_covered_outline_item_ids")
        if (
            row["status"] == "completed"
            and outline_item_ids
            and isinstance(covered_ids, set)
        ):
            # The opening question is sent in HELLO rather than recorded as a
            # separate interviewer turn. Any completed interview with durable
            # turns therefore covered the first guide item as well.
            if row["turns"]:
                covered_ids.add(outline_item_ids[0])
            # Legacy completions written before deterministic interviewer
            # progress carried 0.0 even though every outline question had a
            # durable TurnRecorded reference. Reconstruct the honest value
            # from those event references without mutating history.
            reconstructed = len(covered_ids & allowed_outline_item_ids) / len(
                allowed_outline_item_ids
            )
            row["goal_coverage"] = max(row["goal_coverage"], reconstructed)

    ordered_interviews = sorted(
        interviews.values(),
        key=lambda row: row["completed_at"] or row["started_at"] or "",
        reverse=True,
    )
    generated_at = insight_rows[0].get("created_at") if insight_rows else None
    return {
        "campaign_id": str(campaign_id),
        "campaign_title": campaign_title,
        "research_goal": research_goal,
        "generated_at": generated_at,
        "insights": insight_rows,
        "interviews": ordered_interviews,
    }

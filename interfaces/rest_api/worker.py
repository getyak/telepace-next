"""Background worker: subscribes to event store, runs Analyst on completions."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any
from uuid import UUID

from core.events import (
    InsightSetReplaced,
    InterviewCompleted,
    TurnRecorded,
)
from interfaces.rest_api.deps import AppState, build_state
from storage.event_store import StoredEvent

logger = logging.getLogger(__name__)


def _completed_transcripts(all_events: list[Any]):
    """Rebuild every completed interview for campaign-level synthesis."""

    from agents.analyst.main import TranscriptView

    completed: set[UUID] = set()
    turns_by_interview: dict[UUID, list[dict[str, str]]] = defaultdict(list)
    for stored in all_events:
        event = getattr(stored, "event", stored)
        if isinstance(event, TurnRecorded):
            turns_by_interview[event.interview_id].append(
                {"role": event.role, "text": event.text}
            )
        elif isinstance(event, InterviewCompleted):
            completed.add(event.interview_id)
    return [
        TranscriptView(interview_id=interview_id, turns=turns_by_interview[interview_id])
        for interview_id in sorted(completed, key=str)
        if turns_by_interview[interview_id]
    ]


async def analyze_completion(state: AppState, ev: InterviewCompleted) -> None:
    """Replace campaign insights with a synthesis of all completed interviews.

    Shared by the standalone worker process and the API's embedded tail
    loop. The reset marker makes the latest batch replay-safe: rebuilding the
    projection from the append-only stream yields exactly one current insight
    set instead of accumulating duplicate per-respondent themes.
    """
    all_events = await state.event_store.read_stream(ev.campaign_id)
    transcripts = _completed_transcripts(all_events)
    if not transcripts:
        return

    campaign = await state.projector.get_campaign(ev.campaign_id)
    language = campaign.spec.primary_language if campaign else "en"

    result = await state.analyst.synthesize(
        campaign_id=ev.campaign_id,
        transcripts=transcripts,
        language=language,
    )
    events = [
        InsightSetReplaced(
            campaign_id=ev.campaign_id,
            actor="agent:analyst",
        ),
        *result.events,
    ]
    stored_list = await state.event_store.append_many(events)
    for stored in stored_list:
        try:
            await state.projector.apply(stored.seq, stored.event)
        except Exception:  # projection is idempotent; tail loops can retry
            logger.exception("insight projection apply failed seq=%s", stored.seq)


async def _handle(stored: StoredEvent, state: AppState) -> None:
    ev = stored.event
    if not isinstance(ev, InterviewCompleted):
        return
    await analyze_completion(state, ev)


async def main() -> None:
    state = await build_state()
    try:
        async for stored in state.event_store.tail():
            await _handle(stored, state)
    finally:
        await state.event_store.stop()
        await state.pool.close()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()

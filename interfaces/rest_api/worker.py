"""Background worker: subscribes to event store, runs Analyst on completions."""

from __future__ import annotations

import asyncio
import logging

from core.events import InterviewCompleted, TurnRecorded
from interfaces.rest_api.deps import AppState, build_state
from storage.event_store import StoredEvent

logger = logging.getLogger(__name__)


async def analyze_completion(state: AppState, ev: InterviewCompleted) -> None:
    """Synthesize insights for one completed interview and persist them.

    Shared by the standalone worker process and the API's embedded tail
    loop. Appends InsightGenerated events to the store and applies them to
    the insights projection so they are immediately readable.
    """
    all_events = await state.event_store.read_stream(ev.campaign_id)
    turns: list[dict[str, str]] = []
    for se in all_events:
        e = se.event
        if isinstance(e, TurnRecorded) and getattr(e, "interview_id", None) == ev.interview_id:
            turns.append({"role": e.role, "text": e.text})
    if not turns:
        return
    from agents.analyst.main import TranscriptView

    result = await state.analyst.synthesize(
        campaign_id=ev.campaign_id,
        transcripts=[TranscriptView(interview_id=ev.interview_id, turns=turns)],
    )
    if not result.events:
        return
    stored_list = await state.event_store.append_many(result.events)
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

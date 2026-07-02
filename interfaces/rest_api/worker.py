"""Background worker: subscribes to event store, runs Analyst on completions."""

from __future__ import annotations

import asyncio

from agents.analyst.main import AnalystAgent, TranscriptView
from core.events import InterviewCompleted, TurnRecorded
from interfaces.rest_api.deps import build_state
from storage.event_store import StoredEvent


async def _handle(stored: StoredEvent, analyst: AnalystAgent, state) -> None:
    ev = stored.event
    if not isinstance(ev, InterviewCompleted):
        return
    all_events = await state.event_store.read_stream(ev.campaign_id)
    turns: list[dict[str, str]] = []
    for se in all_events:
        e = se.event
        if isinstance(e, TurnRecorded) and getattr(e, "interview_id", None) == ev.interview_id:
            turns.append({"role": e.role, "text": e.text})
    result = await analyst.synthesize(
        campaign_id=ev.campaign_id,
        transcripts=[TranscriptView(interview_id=ev.interview_id, turns=turns)],
    )
    if result.events:
        await state.event_store.append_many(result.events)


async def main() -> None:
    state = await build_state()
    try:
        async for stored in state.event_store.tail():
            await _handle(stored, state.analyst, state)
    finally:
        await state.event_store.stop()
        await state.pool.close()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()

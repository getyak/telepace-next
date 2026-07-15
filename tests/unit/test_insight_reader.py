"""Unit tests for the MCP insight/followup read adapters.

Pure-function style: fakes stand in for the projector, event store, and analyst
so neither Postgres nor an LLM is needed. Verifies the projector row → InsightItem
mapping, format/confidence filtering, transcript reconstruction, and the
followup grounding.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from agents.analyst.main import SynthesisResult
from core.events import InterviewCompleted, TurnRecorded
from interfaces.mcp_server.readers import (
    AnalystFollowupService,
    EventStoreTranscriptReader,
    ProjectorInsightReader,
)


class _FakeProjector:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    async def list_insights(self, campaign_id):
        return self._rows


class _StoredEvent:
    def __init__(self, event) -> None:
        self.event = event


class _FakeEventStore:
    def __init__(self, events: list) -> None:
        self._events = [_StoredEvent(e) for e in events]

    async def read_stream(self, campaign_id):
        return self._events


class _FakeAnalyst:
    def __init__(self, result: SynthesisResult) -> None:
        self._result = result
        self.calls = 0

    async def synthesize(self, *, campaign_id, transcripts, **_):
        self.calls += 1
        return self._result


@pytest.mark.asyncio
async def test_insight_reader_maps_and_filters_by_format_and_confidence() -> None:
    cid = uuid4()
    iid = uuid4()
    rows = [
        {
            "id": "i1",
            "kind": "theme",
            "title": "Onboarding friction",
            "confidence": 0.9,
            "body": {"body": "Users stall at step 3", "supporting_interview_ids": [str(iid)]},
        },
        {
            "id": "i2",
            "kind": "theme",
            "title": "Low-confidence noise",
            "confidence": 0.2,  # filtered out by min_confidence
            "body": {"body": "weak"},
        },
        {
            "id": "i3",
            "kind": "verbatim",  # filtered out by format=themes
            "title": "quote",
            "confidence": 0.95,
            "body": {"quote": "I gave up"},
        },
    ]
    reader = ProjectorInsightReader(_FakeProjector(rows))

    items = await reader.list_insights(campaign_id=cid, format="themes", min_confidence=0.5)

    assert len(items) == 1
    item = items[0]
    assert item["id"] == "i1"
    assert item["kind"] == "theme"
    assert item["title"] == "Onboarding friction"
    assert item["body"] == "Users stall at step 3"
    assert item["confidence"] == 0.9
    assert item["supporting_interview_ids"] == [str(iid)]


@pytest.mark.asyncio
async def test_insight_reader_report_format_includes_concerns() -> None:
    rows = [
        {"id": "t", "kind": "theme", "title": "T", "confidence": 0.8, "body": {}},
        {"id": "c", "kind": "concern", "title": "C", "confidence": 0.8, "body": {}},
        {"id": "v", "kind": "verbatim", "title": "V", "confidence": 0.8, "body": {}},
    ]
    reader = ProjectorInsightReader(_FakeProjector(rows))

    items = await reader.list_insights(campaign_id=uuid4(), format="report", min_confidence=0.5)

    kinds = {i["kind"] for i in items}
    assert kinds == {"theme", "concern"}


@pytest.mark.asyncio
async def test_transcript_reader_groups_by_interview_and_scopes_completed() -> None:
    cid = uuid4()
    done_iid = uuid4()
    live_iid = uuid4()
    events = [
        TurnRecorded(campaign_id=cid, interview_id=done_iid, order=1, role="interviewer", text="Q1"),
        TurnRecorded(campaign_id=cid, interview_id=done_iid, order=2, role="respondent", text="A1"),
        TurnRecorded(campaign_id=cid, interview_id=live_iid, order=1, role="interviewer", text="Q1"),
        InterviewCompleted(
            campaign_id=cid, interview_id=done_iid, duration_seconds=120, goal_coverage=0.8
        ),
    ]
    reader = EventStoreTranscriptReader(_FakeEventStore(events))

    completed_only = await reader.list_transcripts(campaign_id=cid, scope="completed_only")
    assert len(completed_only) == 1
    assert completed_only[0].interview_id == done_iid
    assert len(completed_only[0].turns) == 2

    all_views = await reader.list_transcripts(campaign_id=cid, scope="all")
    assert len(all_views) == 2


@pytest.mark.asyncio
async def test_followup_service_grounds_answer_in_themes() -> None:
    cid = uuid4()
    iid = uuid4()
    result = SynthesisResult(
        events=[],
        themes=[
            {"label": "Pricing is the main blocker", "supporting_interview_ids": [str(iid)]},
        ],
        verbatims=[],
        concerns=[],
        persona=None,
    )
    analyst = _FakeAnalyst(result)
    transcript_reader = EventStoreTranscriptReader(
        _FakeEventStore(
            [
                TurnRecorded(
                    campaign_id=cid,
                    interview_id=iid,
                    order=1,
                    role="respondent",
                    text="too pricey",
                )
            ]
        )
    )
    service = AnalystFollowupService(analyst=analyst, transcript_reader=transcript_reader)

    out = await service.answer(campaign_id=cid, question="what blocks purchase?", scope="all")

    assert analyst.calls == 1
    assert "Pricing is the main blocker" in out["answer"]
    assert out["evidence"][0]["quote"] == "Pricing is the main blocker"


@pytest.mark.asyncio
async def test_followup_service_honest_when_no_transcripts() -> None:
    analyst = _FakeAnalyst(SynthesisResult([], [], [], [], None))
    reader = EventStoreTranscriptReader(_FakeEventStore([]))
    service = AnalystFollowupService(analyst=analyst, transcript_reader=reader)

    out = await service.answer(campaign_id=uuid4(), question="anything?", scope="completed_only")

    assert analyst.calls == 0
    assert "enough" in out["answer"].lower()
    assert out["evidence"] == []

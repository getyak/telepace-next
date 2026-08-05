from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from core.events import InterviewCompleted, TurnRecorded
from interfaces.rest_api.worker import _completed_transcripts


def test_completed_transcripts_include_all_and_only_completed_interviews() -> None:
    campaign_id = uuid4()
    first_id = uuid4()
    second_id = uuid4()
    in_progress_id = uuid4()
    events = [
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=first_id,
            order=1,
            role="respondent",
            text="First completed answer",
        ),
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=second_id,
            order=1,
            role="respondent",
            text="Second completed answer",
        ),
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=in_progress_id,
            order=1,
            role="respondent",
            text="Must not be analyzed yet",
        ),
        InterviewCompleted(
            campaign_id=campaign_id,
            interview_id=first_id,
            duration_seconds=30,
            goal_coverage=1.0,
        ),
        InterviewCompleted(
            campaign_id=campaign_id,
            interview_id=second_id,
            duration_seconds=45,
            goal_coverage=1.0,
        ),
    ]

    transcripts = _completed_transcripts(
        [SimpleNamespace(event=event) for event in events]
    )

    assert {transcript.interview_id for transcript in transcripts} == {
        first_id,
        second_id,
    }
    text_by_interview = {
        transcript.interview_id: [turn["text"] for turn in transcript.turns]
        for transcript in transcripts
    }
    assert text_by_interview == {
        first_id: ["First completed answer"],
        second_id: ["Second completed answer"],
    }

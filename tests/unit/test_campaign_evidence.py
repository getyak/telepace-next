"""Campaign evidence reducer tests."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from core.events import (
    InterviewCompleted,
    InterviewStarted,
    RespondentJoined,
    TurnRecorded,
)
from interfaces.rest_api.campaign_evidence import build_campaign_evidence


def test_build_campaign_evidence_uses_only_current_campaign_events() -> None:
    campaign_id = uuid4()
    other_campaign_id = uuid4()
    interview_id = uuid4()
    respondent_id = uuid4()
    events = [
        RespondentJoined(
            campaign_id=campaign_id,
            interview_id=interview_id,
            respondent_id=respondent_id,
            channel="web_text",
            source="respondent-page",
        ),
        InterviewStarted(campaign_id=campaign_id, interview_id=interview_id),
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=interview_id,
            order=1,
            role="interviewer",
            text="What happened?",
        ),
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=interview_id,
            order=2,
            role="respondent",
            text="I could not reach the first useful task.",
        ),
        InterviewCompleted(
            campaign_id=campaign_id,
            interview_id=interview_id,
            duration_seconds=120,
            goal_coverage=0.9,
        ),
        TurnRecorded(
            campaign_id=other_campaign_id,
            interview_id=uuid4(),
            order=1,
            role="respondent",
            text="foreign campaign evidence",
        ),
    ]
    insights = [
        {
            "id": "insight-1",
            "kind": "theme",
            "title": "Value arrives too late",
            "confidence": 0.9,
            "body": {"support_interview_ids": [str(interview_id)]},
            "created_at": "2026-08-03T01:00:00+00:00",
        }
    ]

    result = build_campaign_evidence(
        campaign_id,
        [SimpleNamespace(event=event) for event in events],
        insights,
        campaign_title="Onboarding study",
        research_goal="Understand activation friction.",
    )

    assert result["campaign_id"] == str(campaign_id)
    assert result["campaign_title"] == "Onboarding study"
    assert result["research_goal"] == "Understand activation friction."
    assert result["generated_at"] == "2026-08-03T01:00:00+00:00"
    assert result["insights"] == insights
    assert len(result["interviews"]) == 1
    interview = result["interviews"][0]
    assert interview["respondent_id"] == str(respondent_id)
    assert interview["source"] == "respondent-page"
    assert interview["status"] == "completed"
    assert interview["duration_seconds"] == 120
    assert interview["goal_coverage"] == 0.9
    assert [turn["text"] for turn in interview["turns"]] == [
        "What happened?",
        "I could not reach the first useful task.",
    ]
    assert "foreign campaign evidence" not in str(result)


def test_build_campaign_evidence_returns_honest_empty_document() -> None:
    campaign_id = uuid4()

    result = build_campaign_evidence(campaign_id, [], [])

    assert result == {
        "campaign_id": str(campaign_id),
        "campaign_title": "",
        "research_goal": "",
        "generated_at": None,
        "insights": [],
        "interviews": [],
    }


def test_build_campaign_evidence_reconstructs_legacy_zero_coverage() -> None:
    campaign_id = uuid4()
    interview_id = uuid4()
    first_item_id = uuid4()
    second_item_id = uuid4()
    events = [
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=interview_id,
            order=1,
            role="interviewer",
            text="First question",
            outline_item_id=first_item_id,
        ),
        TurnRecorded(
            campaign_id=campaign_id,
            interview_id=interview_id,
            order=3,
            role="interviewer",
            text="Second question",
            outline_item_id=second_item_id,
        ),
        InterviewCompleted(
            campaign_id=campaign_id,
            interview_id=interview_id,
            duration_seconds=60,
            goal_coverage=0.0,
        ),
    ]

    result = build_campaign_evidence(
        campaign_id,
        events,
        [],
        outline_item_ids=[str(first_item_id), str(second_item_id)],
    )

    assert result["interviews"][0]["goal_coverage"] == 1.0

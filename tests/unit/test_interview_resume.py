from __future__ import annotations

from uuid import uuid4

import pytest

from interfaces.rest_api.interview_resume import (
    InterviewResumeError,
    decode_interview_resume_token,
    issue_interview_resume_token,
)

TEST_SECRET = "test-secret-that-is-at-least-thirty-two-bytes"


def test_resume_token_round_trips_scoped_ids() -> None:
    campaign_id = uuid4()
    interview_id = uuid4()
    respondent_id = uuid4()
    token = issue_interview_resume_token(
        campaign_id=campaign_id,
        interview_id=interview_id,
        respondent_id=respondent_id,
        secret=TEST_SECRET,
        algorithm="HS256",
        issuer="telepace",
        ttl_seconds=600,
    )

    claims = decode_interview_resume_token(
        token,
        secret=TEST_SECRET,
        algorithm="HS256",
        issuer="telepace",
    )

    assert claims.campaign_id == campaign_id
    assert claims.interview_id == interview_id
    assert claims.respondent_id == respondent_id


def test_resume_token_rejects_tampering() -> None:
    token = issue_interview_resume_token(
        campaign_id=uuid4(),
        interview_id=uuid4(),
        respondent_id=uuid4(),
        secret=TEST_SECRET,
        algorithm="HS256",
        issuer="telepace",
        ttl_seconds=600,
    )

    with pytest.raises(InterviewResumeError):
        decode_interview_resume_token(
            f"{token}tampered",
            secret=TEST_SECRET,
            algorithm="HS256",
            issuer="telepace",
        )

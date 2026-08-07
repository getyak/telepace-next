"""Signed, campaign-scoped continuation tokens for public interviews."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

_RESUME_AUDIENCE = "telepace-interview-resume"
_RESUME_TOKEN_TYPE = "interview_resume"


class InterviewResumeError(Exception):
    """Raised when a continuation token is expired, malformed, or mismatched."""


@dataclass(slots=True, frozen=True)
class InterviewResumeClaims:
    campaign_id: UUID
    interview_id: UUID
    respondent_id: UUID
    expires_at: datetime


def issue_interview_resume_token(
    *,
    campaign_id: UUID,
    interview_id: UUID,
    respondent_id: UUID,
    secret: str,
    algorithm: str,
    issuer: str,
    ttl_seconds: int,
) -> str:
    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(seconds=max(60, ttl_seconds))
    claims = {
        "sub": str(interview_id),
        "campaign": str(campaign_id),
        "respondent": str(respondent_id),
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": issuer,
        "aud": _RESUME_AUDIENCE,
        "typ": _RESUME_TOKEN_TYPE,
    }
    return jwt.encode(claims, secret, algorithm=algorithm)


def decode_interview_resume_token(
    token: str,
    *,
    secret: str,
    algorithm: str,
    issuer: str,
) -> InterviewResumeClaims:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=_RESUME_AUDIENCE,
            issuer=issuer,
            options={
                "require": [
                    "exp",
                    "iat",
                    "sub",
                    "campaign",
                    "respondent",
                    "iss",
                    "aud",
                ]
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise InterviewResumeError("interview continuation expired") from exc
    except jwt.InvalidTokenError as exc:
        raise InterviewResumeError("invalid interview continuation") from exc

    if payload.get("typ") != _RESUME_TOKEN_TYPE:
        raise InterviewResumeError("wrong continuation token type")
    try:
        return InterviewResumeClaims(
            campaign_id=UUID(payload["campaign"]),
            interview_id=UUID(payload["sub"]),
            respondent_id=UUID(payload["respondent"]),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise InterviewResumeError("invalid interview continuation claims") from exc

"""Interview REST endpoints (text-only path — voice path uses ws.py)."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.constants import API_VERSION_PREFIX
from core.domain.models import ChannelKind
from core.events import InterviewStarted, RespondentJoined
from core.protocols.commands import ReplyInInterview
from harness import Harness
from interfaces.rest_api.config import Settings
from interfaces.rest_api.deps import get_harness, get_settings_dep, get_state
from interfaces.rest_api.errors import ErrorMessages
from interfaces.rest_api.respondent_context import (
    normalize_referrer_origin,
    normalize_respondent_source,
    respondent_campaign_state,
)

router = APIRouter(prefix=f"{API_VERSION_PREFIX}/interviews", tags=["interviews"])


class JoinBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    campaign_id: UUID
    respondent_ref: str | None = None
    source: str = Field(default="direct", max_length=128)
    referrer_origin: str | None = Field(default=None, max_length=2048)
    embedded: bool = False
    consent_method: str = "continue"


class ReplyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    campaign_id: UUID
    interview_id: UUID
    text: str


@router.post("/join")
async def join(
    body: JoinBody,
    state=Depends(get_state),
    settings: Settings = Depends(get_settings_dep),
) -> dict:
    _, access_error = await respondent_campaign_state(state.projector, body.campaign_id)
    if access_error == "campaign_not_found":
        raise HTTPException(status_code=404, detail=ErrorMessages.CAMPAIGN_NOT_FOUND)
    if access_error:
        raise HTTPException(status_code=409, detail=ErrorMessages.CAMPAIGN_NOT_LIVE)

    interview_id = uuid4()
    respondent_id = uuid4()
    event = RespondentJoined(
        campaign_id=body.campaign_id,
        actor=f"{settings.actor_prefix_respondent}:{respondent_id}",
        interview_id=interview_id,
        respondent_id=respondent_id,
        channel=ChannelKind.WEB_TEXT.value,
        source=normalize_respondent_source(body.source),
        referrer_origin=normalize_referrer_origin(body.referrer_origin),
        embedded=body.embedded,
        consent_method="checkbox" if body.consent_method == "checkbox" else "continue",
    )
    await state.event_store.append(event)
    await state.event_store.append(
        InterviewStarted(
            campaign_id=body.campaign_id,
            actor=f"{settings.actor_prefix_interview}:{interview_id}",
            interview_id=interview_id,
        )
    )
    return {"interview_id": str(interview_id), "respondent_id": str(respondent_id)}


@router.post("/reply")
async def reply(
    body: ReplyBody,
    harness: Harness = Depends(get_harness),
    settings: Settings = Depends(get_settings_dep),
) -> dict:
    cmd = ReplyInInterview(
        actor=f"{settings.actor_prefix_interview}:{body.interview_id}",
        campaign_id=body.campaign_id,
        interview_id=body.interview_id,
        text=body.text,
    )
    resp = await harness.handle(cmd)
    if not resp.ok:
        raise HTTPException(status_code=400, detail=resp.reason)
    return resp.result

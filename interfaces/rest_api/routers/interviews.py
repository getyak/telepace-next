"""Interview REST endpoints (text-only path — voice path uses ws.py)."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from core.constants import API_VERSION_PREFIX
from core.domain.models import ChannelKind
from core.events import RespondentJoined
from core.protocols.commands import ReplyInInterview
from harness import Harness
from interfaces.rest_api.config import Settings
from interfaces.rest_api.deps import get_harness, get_settings_dep, get_state

router = APIRouter(prefix=f"{API_VERSION_PREFIX}/interviews", tags=["interviews"])


class JoinBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    campaign_id: UUID
    respondent_ref: str | None = None


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
    interview_id = uuid4()
    respondent_id = uuid4()
    event = RespondentJoined(
        campaign_id=body.campaign_id,
        actor=f"{settings.actor_prefix_respondent}:{respondent_id}",
        interview_id=interview_id,
        respondent_id=respondent_id,
        channel=ChannelKind.WEB_TEXT.value,
    )
    await state.event_store.append(event)
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

"""WebSocket endpoint for real-time (text or voice-derived-text) interviews."""

from __future__ import annotations

import logging
from uuid import UUID, uuid4

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.constants import VoiceWSMessage
from core.domain.models import ChannelKind
from core.events import RespondentJoined
from core.protocols.commands import ReplyInInterview

logger = logging.getLogger(__name__)

router = APIRouter()


async def _opening_turn(state, campaign_id: UUID) -> tuple[str, int]:
    """Build the interviewer's opening line from the campaign outline.

    Returns (text, total_questions). The opening is also appended to the
    campaign's interview_history so the Interviewer LLM knows question 1
    was already asked and doesn't repeat it after the first reply.
    """
    campaign = await state.projector.get_campaign(campaign_id)
    items = campaign.spec.outline.items if campaign else []
    total = len(items)
    if items:
        text = (
            "Thanks for taking the time — your answers go straight to the team. "
            f"Let's start: {items[0].question}"
        )
    else:
        text = (
            "Thanks for taking the time — your answers go straight to the team. "
            "To start, tell me a bit about yourself."
        )
    if state.memory is not None:
        try:
            ctx = await state.memory.load(campaign_id)
            history = list(ctx.get("interview_history", []))
            history.append({"role": "interviewer", "text": text})
            await state.memory.update(campaign_id, {"interview_history": history})
        except Exception:
            logger.exception("failed to seed interview history for %s", campaign_id)
    return text, total


@router.websocket("/ws/interview/{campaign_id}")
async def interview_ws(websocket: WebSocket, campaign_id: UUID) -> None:
    await websocket.accept()
    state = websocket.app.state.telepace
    harness = state.harness
    settings = state.settings
    interview_id = uuid4()
    respondent_id = uuid4()

    await state.event_store.append(
        RespondentJoined(
            campaign_id=campaign_id,
            actor=f"{settings.actor_prefix_respondent}:{respondent_id}",
            interview_id=interview_id,
            respondent_id=respondent_id,
            channel=ChannelKind.WEB_TEXT.value,
        )
    )
    opening_text, total_questions = await _opening_turn(state, campaign_id)
    await websocket.send_bytes(
        orjson.dumps(
            {
                "type": VoiceWSMessage.HELLO,
                "interview_id": str(interview_id),
                "respondent_id": str(respondent_id),
                "opening": opening_text,
                "progress": {"question_order": 1 if total_questions else None,
                             "total_questions": total_questions},
            }
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            msg = orjson.loads(raw)
            if msg.get("type") != VoiceWSMessage.REPLY:
                continue
            cmd = ReplyInInterview(
                actor=f"{settings.actor_prefix_respondent}:{respondent_id}",
                campaign_id=campaign_id,
                interview_id=interview_id,
                text=str(msg.get("text", "")),
                audio_url=msg.get("audio_url"),
            )
            resp = await harness.handle(cmd)
            await websocket.send_bytes(
                orjson.dumps(
                    {
                        "type": VoiceWSMessage.INTERVIEWER_TURN if resp.ok else VoiceWSMessage.ERROR,
                        "ok": resp.ok,
                        "reason": resp.reason,
                        "result": resp.result,
                    }
                )
            )
    except WebSocketDisconnect:
        return

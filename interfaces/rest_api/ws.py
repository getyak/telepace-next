"""WebSocket endpoint for real-time (text or voice-derived-text) interviews."""

from __future__ import annotations

from uuid import UUID, uuid4

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.constants import VoiceWSMessage
from core.domain.models import ChannelKind
from core.events import RespondentJoined
from core.protocols.commands import ReplyInInterview

router = APIRouter()


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
    await websocket.send_bytes(
        orjson.dumps(
            {
                "type": VoiceWSMessage.HELLO,
                "interview_id": str(interview_id),
                "respondent_id": str(respondent_id),
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

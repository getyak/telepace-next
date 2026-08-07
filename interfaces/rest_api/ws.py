"""WebSocket endpoint for real-time (text or voice-derived-text) interviews."""

from __future__ import annotations

import logging
from uuid import UUID, uuid4

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.constants import VoiceWSMessage
from core.domain.models import ChannelKind
from core.events import (
    InterviewCompleted,
    InterviewStarted,
    RespondentJoined,
)
from core.protocols.commands import ReplyInInterview
from interfaces.rest_api.errors import ErrorMessages
from interfaces.rest_api.interview_resume import (
    InterviewResumeError,
    decode_interview_resume_token,
    issue_interview_resume_token,
)
from interfaces.rest_api.respondent_context import (
    hydrate_respondent_interview_context,
    receive_interview_handshake,
    respondent_campaign_state,
    respondent_connection_context,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# Opening-line templates keyed by the study's primary language. The host's
# greeting must match the language the questions are written in — a zh study
# opened from an /en link used to greet in English over Chinese question text,
# which read as broken. Falls back to English for any unlisted language.
_OPENING_TEMPLATES = {
    "en": {
        "with_question": (
            "Thanks for taking the time — your answers go straight to the team. "
            "Let's start: {question}"
        ),
        "no_question": (
            "Thanks for taking the time — your answers go straight to the team. "
            "To start, tell me a bit about yourself."
        ),
    },
    "zh": {
        # Fullwidth CJK punctuation is correct Chinese typography; RUF001 is
        # ignored for this file (see per-file-ignores) so it isn't flagged.
        "with_question": "感谢你抽出时间——你的回答会直接反馈给团队。我们开始吧：{question}",
        "no_question": "感谢你抽出时间——你的回答会直接反馈给团队。先简单介绍一下你自己吧。",
    },
}


async def _opening_turn(
    state,
    campaign_id: UUID,
    interview_id: UUID,
) -> tuple[str, int, str]:
    """Build the interviewer's opening line from the campaign outline.

    Returns (text, total_questions, language). The opening is language-matched
    to the study's primary_language so the host's greeting never clashes with
    the question text. The opening is also appended to the campaign's
    interview_history so the Interviewer LLM knows question 1 was already asked
    and doesn't repeat it after the first reply.
    """
    campaign = await state.projector.get_campaign(campaign_id)
    items = campaign.spec.outline.items if campaign else []
    total = len(items)
    language = (campaign.spec.primary_language if campaign else "en") or "en"
    templates = _OPENING_TEMPLATES.get(language, _OPENING_TEMPLATES["en"])
    if items:
        text = templates["with_question"].format(question=items[0].question)
    else:
        text = templates["no_question"]
    try:
        await hydrate_respondent_interview_context(
            state,
            campaign_id,
            interview_id,
            opening_text=text,
        )
    except Exception:
        logger.exception(
            "failed to hydrate interview context for campaign=%s interview=%s",
            campaign_id,
            interview_id,
        )
    return text, total, language


async def _resume_turn(
    state,
    campaign_id: UUID,
    interview_id: UUID,
) -> tuple[str, int, str, list[dict[str, str]], int | None]:
    """Restore the durable transcript and active question for one interview."""

    campaign = await hydrate_respondent_interview_context(
        state,
        campaign_id,
        interview_id,
    )
    items = campaign.spec.outline.items if campaign else []
    language = (campaign.spec.primary_language if campaign else "en") or "en"
    context = await state.memory.load(interview_id) if state.memory is not None else {}
    raw_history = context.get("interview_history", [])
    history = [
        {"role": str(item.get("role") or ""), "text": str(item.get("text") or "")}
        for item in raw_history
        if isinstance(item, dict) and item.get("role") and item.get("text")
    ]
    opening = next(
        (
            item["text"]
            for item in reversed(history)
            if item["role"] == "interviewer"
        ),
        "",
    )
    answered = sum(item["role"] == "respondent" for item in history)
    if not opening:
        templates = _OPENING_TEMPLATES.get(language, _OPENING_TEMPLATES["en"])
        opening = (
            templates["with_question"].format(question=items[0].question)
            if items
            else templates["no_question"]
        )
        history.insert(0, {"role": "interviewer", "text": opening})
    question_order = min(answered + 1, len(items)) if items else None
    return opening, len(items), language, history, question_order


@router.websocket("/ws/interview/{campaign_id}")
async def interview_ws(websocket: WebSocket, campaign_id: UUID) -> None:
    await websocket.accept()
    state = websocket.app.state.telepace
    harness = state.harness
    settings = state.settings

    session_token, resume_token = await receive_interview_handshake(
        websocket,
        timeout_seconds=settings.embed_auth_timeout_seconds,
    )
    respondent_context, context_error = await respondent_connection_context(
        websocket,
        campaign_id,
        settings,
        session_token=session_token,
        memory=state.memory,
    )
    if context_error or respondent_context is None:
        await websocket.send_bytes(
            orjson.dumps(
                {
                    "type": VoiceWSMessage.ERROR,
                    "reason": context_error or "embed_session_invalid",
                    "recoverable": False,
                }
            )
        )
        await websocket.close(code=4403)
        return

    _, access_error = await respondent_campaign_state(state.projector, campaign_id)
    if access_error:
        await websocket.send_bytes(
            orjson.dumps(
                {
                    "type": VoiceWSMessage.ERROR,
                    "reason": access_error,
                    "recoverable": False,
                }
            )
        )
        await websocket.close(code=4404 if access_error == "campaign_not_found" else 4409)
        return

    resumed = False
    history: list[dict[str, str]] = []
    question_order: int | None = None
    if resume_token:
        try:
            claims = decode_interview_resume_token(
                resume_token,
                secret=settings.jwt_secret,
                algorithm=settings.jwt_algorithm,
                issuer=settings.jwt_issuer,
            )
        except InterviewResumeError:
            claims = None
        if claims is None or claims.campaign_id != campaign_id:
            await websocket.send_bytes(
                orjson.dumps(
                    {
                        "type": VoiceWSMessage.ERROR,
                        "reason": "interview_resume_invalid",
                        "recoverable": False,
                    }
                )
            )
            await websocket.close(code=4403)
            return
        events = await state.event_store.read_stream(campaign_id)
        joined = any(
            isinstance(stored.event, RespondentJoined)
            and stored.event.interview_id == claims.interview_id
            and stored.event.respondent_id == claims.respondent_id
            for stored in events
        )
        completed = any(
            isinstance(stored.event, InterviewCompleted)
            and stored.event.interview_id == claims.interview_id
            for stored in events
        )
        if not joined or completed:
            await websocket.send_bytes(
                orjson.dumps(
                    {
                        "type": VoiceWSMessage.ERROR,
                        "reason": (
                            "interview_already_completed"
                            if completed
                            else "interview_resume_invalid"
                        ),
                        "recoverable": False,
                    }
                )
            )
            await websocket.close(code=4409)
            return
        interview_id = claims.interview_id
        respondent_id = claims.respondent_id
        resumed = True
        (
            opening_text,
            total_questions,
            language,
            history,
            question_order,
        ) = await _resume_turn(state, campaign_id, interview_id)
    else:
        interview_id = uuid4()
        respondent_id = uuid4()
        await state.event_store.append(
            RespondentJoined(
                campaign_id=campaign_id,
                actor=f"{settings.actor_prefix_respondent}:{respondent_id}",
                interview_id=interview_id,
                respondent_id=respondent_id,
                channel=ChannelKind.WEB_TEXT.value,
                source=respondent_context.source,
                referrer_origin=respondent_context.referrer_origin,
                embedded=respondent_context.embedded,
                consent_method=respondent_context.consent_method,
            )
        )
        await state.event_store.append(
            InterviewStarted(
                campaign_id=campaign_id,
                actor=f"{settings.actor_prefix_interview}:{interview_id}",
                interview_id=interview_id,
            )
        )
        opening_text, total_questions, language = await _opening_turn(
            state,
            campaign_id,
            interview_id,
        )
        question_order = 1 if total_questions else None
    continuation_token = issue_interview_resume_token(
        campaign_id=campaign_id,
        interview_id=interview_id,
        respondent_id=respondent_id,
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
        ttl_seconds=settings.interview_resume_ttl_seconds,
    )
    await websocket.send_bytes(
        orjson.dumps(
            {
                "type": VoiceWSMessage.HELLO,
                "interview_id": str(interview_id),
                "respondent_id": str(respondent_id),
                "opening": opening_text,
                "resume_token": continuation_token,
                "resumed": resumed,
                "history": history,
                # The study's content language, so the client can render the
                # respondent UI (greetings, progress, prompts) in the same
                # language as the questions instead of the URL locale.
                "language": language,
                "progress": {
                    "question_order": question_order,
                    "total_questions": total_questions,
                },
            }
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            msg = orjson.loads(raw)
            if msg.get("type") != VoiceWSMessage.REPLY:
                continue
            # Refresh elapsed time in isolated interview memory before the
            # Interviewer may emit InterviewCompleted on this turn.
            await hydrate_respondent_interview_context(
                state,
                campaign_id,
                interview_id,
            )
            cmd = ReplyInInterview(
                actor=f"{settings.actor_prefix_respondent}:{respondent_id}",
                campaign_id=campaign_id,
                interview_id=interview_id,
                text=str(msg.get("text", "")),
                audio_url=msg.get("audio_url"),
            )
            try:
                resp = await harness.handle(cmd)
            except Exception:
                logger.exception(
                    "interviewer turn failed for campaign=%s interview=%s",
                    campaign_id,
                    interview_id,
                )
                await websocket.send_bytes(
                    orjson.dumps(
                        {
                            "type": VoiceWSMessage.ERROR,
                            "reason": ErrorMessages.INTERVIEWER_UNAVAILABLE,
                            "recoverable": True,
                        }
                    )
                )
                continue
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

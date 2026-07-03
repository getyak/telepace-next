"""Voice WebSocket endpoint: audio in -> STT -> Harness -> TTS -> audio out.

Route: /ws/voice/{campaign_id}. Client sends binary audio frames (webm-opus by
default from MediaRecorder). Server streams JSON control frames + binary MP3.

Latency budget (P50 target ≤ 900 ms end-of-user-speech -> first assistant byte):
  - STT final decision (post-VAD) ......... ~150-250 ms  (Deepgram Nova-3)
  - Harness + LLM turn ..................... ~400-500 ms  (fast model, 800 tok max)
  - TTS first byte ......................... ~150-250 ms  (ElevenLabs streaming)
  - Network + framing ......................  ~50 ms
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.events import RespondentAudioTurn, RespondentJoined
from core.protocols.commands import ReplyInInterview
from voice.stt import STT, DeepgramSTT, MockSTT, Transcript
from voice.tts import TTS, ElevenLabsTTS, MockTTS

if TYPE_CHECKING:
    from interfaces.rest_api.deps import AppState

router = APIRouter()


def _build_stt(state: AppState) -> tuple[STT, str]:
    s = state.settings
    provider = (s.voice_stt_provider or "mock").lower()
    if provider == "deepgram" and s.deepgram_api_key:
        return (
            DeepgramSTT(
                api_key=s.deepgram_api_key,
                encoding="opus",
                sample_rate=s.deepgram_sample_rate_hz,
                model=s.deepgram_model,
                language=s.deepgram_language,
                ws_url=s.deepgram_ws_url,
                ping_interval_s=s.deepgram_ping_interval_s,
                ping_timeout_s=s.deepgram_ping_timeout_s,
            ),
            "deepgram",
        )
    return MockSTT(), "mock"


def _build_tts(state: AppState) -> tuple[TTS, str]:
    s = state.settings
    provider = (s.voice_tts_provider or "mock").lower()
    if provider == "elevenlabs" and s.elevenlabs_api_key:
        return (
            ElevenLabsTTS(
                api_key=s.elevenlabs_api_key,
                default_voice_id=s.elevenlabs_voice_id,
                base_url=s.elevenlabs_base_url,
                model_id=s.elevenlabs_model_id,
                output_format=s.elevenlabs_output_format,
                stability=s.elevenlabs_stability,
                similarity_boost=s.elevenlabs_similarity_boost,
                timeout_s=s.elevenlabs_timeout_s,
                connect_timeout_s=s.elevenlabs_connect_timeout_s,
                stream_chunk_bytes=s.elevenlabs_stream_chunk_bytes,
            ),
            "elevenlabs",
        )
    return MockTTS(), "mock"


async def _drain_send_json(ws: WebSocket, payload: dict) -> None:
    try:
        await ws.send_bytes(orjson.dumps(payload))
    except (RuntimeError, WebSocketDisconnect):
        pass


@router.websocket("/ws/voice/{campaign_id}")
async def voice_ws(websocket: WebSocket, campaign_id: UUID) -> None:
    await websocket.accept()
    state: AppState = websocket.app.state.telepace
    harness = state.harness
    interview_id = uuid4()
    respondent_id = uuid4()

    stt, stt_name = _build_stt(state)
    tts, tts_name = _build_tts(state)

    await state.event_store.append(
        RespondentJoined(
            campaign_id=campaign_id,
            actor=f"respondent:{respondent_id}",
            interview_id=interview_id,
            respondent_id=respondent_id,
            channel="web_voice",
        )
    )
    await _drain_send_json(
        websocket,
        {
            "type": "hello",
            "interview_id": str(interview_id),
            "respondent_id": str(respondent_id),
            "stt": stt_name,
            "tts": tts_name,
        },
    )

    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=256)

    async def _audio_iter() -> AsyncIterator[bytes]:
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                return
            yield chunk

    async def _receive_audio_task() -> None:
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if (data := msg.get("bytes")) is not None:
                    await audio_queue.put(data)
                elif (text := msg.get("text")) is not None:
                    try:
                        ctrl = orjson.loads(text)
                    except orjson.JSONDecodeError:
                        continue
                    if ctrl.get("type") == "end":
                        break
        finally:
            await audio_queue.put(None)

    async def _handle_final(transcript: Transcript) -> None:
        # 1. Trail event for ops observability (rubric dim 11).
        await state.event_store.append(
            RespondentAudioTurn(
                campaign_id=campaign_id,
                actor=f"respondent:{respondent_id}",
                interview_id=interview_id,
                transcript=transcript.text,
                confidence=transcript.confidence,
                stt_provider=stt_name,
                tts_provider=tts_name,
            )
        )

        # 2. Harness turn (reuses existing text-mode command shape).
        cmd = ReplyInInterview(
            actor=f"respondent:{respondent_id}",
            campaign_id=campaign_id,
            interview_id=interview_id,
            text=transcript.text,
        )
        resp = await harness.handle(cmd)
        if not resp.ok:
            await _drain_send_json(
                websocket, {"type": "error", "reason": resp.reason}
            )
            return

        reply_text = ""
        if isinstance(resp.result, dict):
            reply_text = str(resp.result.get("text") or "")
        if not reply_text:
            await _drain_send_json(websocket, {"type": "error", "reason": "empty_reply"})
            return

        # 3. Broadcast the caption so the UI can show text alongside audio.
        await _drain_send_json(
            websocket,
            {
                "type": "interviewer_turn",
                "text": reply_text,
                "kind": resp.result.get("kind") if isinstance(resp.result, dict) else None,
            },
        )

        # 4. Stream TTS bytes.
        await _drain_send_json(websocket, {"type": "tts_start"})
        try:
            async for audio_chunk in tts.synthesize(reply_text):
                try:
                    await websocket.send_bytes(audio_chunk)
                except (RuntimeError, WebSocketDisconnect):
                    return
        except Exception as exc:
            await _drain_send_json(
                websocket, {"type": "error", "reason": f"tts_failed:{exc!r}"}
            )
            return
        await _drain_send_json(websocket, {"type": "tts_end"})

    async def _stt_task() -> None:
        try:
            async for tr in stt.stream(_audio_iter()):
                if not tr.is_final:
                    await _drain_send_json(
                        websocket,
                        {"type": "stt_delta", "text": tr.text, "is_final": False},
                    )
                    continue
                await _drain_send_json(
                    websocket,
                    {"type": "stt_delta", "text": tr.text, "is_final": True},
                )
                if tr.text.strip():
                    await _handle_final(tr)
        except Exception as exc:
            await _drain_send_json(
                websocket, {"type": "error", "reason": f"stt_failed:{exc!r}"}
            )

    recv_task = asyncio.create_task(_receive_audio_task())
    stt_task = asyncio.create_task(_stt_task())

    try:
        await asyncio.wait(
            [recv_task, stt_task], return_when=asyncio.FIRST_COMPLETED
        )
    except WebSocketDisconnect:
        pass
    finally:
        recv_task.cancel()
        stt_task.cancel()
        for t in (recv_task, stt_task):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        try:
            await websocket.close()
        except RuntimeError:
            pass

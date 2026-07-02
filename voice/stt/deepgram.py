"""DeepgramSTT: one websocket per session, forward audio bytes, yield transcripts.

Deepgram Nova-3 streaming API. No SDK — plain `websockets` + `orjson`.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Literal
from urllib.parse import urlencode

import orjson
import websockets

from voice.stt.base import Transcript

_DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen"


class DeepgramSTT:
    """Streaming ASR against Deepgram Nova-3.

    encoding: "linear16" (16 kHz PCM raw) or "opus" (webm-opus from MediaRecorder).
    """

    def __init__(
        self,
        api_key: str,
        *,
        encoding: Literal["linear16", "opus"] = "opus",
        sample_rate: int = 16000,
        model: str = "nova-3",
        language: str = "en-US",
    ) -> None:
        self._api_key = api_key
        self._encoding = encoding
        self._sample_rate = sample_rate
        self._model = model
        self._language = language

    def _url(self) -> str:
        params = {
            "model": self._model,
            "smart_format": "true",
            "interim_results": "true",
            "encoding": self._encoding,
            "language": self._language,
        }
        # linear16 requires sample_rate; opus is self-describing in the webm container.
        if self._encoding == "linear16":
            params["sample_rate"] = str(self._sample_rate)
        return f"{_DEEPGRAM_WS}?{urlencode(params)}"

    async def stream(self, audio: AsyncIterator[bytes]) -> AsyncIterator[Transcript]:
        headers = [("Authorization", f"Token {self._api_key}")]
        async with websockets.connect(
            self._url(),
            additional_headers=headers,
            max_size=None,
            ping_interval=5,
            ping_timeout=20,
        ) as ws:
            send_task = asyncio.create_task(_pump_audio(ws, audio))
            try:
                async for raw in ws:
                    if isinstance(raw, bytes):
                        continue
                    try:
                        msg = orjson.loads(raw)
                    except orjson.JSONDecodeError:
                        continue
                    alt = _extract_alt(msg)
                    if alt is None:
                        continue
                    text, is_final, conf = alt
                    if not text:
                        continue
                    yield Transcript(text=text, is_final=is_final, confidence=conf)
            finally:
                send_task.cancel()
                try:
                    await send_task
                except (asyncio.CancelledError, Exception):
                    pass


async def _pump_audio(ws, audio: AsyncIterator[bytes]) -> None:
    try:
        async for chunk in audio:
            if not chunk:
                continue
            await ws.send(chunk)
        # Signal end-of-stream to Deepgram.
        await ws.send(orjson.dumps({"type": "CloseStream"}))
    except (asyncio.CancelledError, websockets.ConnectionClosed):
        return
    except Exception:
        return


def _extract_alt(msg: dict) -> tuple[str, bool, float] | None:
    """Pull (transcript, is_final, confidence) out of a Deepgram Results message."""
    if msg.get("type") != "Results" and "channel" not in msg:
        return None
    channel = msg.get("channel") or {}
    alts = channel.get("alternatives") or []
    if not alts:
        return None
    a0 = alts[0]
    text = (a0.get("transcript") or "").strip()
    conf = float(a0.get("confidence") or 0.0)
    is_final = bool(msg.get("is_final") or msg.get("speech_final"))
    return text, is_final, conf

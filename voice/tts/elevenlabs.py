"""ElevenLabsTTS: streams MP3 back from the /stream endpoint."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

_DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1"
_DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Bella


class ElevenLabsTTS:
    """Stream MP3 44.1 kHz / 128 kbps chunks from ElevenLabs."""

    def __init__(
        self,
        api_key: str,
        *,
        default_voice_id: str = _DEFAULT_VOICE_ID,
        base_url: str = _DEFAULT_BASE_URL,
        model_id: str = "eleven_turbo_v2_5",
        output_format: str = "mp3_44100_128",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        timeout_s: float = 20.0,
        connect_timeout_s: float = 5.0,
        stream_chunk_bytes: int = 4096,
    ) -> None:
        self._api_key = api_key
        self._default_voice_id = default_voice_id
        self._base_url = base_url.rstrip("/")
        self._model_id = model_id
        self._output_format = output_format
        self._stability = stability
        self._similarity_boost = similarity_boost
        self._timeout_s = timeout_s
        self._connect_timeout_s = connect_timeout_s
        self._stream_chunk_bytes = stream_chunk_bytes

    async def synthesize(
        self, text: str, *, voice_id: str | None = None
    ) -> AsyncIterator[bytes]:
        vid = voice_id or self._default_voice_id
        url = f"{self._base_url}/text-to-speech/{vid}/stream"
        headers = {
            "xi-api-key": self._api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        params = {"output_format": self._output_format}
        payload = {
            "text": text,
            "model_id": self._model_id,
            "voice_settings": {
                "stability": self._stability,
                "similarity_boost": self._similarity_boost,
            },
        }
        timeout = httpx.Timeout(self._timeout_s, connect=self._connect_timeout_s)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST", url, headers=headers, params=params, json=payload
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=self._stream_chunk_bytes):
                    if chunk:
                        yield chunk

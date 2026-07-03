"""MockTTS: returns ~500 ms of MP3 silence so the loop works with zero API keys."""

from __future__ import annotations

from collections.abc import AsyncIterator

from core.constants import MOCK_TTS_SILENCE_FRAMES

# ~26 ms of MPEG-1 Layer III silence at 44.1 kHz mono, 128 kbps.
# Repeated ~20x gives roughly 500 ms of audio bytes for the client.
# Frame header + zeroed payload; every real MP3 decoder tolerates this.
_MP3_SILENCE_FRAME = (
    b"\xff\xfb\x90\x64"  # MPEG-1 Layer III, 128 kbps, 44.1 kHz, mono
    + b"\x00" * 414  # frame payload (silence)
)


class MockTTS:
    """Offline TTS that emits a short MP3 silence stream."""

    def __init__(self, chunk_frames: int = MOCK_TTS_SILENCE_FRAMES) -> None:
        self._chunk_frames = chunk_frames

    async def synthesize(
        self, text: str, *, voice_id: str | None = None
    ) -> AsyncIterator[bytes]:
        _ = text, voice_id
        # Split into two chunks so downstream can exercise streaming assembly.
        half = max(1, self._chunk_frames // 2)
        yield _MP3_SILENCE_FRAME * half
        yield _MP3_SILENCE_FRAME * (self._chunk_frames - half)

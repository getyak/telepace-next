"""MockSTT: emits a synthetic transcript every 3 s so dev works offline."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from voice.stt.base import Transcript


class MockSTT:
    """Offline STT that ignores audio and emits a canned 'hello' every ~3 s.

    Used when TELEPACE_DEEPGRAM_API_KEY is unset (CI, local dev).
    """

    def __init__(self, interval_s: float = 3.0, text: str = "hello") -> None:
        self._interval_s = interval_s
        self._text = text

    async def stream(self, audio: AsyncIterator[bytes]) -> AsyncIterator[Transcript]:
        stop = asyncio.Event()

        async def _drain() -> None:
            # Drain the audio iterator so upstream backpressure is respected.
            try:
                async for _ in audio:
                    if stop.is_set():
                        return
            except Exception:
                return

        drain_task = asyncio.create_task(_drain())
        try:
            while not stop.is_set():
                try:
                    await asyncio.wait_for(stop.wait(), timeout=self._interval_s)
                    return
                except TimeoutError:
                    pass
                yield Transcript(text=self._text, is_final=True, confidence=1.0)
        finally:
            stop.set()
            drain_task.cancel()
            try:
                await drain_task
            except (asyncio.CancelledError, Exception):
                pass

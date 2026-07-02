"""TTS protocol: text in, audio byte chunks out (opaque encoding — MP3 for prod)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable


@runtime_checkable
class TTS(Protocol):
    """Streaming text-to-speech. Emits opaque audio bytes (MP3 44.1 kHz for prod)."""

    async def synthesize(
        self,
        text: str,
        *,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:  # pragma: no cover - protocol
        ...

"""STT protocol: streaming audio bytes in, Transcript deltas out."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(slots=True, frozen=True)
class Transcript:
    """A single ASR emission — interim partial or final utterance."""

    text: str
    is_final: bool
    confidence: float = 1.0


@runtime_checkable
class STT(Protocol):
    """Streaming speech-to-text. One call per interview session."""

    async def stream(
        self, audio: AsyncIterator[bytes]
    ) -> AsyncIterator[Transcript]:  # pragma: no cover - protocol
        ...

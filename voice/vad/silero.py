"""EnergyVAD: MVP replacement for Silero. Pure-stdlib rolling-RMS detector.

Expects 16 kHz mono PCM16-LE. push() returns True exactly once per detected
end-of-utterance: RMS below `silence_threshold` for `silence_hangover_ms`
after having been above threshold recently.

Silero VAD is a nice-to-have upgrade (adds a torch dep) — deferred for MVP.
"""

from __future__ import annotations

import math
import struct
from collections import deque
from typing import Protocol

from core.constants import (
    DEFAULT_SAMPLE_RATE_HZ,
    VAD_FRAME_MS,
    VAD_SILENCE_HANGOVER_MS,
    VAD_SILENCE_THRESHOLD,
    VAD_WINDOW_MS,
)


class VAD(Protocol):
    def push(self, pcm_bytes: bytes) -> bool:  # pragma: no cover - protocol
        ...


class EnergyVAD:
    """Rolling-window RMS voice activity detector."""

    def __init__(
        self,
        *,
        sample_rate: int = DEFAULT_SAMPLE_RATE_HZ,
        frame_ms: int = VAD_FRAME_MS,
        window_ms: int = VAD_WINDOW_MS,
        silence_hangover_ms: int = VAD_SILENCE_HANGOVER_MS,
        silence_threshold: float = VAD_SILENCE_THRESHOLD,  # int16 RMS; ~mic noise floor
    ) -> None:
        self._sample_rate = sample_rate
        self._samples_per_frame = int(sample_rate * frame_ms / 1000)
        self._window_frames = max(1, window_ms // frame_ms)
        self._hangover_frames = max(1, silence_hangover_ms // frame_ms)
        self._threshold = silence_threshold

        self._buf = bytearray()
        self._rms_window: deque[float] = deque(maxlen=self._window_frames)
        self._silent_run = 0
        self._had_voice = False

    def push(self, pcm_bytes: bytes) -> bool:
        """Feed raw PCM16-LE bytes. Returns True on end-of-utterance."""
        self._buf.extend(pcm_bytes)
        frame_bytes = self._samples_per_frame * 2  # int16
        eou = False
        while len(self._buf) >= frame_bytes:
            frame = bytes(self._buf[:frame_bytes])
            del self._buf[:frame_bytes]
            rms = _rms_int16(frame)
            self._rms_window.append(rms)
            avg = sum(self._rms_window) / len(self._rms_window)
            if avg >= self._threshold:
                self._had_voice = True
                self._silent_run = 0
            else:
                self._silent_run += 1
                if self._had_voice and self._silent_run >= self._hangover_frames:
                    eou = True
                    self._had_voice = False
                    self._silent_run = 0
        return eou


def _rms_int16(frame: bytes) -> float:
    n = len(frame) // 2
    if n == 0:
        return 0.0
    samples = struct.unpack(f"<{n}h", frame)
    acc = 0
    for s in samples:
        acc += s * s
    return math.sqrt(acc / n)

"""Speech-to-text: streaming ASR provider protocol + implementations."""

from voice.stt.base import STT, Transcript
from voice.stt.deepgram import DeepgramSTT
from voice.stt.mock import MockSTT

__all__ = ["STT", "DeepgramSTT", "MockSTT", "Transcript"]

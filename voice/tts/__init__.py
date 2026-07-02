"""Text-to-speech: streaming TTS provider protocol + implementations."""

from voice.tts.base import TTS
from voice.tts.elevenlabs import ElevenLabsTTS
from voice.tts.mock import MockTTS

__all__ = ["TTS", "ElevenLabsTTS", "MockTTS"]

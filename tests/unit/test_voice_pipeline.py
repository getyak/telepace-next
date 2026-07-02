"""Smoke test for the voice pipeline with MockSTT + MockTTS.

Exercises the two provider protocols end-to-end without any network I/O.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest

from voice.stt import MockSTT, Transcript
from voice.tts import MockTTS
from voice.vad import EnergyVAD


async def _audio_stream(chunks: list[bytes]) -> AsyncIterator[bytes]:
    for c in chunks:
        yield c
        await asyncio.sleep(0)  # yield to loop
    # Iterator returns; STT should observe end-of-stream.


@pytest.mark.asyncio
async def test_mock_stt_emits_transcript_and_terminates() -> None:
    stt = MockSTT(interval_s=0.05, text="hello")
    transcripts: list[Transcript] = []

    async def _consume() -> None:
        async for t in stt.stream(_audio_stream([b"\x00" * 320, b"\x00" * 320])):
            transcripts.append(t)
            if len(transcripts) >= 2:
                break

    await asyncio.wait_for(_consume(), timeout=1.0)
    assert transcripts, "MockSTT emitted no transcripts"
    assert all(t.is_final for t in transcripts)
    assert transcripts[0].text == "hello"
    assert transcripts[0].confidence == 1.0


@pytest.mark.asyncio
async def test_mock_tts_streams_nonempty_bytes() -> None:
    tts = MockTTS()
    chunks: list[bytes] = []
    async for chunk in tts.synthesize("hi there"):
        chunks.append(chunk)
    assert len(chunks) >= 1
    total = b"".join(chunks)
    assert len(total) > 100, "MockTTS should emit ~500ms of MP3 silence"
    # First frame must be a valid MP3 sync word.
    assert total[:2] == b"\xff\xfb"


@pytest.mark.asyncio
async def test_voice_pipeline_roundtrip_mock() -> None:
    """User audio bytes -> MockSTT -> mock 'agent' -> MockTTS -> audio bytes back."""
    stt = MockSTT(interval_s=0.05)
    tts = MockTTS()

    async def agent(text: str) -> str:
        return f"You said: {text}"

    audio_in = [b"\x00" * 320 for _ in range(3)]
    audio_out: list[bytes] = []
    transcripts: list[str] = []

    async def _run() -> None:
        async for tr in stt.stream(_audio_stream(audio_in)):
            if not tr.is_final:
                continue
            transcripts.append(tr.text)
            reply = await agent(tr.text)
            async for chunk in tts.synthesize(reply):
                audio_out.append(chunk)
            break

    await asyncio.wait_for(_run(), timeout=2.0)
    assert transcripts == ["hello"]
    assert audio_out and audio_out[0][:2] == b"\xff\xfb"


def test_energy_vad_detects_end_of_utterance() -> None:
    vad = EnergyVAD(
        sample_rate=16000,
        frame_ms=30,
        window_ms=90,
        silence_hangover_ms=90,
        silence_threshold=500.0,
    )
    # 30 ms of loud speech (int16 amplitude ~5000).
    frame_samples = 480
    loud = (b"\x88\x13") * frame_samples  # 0x1388 == 5000
    silent = (b"\x00\x00") * frame_samples

    # Warm-up with voice.
    for _ in range(4):
        vad.push(loud)

    # No EoU while voice continues.
    for _ in range(2):
        assert vad.push(loud) is False

    # Feed silence; EoU must fire within a few frames of hangover.
    fired = any(vad.push(silent) for _ in range(6))
    assert fired, "EnergyVAD should fire end-of-utterance after silence hangover"

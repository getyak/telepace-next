/**
 * Voice WebSocket protocol constants shared with the backend.
 *
 * Backend contract lives in `core/constants.py::VoiceWSMessage` and the
 * dispatch pipeline in `interfaces/realtime/voice_ws.py`. Message-type
 * strings must match verbatim.
 */

export const VoiceEventType = {
  Hello: "hello",
  Error: "error",
  Reply: "reply",
  InterviewerTurn: "interviewer_turn",
  SttDelta: "stt_delta",
  TtsStart: "tts_start",
  TtsEnd: "tts_end",
  WrapUp: "wrap_up",
  End: "end",
} as const;

export type VoiceEventKind = (typeof VoiceEventType)[keyof typeof VoiceEventType];

/** MediaRecorder codec + container the backend Deepgram STT accepts. */
export const VOICE_MIME = "audio/webm;codecs=opus";

/** MediaRecorder timeslice in ms. Backend STT expects opus frames at this rate. */
export const OPUS_CHUNK_MS = 250;

/** Text-mode WS: UI shows "speaking" indicator for this long after
 * receiving an interviewer_turn before flipping to "listening". */
export const SPEAKING_INDICATOR_MS = 800;

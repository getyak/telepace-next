/**
 * Study channel identifiers — the exact wire values the backend expects.
 *
 * Backend contract lives in `core/domain/models.py::ChannelKind`. Any drift
 * here will cause a run-time TypeError on the backend when routing.
 */

export const CHANNELS = {
  webText: "web_text",
  webVoice: "web_voice",
  phoneOutbound: "phone_outbound",
  email: "email",
} as const;

export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

export const ALL_CHANNELS: readonly ChannelId[] = [
  CHANNELS.webText,
  CHANNELS.webVoice,
  CHANNELS.phoneOutbound,
  CHANNELS.email,
] as const;

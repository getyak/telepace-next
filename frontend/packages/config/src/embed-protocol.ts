/**
 * Stable postMessage contract shared by the respondent runtime and embedders.
 *
 * Version the envelope rather than individual payloads. Hosts can ignore event
 * types they do not understand and continue to support future runtime builds.
 */

export const TELEPACE_EMBED_SOURCE = "telepace-interview" as const;
export const TELEPACE_EMBED_VERSION = 1 as const;

export type TelepaceEmbedEventType =
  | "telepace:ready"
  | "telepace:started"
  | "telepace:answer"
  | "telepace:progress"
  | "telepace:complete"
  | "telepace:error"
  | "telepace:resize";

const TELEPACE_EMBED_EVENT_TYPES = new Set<TelepaceEmbedEventType>([
  "telepace:ready",
  "telepace:started",
  "telepace:answer",
  "telepace:progress",
  "telepace:complete",
  "telepace:error",
  "telepace:resize",
]);

export type TelepaceEmbedMessage = {
  source: typeof TELEPACE_EMBED_SOURCE;
  version: typeof TELEPACE_EMBED_VERSION;
  type: TelepaceEmbedEventType;
  campaignId: string;
  payload: Record<string, unknown>;
};

export function createTelepaceEmbedMessage(
  type: TelepaceEmbedEventType,
  campaignId: string,
  payload: Record<string, unknown> = {},
): TelepaceEmbedMessage {
  return {
    source: TELEPACE_EMBED_SOURCE,
    version: TELEPACE_EMBED_VERSION,
    type,
    campaignId,
    payload,
  };
}

export function isTelepaceEmbedMessage(value: unknown): value is TelepaceEmbedMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TelepaceEmbedMessage>;
  return (
    candidate.source === TELEPACE_EMBED_SOURCE &&
    candidate.version === TELEPACE_EMBED_VERSION &&
    typeof candidate.type === "string" &&
    TELEPACE_EMBED_EVENT_TYPES.has(candidate.type as TelepaceEmbedEventType) &&
    typeof candidate.campaignId === "string" &&
    !!candidate.payload &&
    typeof candidate.payload === "object"
  );
}

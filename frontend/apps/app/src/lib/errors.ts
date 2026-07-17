/**
 * Central error classification + user-facing copy.
 *
 * The HTTP layer wraps every non-2xx response and every network failure
 * into an ApiError with a stable `kind`. UI code should never inspect
 * `err.message` (that's raw backend detail — English, JSON, or stack).
 * Instead, feed the error through `friendlyMessage()` to get a localized
 * copy suitable for a toast / inline banner. Copy itself lives in the
 * `errors` messages namespace, not in this file — this file stays free of
 * any i18n library dependency so it can be called from any client component.
 */

export type ErrorKind =
  | "NETWORK" //   fetch never reached server (offline, DNS, TLS, CORS)
  | "TIMEOUT" //   request sent but no response within the client deadline
  | "AUTH" //      401 — no/expired credentials
  | "FORBIDDEN" // 403 — logged in but not allowed
  | "NOT_FOUND" // 404
  | "VALIDATION" //422 or 400 with structured errors
  | "RATE_LIMIT" //429
  | "SERVER" //    5xx
  | "CANCELED" //  AbortController — usually user-initiated
  | "UNKNOWN";

export class ApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number; // 0 for network/cancel/unknown
  readonly detail: string; // raw server body (for logs, never for UI)
  readonly requestId?: string;

  constructor(params: {
    kind: ErrorKind;
    status: number;
    detail: string;
    requestId?: string;
  }) {
    super(`[${params.kind}] ${params.status}: ${params.detail}`);
    this.name = "ApiError";
    this.kind = params.kind;
    this.status = params.status;
    this.detail = params.detail;
    this.requestId = params.requestId;
  }
}

export function kindFromStatus(status: number): ErrorKind {
  if (status === 401) return "AUTH";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422 || status === 400) return "VALIDATION";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "SERVER";
  return "UNKNOWN";
}

export type FriendlyCopy = {
  title: string;
  description: string;
  actionLabel?: string; // when set, UI can render a follow-up button
};

/** Maps an ErrorKind to its key in the `errors` messages namespace. */
const KIND_TO_MESSAGE_KEY: Record<ErrorKind, string> = {
  NETWORK: "network",
  TIMEOUT: "timeout",
  AUTH: "auth",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  VALIDATION: "validation",
  RATE_LIMIT: "rate_limit",
  SERVER: "server",
  CANCELED: "canceled",
  UNKNOWN: "unknown",
};

/**
 * A resolved copy table, one entry per `errors.json` message key (e.g.
 * "network", "not_found"). This is plain serializable data — not a
 * translator function — so it can be built server-side via getTranslations
 * and passed as a prop across the server/client boundary, or built
 * client-side from useTranslations("errors") in components that render
 * inside the NextIntlClientProvider tree.
 */
export type ErrorsCopyTable = Record<string, { title: string; description: string; actionLabel?: string }>;

const FALLBACK_EN: FriendlyCopy = {
  title: "Something went wrong",
  description: "Please try again later.",
};

const FALLBACK_ZH: FriendlyCopy = {
  title: "出错了",
  description: "请稍后再试。",
};

function copyFor(table: ErrorsCopyTable, kind: ErrorKind): FriendlyCopy {
  const key = KIND_TO_MESSAGE_KEY[kind];
  const entry = table[key] ?? table.unknown;
  if (!entry) {
    const isZh = table.network?.title?.match?.(/[一-鿿]/);
    return isZh ? FALLBACK_ZH : FALLBACK_EN;
  }
  return { title: entry.title, description: entry.description, actionLabel: entry.actionLabel };
}

export function friendlyMessage(err: unknown, table: ErrorsCopyTable): FriendlyCopy {
  if (err instanceof ApiError) {
    const base = copyFor(table, err.kind);
    // For VALIDATION we try to surface a short server hint if it looks safe.
    if (err.kind === "VALIDATION") {
      const hint = shortHint(err.detail);
      if (hint) return { ...base, description: hint };
    }
    return base;
  }
  return copyFor(table, "UNKNOWN");
}

/**
 * Best-effort: pull a one-line hint out of a backend error body without
 * dumping raw JSON to end users.
 */
function shortHint(detail: string): string | null {
  const trimmed = detail.trim();
  if (!trimmed) return null;
  // FastAPI 422 => {"detail":[{"msg":"...","loc":[...]}, ...]}
  try {
    const obj = JSON.parse(trimmed) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      "detail" in obj &&
      Array.isArray((obj as { detail: unknown }).detail)
    ) {
      const first = (obj as { detail: Array<{ msg?: string }> }).detail[0];
      if (first?.msg) return String(first.msg).slice(0, 160);
    }
    if (obj && typeof obj === "object" && "detail" in obj) {
      const d = (obj as { detail: unknown }).detail;
      if (typeof d === "string") return d.slice(0, 160);
    }
  } catch {
    /* not JSON */
  }
  return trimmed.length > 200 ? null : trimmed;
}

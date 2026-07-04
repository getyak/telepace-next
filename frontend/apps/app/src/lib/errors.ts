/**
 * Central error classification + user-facing copy.
 *
 * The HTTP layer wraps every non-2xx response and every network failure
 * into an ApiError with a stable `kind`. UI code should never inspect
 * `err.message` (that's raw backend detail — English, JSON, or stack).
 * Instead, feed the error through `friendlyMessage()` to get a Chinese
 * copy suitable for a toast / inline banner.
 */

export type ErrorKind =
  | "NETWORK" //   fetch never reached server (offline, DNS, TLS, CORS)
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

const COPY: Record<ErrorKind, FriendlyCopy> = {
  NETWORK: {
    title: "网络无法连接",
    description: "请检查网络后重试。如启用了代理,localhost 需加入直连。",
  },
  AUTH: {
    title: "登录已过期",
    description: "请重新登录以继续操作。",
    actionLabel: "去登录",
  },
  FORBIDDEN: {
    title: "无权访问",
    description: "当前账号没有执行此操作的权限。",
  },
  NOT_FOUND: {
    title: "内容不存在",
    description: "对象可能已被删除,或链接已失效。",
  },
  VALIDATION: {
    title: "请求内容不符合要求",
    description: "请检查输入后再试一次。",
  },
  RATE_LIMIT: {
    title: "操作过于频繁",
    description: "请稍等几秒后重试。",
  },
  SERVER: {
    title: "服务暂时不可用",
    description: "后端出现异常,已记录问题,请稍后再试。",
  },
  CANCELED: {
    title: "已取消",
    description: "该操作已被中止。",
  },
  UNKNOWN: {
    title: "出错了",
    description: "发生了未预期的问题,请稍后再试。",
  },
};

export function friendlyMessage(err: unknown): FriendlyCopy {
  if (err instanceof ApiError) {
    const base = COPY[err.kind];
    // For VALIDATION we try to surface a short server hint if it looks safe.
    if (err.kind === "VALIDATION") {
      const hint = shortHint(err.detail);
      if (hint) return { ...base, description: hint };
    }
    return base;
  }
  return COPY.UNKNOWN;
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

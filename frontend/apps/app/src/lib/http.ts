/**
 * Shared HTTP client for the app.
 *
 * All requests go same-origin to the Next.js BFF:
 *   - backend `/auth/*`  →  `/api/auth/*`   (cookie-setting handlers)
 *   - everything else    →  `/api/proxy/*`  (Bearer attached server-side)
 *
 * The session lives in httpOnly cookies, so this layer holds no tokens.
 * It still provides:
 *   - 401 → single-flight cookie refresh → single retry
 *   - classified errors (ApiError with `kind`) — see lib/errors.ts
 *   - a lightweight event bus so a global toast bridge can react to every
 *     failed request without every call site having to opt in
 */

import { apiEndpoints } from "@telepace/config";

import { ApiError, kindFromStatus } from "./errors";

export { ApiError } from "./errors";
export type { ErrorKind } from "./errors";

type RequestInit_ = RequestInit & { json?: unknown };

// A non-streaming request that never returns leaves the UI stuck forever — the
// audit hit exactly this: `POST /v1/campaigns` stayed pending and the "drafting
// your outline…" bubble spun with no timeout, error, or way out. Any request
// that doesn't bring its own AbortSignal (SSE and user-cancelable calls do) gets
// this client-side deadline so a hung request fails loudly instead of silently.
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------- BFF path mapping ------------------------------------------------

/** Endpoints that must never trigger a refresh-retry (they'd loop). */
const NO_REFRESH_PATHS = new Set<string>([
  apiEndpoints.auth.login,
  apiEndpoints.auth.register,
  apiEndpoints.auth.refresh,
  apiEndpoints.auth.logout,
]);

function toBffPath(path: string): string {
  return path.startsWith("/auth/") ? `/api${path}` : `/api/proxy${path}`;
}

// ---------- Event bus (module-local; no framework dep) ---------------------

export type HttpEvent =
  | { type: "api:error"; error: ApiError; method: string; path: string }
  | { type: "auth:expired" };

type Listener = (evt: HttpEvent) => void;
const listeners = new Set<Listener>();

export function onHttpEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(evt: HttpEvent): void {
  for (const fn of listeners) {
    try {
      fn(evt);
    } catch {
      /* subscriber must not break the request */
    }
  }
}

// ---------- Single-flight refresh -----------------------------------------

let refreshInFlight: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(toBffPath(apiEndpoints.auth.refresh), {
        method: "POST",
      });
      return res.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    // Release the lock on next tick so pending 401s don't reuse a stale result.
    setTimeout(() => {
      refreshInFlight = null;
    }, 0);
  });
  return refreshInFlight;
}

// ---------- Core request ---------------------------------------------------

function buildHeaders(init: RequestInit_): Headers {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function methodOf(init: RequestInit_): string {
  return (init.method || "GET").toUpperCase();
}

async function doFetch(path: string, init: RequestInit_): Promise<Response> {
  const { json, headers: _h, signal: callerSignal, ...rest } = init;
  const headers = buildHeaders(init);

  // Only arm the default deadline when the caller didn't bring its own signal.
  // SSE streams and user-cancelable calls pass a signal and manage their own
  // lifetime; everything else must not be able to hang forever.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let signal = callerSignal ?? undefined;
  if (!signal) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DEFAULT_TIMEOUT_MS);
    signal = controller.signal;
  }

  try {
    return await fetch(toBffPath(path), {
      ...rest,
      headers,
      signal,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (cause) {
    // fetch() only throws on network / abort / CORS — anything else is Response.
    const aborted =
      cause instanceof DOMException && cause.name === "AbortError";
    // Our own deadline firing is a TIMEOUT (retryable, distinct copy); a caller
    // aborting is CANCELED; anything else that didn't reach the server is NETWORK.
    const kind = timedOut ? "TIMEOUT" : aborted ? "CANCELED" : "NETWORK";
    const err = new ApiError({
      kind,
      status: 0,
      detail: timedOut
        ? `request timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : ((cause as Error)?.message ?? "fetch failed"),
    });
    emit({ type: "api:error", error: err, method: methodOf(init), path });
    throw err;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function toApiError(
  res: Response,
  path: string,
  init: RequestInit_,
): Promise<ApiError> {
  const detail = await res.text().catch(() => res.statusText);
  const err = new ApiError({
    kind: kindFromStatus(res.status),
    status: res.status,
    detail: detail || res.statusText,
    requestId: res.headers.get("x-request-id") ?? undefined,
  });
  emit({ type: "api:error", error: err, method: methodOf(init), path });
  return err;
}

/**
 * Perform request; on 401 attempt single-flight refresh + one retry.
 * Returns the final Response (never a 401 unless refresh failed).
 */
async function requestWithAuthRetry(
  path: string,
  init: RequestInit_,
): Promise<Response> {
  let res = await doFetch(path, init);
  if (res.status !== 401) return res;

  // Never try to refresh the credential endpoints themselves — that would loop.
  if (NO_REFRESH_PATHS.has(path)) return res;

  const ok = await refreshOnce();
  if (!ok) {
    emit({ type: "auth:expired" });
    return res;
  }
  res = await doFetch(path, init);
  if (res.status === 401) {
    emit({ type: "auth:expired" });
  }
  return res;
}

// ---------- Public API -----------------------------------------------------

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit_ = {},
): Promise<T> {
  const res = await requestWithAuthRetry(path, init);
  if (!res.ok) throw await toApiError(res, path, init);
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Streaming variant for SSE endpoints. Returns the Response object. */
export async function apiFetchRaw(
  path: string,
  init: RequestInit_ = {},
): Promise<Response> {
  const res = await requestWithAuthRetry(path, init);
  if (!res.ok || !res.body) throw await toApiError(res, path, init);
  return res;
}

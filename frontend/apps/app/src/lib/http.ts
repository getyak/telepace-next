/**
 * Shared HTTP client for the app.
 *
 * Wraps `fetch` with:
 *   - env-driven base URL (no scattered `localhost:xxxx` fallbacks)
 *   - automatic Bearer token attachment (reads from tokenStore)
 *   - consistent JSON body + error handling
 *   - one place to add refresh-on-401, retries, telemetry later
 */

import { env } from "@telepace/config";

import { tokenStore } from "./auth/store";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`HTTP ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

type RequestInit_ = RequestInit & { json?: unknown };

function buildHeaders(init: RequestInit_): Headers {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
  }
  const token = tokenStore.getAccessToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit_ = {},
): Promise<T> {
  const { json, headers: _h, ...rest } = init;
  const headers = buildHeaders(init);
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Streaming variant for SSE endpoints. Returns the Response object. */
export async function apiFetchRaw(
  path: string,
  init: RequestInit_ = {},
): Promise<Response> {
  const { json, headers: _h, ...rest } = init;
  const headers = buildHeaders(init);
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return res;
}

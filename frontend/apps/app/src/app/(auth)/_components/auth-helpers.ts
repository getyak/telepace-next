/**
 * Client helpers shared by the login and signup forms.
 */

import { storageKeys } from "@telepace/config";

import { ApiError } from "@/lib/http";

export type LoginMethod = "password" | "google";

export function getLastLoginMethod(): LoginMethod | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(storageKeys.lastLoginMethod);
  return v === "password" || v === "google" ? v : null;
}

export function rememberLoginMethod(method: LoginMethod): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKeys.lastLoginMethod, method);
}

/**
 * Turn an auth API failure into one short, recoverable English sentence.
 * Never dumps raw backend payloads at the user.
 */
export function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Email or password is incorrect.";
    if (err.kind === "NETWORK") return "Can't reach the server. Check your connection and try again.";
    if (err.kind === "RATE_LIMIT") return "Too many attempts. Wait a moment and try again.";
    const hint = extractDetail(err.detail);
    if (hint) return hint;
  }
  return "Something went wrong. Please try again.";
}

function extractDetail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as { detail?: unknown };
    if (typeof obj.detail === "string" && obj.detail.length <= 160) {
      return obj.detail;
    }
    if (Array.isArray(obj.detail)) {
      const first = obj.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return String(first.msg).slice(0, 160);
    }
  } catch {
    /* not JSON */
  }
  return null;
}

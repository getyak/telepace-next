/**
 * Client helpers shared by the login and signup forms.
 */

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  storageKeys,
  type ValidationError,
} from "@telepace/config";

import { ApiError } from "@/lib/http";

/** Translator shape compatible with next-intl's useTranslations("auth"). */
type AuthTranslator = (key: string, values?: Record<string, string | number>) => string;

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
 * Map a `packages/config` validation error code to a translated sentence.
 * `packages/config` stays i18n-agnostic (returns codes only) — this is
 * where {field, code} is looked up against the "auth.validation" namespace.
 */
export function validationErrorMessage(err: ValidationError, t: AuthTranslator): string {
  const field = err.field as "email" | "password" | "display_name";
  const key = `${field}.${err.code}`;
  if (err.code === "too_short" && field === "password") {
    return t(key, { min: PASSWORD_MIN_LENGTH });
  }
  if (err.code === "too_long" && (field === "password" || field === "display_name")) {
    return t(key, { max: field === "password" ? PASSWORD_MAX_LENGTH : DISPLAY_NAME_MAX_LENGTH });
  }
  try {
    return t(key);
  } catch {
    return t("generic");
  }
}

/**
 * Turn an auth API failure into one short, recoverable translated sentence.
 * Never dumps raw backend payloads at the user.
 */
export function authErrorMessage(err: unknown, t: AuthTranslator): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("errors.invalidCredentials");
    if (err.kind === "NETWORK") return t("errors.network");
    if (err.kind === "RATE_LIMIT") return t("errors.rateLimit");
    const hint = extractDetail(err.detail);
    if (hint) return hint;
  }
  return t("errors.generic");
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

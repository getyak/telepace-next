/**
 * Shared auth form-validation rules.
 *
 * The backend enforces the canonical rule via Settings.password_min_length;
 * we mirror that value here so the UI can give immediate feedback instead
 * of round-tripping. Both sides must agree — if you change the server
 * default, update `PASSWORD_MIN_LENGTH` too.
 *
 * Returns stable error codes rather than message strings so this package
 * stays free of any i18n library dependency — the app layer maps
 * `{field, code}` to a translated string via `useTranslations`.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const DISPLAY_NAME_MAX_LENGTH = 256;

export type ValidationErrorCode = "required" | "invalid_email" | "too_short" | "too_long";

export type ValidationError = { field: string; code: ValidationErrorCode };

function containsWhitespace(value: string): boolean {
  for (const character of value) {
    if (character.trim() === "") return true;
  }
  return false;
}

/** Mirrors the previous simple email rule with a bounded linear scan. */
export function isValidEmail(value: string): boolean {
  if (containsWhitespace(value)) return false;

  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;

  const domain = value.slice(at + 1);
  const dot = domain.indexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

export function validateEmail(value: string): ValidationError | null {
  const trimmed = value.trim();
  if (!trimmed) return { field: "email", code: "required" };
  if (!isValidEmail(trimmed)) {
    return { field: "email", code: "invalid_email" };
  }
  return null;
}

export function validatePassword(value: string): ValidationError | null {
  if (!value) return { field: "password", code: "required" };
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { field: "password", code: "too_short" };
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return { field: "password", code: "too_long" };
  }
  return null;
}

export function validateDisplayName(
  value: string | undefined | null,
): ValidationError | null {
  if (!value) return null;
  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return { field: "display_name", code: "too_long" };
  }
  return null;
}

export function validateLogin(input: {
  email: string;
  password: string;
}): ValidationError[] {
  return [validateEmail(input.email), validatePassword(input.password)].filter(
    (v): v is ValidationError => v !== null,
  );
}

export function validateRegister(input: {
  email: string;
  password: string;
  display_name?: string | null;
}): ValidationError[] {
  return [
    validateEmail(input.email),
    validatePassword(input.password),
    validateDisplayName(input.display_name),
  ].filter((v): v is ValidationError => v !== null);
}

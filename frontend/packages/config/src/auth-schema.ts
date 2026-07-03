/**
 * Shared auth form-validation rules.
 *
 * The backend enforces the canonical rule via Settings.password_min_length;
 * we mirror that value here so the UI can give immediate feedback instead
 * of round-tripping. Both sides must agree — if you change the server
 * default, update `PASSWORD_MIN_LENGTH` too.
 */

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const DISPLAY_NAME_MAX_LENGTH = 256;

export type ValidationError = { field: string; message: string };

export function validateEmail(value: string): ValidationError | null {
  const trimmed = value.trim();
  if (!trimmed) return { field: "email", message: "Email is required" };
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { field: "email", message: "Enter a valid email address" };
  }
  return null;
}

export function validatePassword(value: string): ValidationError | null {
  if (!value) return { field: "password", message: "Password is required" };
  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      field: "password",
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return {
      field: "password",
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    };
  }
  return null;
}

export function validateDisplayName(
  value: string | undefined | null,
): ValidationError | null {
  if (!value) return null;
  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      field: "display_name",
      message: `Name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
    };
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

/**
 * Namespaced storage keys — one place to change if we ever need to
 * invalidate all client-side state atomically.
 *
 * NOTE: auth tokens deliberately have no key here. Sessions live in
 * httpOnly cookies set by the BFF (`/api/auth/*`); nothing sensitive is
 * ever written to localStorage.
 */

const NS = "telepace";

export const storageKeys = {
  /** Non-sensitive: remembers which sign-in method was used last ("google" | "password"). */
  lastLoginMethod: `${NS}.auth.last_method`,
} as const;

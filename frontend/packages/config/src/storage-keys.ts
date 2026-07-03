/**
 * Namespaced storage keys — one place to change if we ever need to
 * invalidate all client-side sessions atomically.
 */

const NS = "telepace";

export const storageKeys = {
  accessToken: `${NS}.auth.access_token`,
  refreshToken: `${NS}.auth.refresh_token`,
  currentUser: `${NS}.auth.user`,
} as const;

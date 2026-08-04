/**
 * Session cookie contract — the only place cookie names/options live.
 *
 * Tokens are stored in httpOnly cookies set by the BFF routes under
 * /api/auth/*; client JS can never read them (kills the XSS token-theft
 * class the old localStorage store was exposed to).
 */

import type { NextResponse } from "next/server";

export const ACCESS_COOKIE = "tp_access";
export const REFRESH_COOKIE = "tp_refresh";
const LEGACY_REFRESH_PATH = "/api/auth";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  /** Access-token lifetime in seconds, as reported by the backend. */
  expires_in: number;
};

const REFRESH_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

function isSecure(): boolean {
  // Dev runs over plain http on localhost; Secure would drop the cookie.
  return process.env.NODE_ENV === "production";
}

export function setSessionCookies(res: NextResponse, tokens: TokenPair): void {
  res.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in,
  });
  // Keep the refresh token httpOnly, but send it on same-origin page requests
  // as well as /api/auth. Middleware must be able to see that a renewable
  // session exists after the short-lived access cookie expires; otherwise a
  // full-page navigation is redirected to login before the client can call
  // the refresh endpoint.
  res.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: LEGACY_REFRESH_PATH,
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_S,
  });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  // Remove sessions issued before refresh cookies moved to the root path.
  res.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: LEGACY_REFRESH_PATH,
    maxAge: 0,
  });
}

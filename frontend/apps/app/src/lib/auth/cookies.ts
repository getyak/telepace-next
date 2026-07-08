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
  // The refresh token is only ever needed by /api/auth/* — scope it there.
  res.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/api/auth",
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
    path: "/api/auth",
    maxAge: 0,
  });
}

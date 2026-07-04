/**
 * Shared plumbing for the /api/auth/* BFF routes.
 *
 * The BFF is a deliberately thin layer: forward credentials to the
 * backend, translate the token response into httpOnly cookies, and pass
 * upstream error bodies through untouched so the client's ApiError
 * classification keeps working.
 */

import { NextResponse } from "next/server";
import { env } from "@telepace/config";

import { setSessionCookies, type TokenPair } from "./cookies";

export function backendUrl(path: string): string {
  return `${env.apiBaseUrl}${path}`;
}

/** Mirror an upstream (error) response body + status to the client. */
export function passthrough(status: number, body: string, contentType?: string | null): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "content-type": contentType ?? "application/json" },
  });
}

/**
 * POST credentials to a backend token endpoint (login/register); on
 * success set session cookies and return `{ ok: true }` — tokens never
 * reach the browser JS.
 */
export async function authenticateAndSetCookies(
  backendPath: string,
  body: unknown,
): Promise<NextResponse> {
  const upstream = await fetch(backendUrl(backendPath), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    return passthrough(upstream.status, text || upstream.statusText, upstream.headers.get("content-type"));
  }
  const tokens = JSON.parse(text) as TokenPair;
  const res = NextResponse.json({ ok: true });
  setSessionCookies(res, tokens);
  return res;
}

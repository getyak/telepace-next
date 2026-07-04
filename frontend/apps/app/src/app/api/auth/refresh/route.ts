import { NextResponse, type NextRequest } from "next/server";
import { apiEndpoints } from "@telepace/config";

import { backendUrl, passthrough } from "@/lib/auth/bff";
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth/cookies";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const res = NextResponse.json({ detail: "No session" }, { status: 401 });
    clearSessionCookies(res);
    return res;
  }

  const upstream = await fetch(backendUrl(apiEndpoints.auth.refresh), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    const res = passthrough(upstream.status, text || upstream.statusText, upstream.headers.get("content-type"));
    clearSessionCookies(res);
    return res;
  }

  const tokens = JSON.parse(text) as TokenPair;
  const res = NextResponse.json({ ok: true });
  setSessionCookies(res, tokens);
  return res;
}

import { NextResponse } from "next/server";
import { apiEndpoints } from "@telepace/config";

import { backendUrl } from "@/lib/auth/bff";
import { setSessionCookies, type TokenPair } from "@/lib/auth/cookies";
import { routing } from "@/i18n/routing";

/**
 * Google redirects the browser here (the "Authorized redirect URI" configured
 * in Google Cloud Console). We hand the one-time `code` + `state` to the
 * backend `/exchange`, which verifies the state, swaps the code for a session,
 * finds-or-creates the user, and returns a token pair. We translate that into
 * httpOnly cookies — exactly like the login/register BFF routes — so tokens
 * never touch browser JS, then land the user in the app.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  // Derive the app origin from the request so redirects work under any host
  // (localhost in dev, the real domain in prod) without a dedicated env var.
  // localePrefix is "always" — bake in the default locale so the browser lands
  // on a real page instead of taking an extra middleware redirect hop.
  const loc = routing.defaultLocale;
  const failure = new URL(`/${loc}/login?error=oauth`, url.origin);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // Google reports user-declined consent as `?error=access_denied`.
  if (url.searchParams.get("error") || !code || !state) {
    return NextResponse.redirect(failure, 302);
  }

  const upstream = await fetch(backendUrl(apiEndpoints.auth.oauthGoogleExchange), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state }),
    cache: "no-store",
  });
  if (!upstream.ok) {
    return NextResponse.redirect(failure, 302);
  }

  const tokens = (await upstream.json()) as TokenPair;
  const res = NextResponse.redirect(new URL(`/${loc}/studies`, url.origin), 302);
  setSessionCookies(res, tokens);
  return res;
}

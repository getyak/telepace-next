import { NextResponse } from "next/server";
import { apiEndpoints } from "@telepace/config";

import { backendUrl } from "@/lib/auth/bff";

/**
 * OAuth entry point. A full-page navigation (not XHR) hits this route; we
 * bounce the browser to the backend `/start`, which signs a CSRF state and
 * 302s on to Google's consent screen. Keeping the entry on the frontend origin
 * means the eventual callback (and its cookies) also land here — see
 * ./google/callback/route.ts.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.redirect(backendUrl(apiEndpoints.auth.oauthGoogleStart), 302);
}

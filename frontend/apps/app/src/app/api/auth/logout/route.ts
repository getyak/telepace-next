import { NextResponse, type NextRequest } from "next/server";
import { apiEndpoints } from "@telepace/config";

import { backendUrl } from "@/lib/auth/bff";
import { ACCESS_COOKIE, clearSessionCookies } from "@/lib/auth/cookies";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (token) {
    // Best-effort server-side revocation; local cookies are cleared regardless.
    try {
      await fetch(backendUrl(apiEndpoints.auth.logout), {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      /* network failure must not block logout */
    }
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}

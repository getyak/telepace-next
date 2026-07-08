import { NextResponse, type NextRequest } from "next/server";
import { apiEndpoints } from "@telepace/config";

import { backendUrl, passthrough } from "@/lib/auth/bff";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const upstream = await fetch(backendUrl(apiEndpoints.auth.me), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await upstream.text();
  return passthrough(upstream.status, text, upstream.headers.get("content-type"));
}

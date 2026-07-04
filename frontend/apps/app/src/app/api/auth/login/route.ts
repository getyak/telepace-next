import { NextResponse } from "next/server";
import { apiEndpoints } from "@telepace/config";

import { authenticateAndSetCookies } from "@/lib/auth/bff";

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }
  return authenticateAndSetCookies(apiEndpoints.auth.login, body);
}

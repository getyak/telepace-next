/**
 * Authenticated pass-through proxy: /api/proxy/<backend-path>.
 *
 * The browser talks same-origin; this handler attaches the Bearer token
 * from the httpOnly session cookie and streams the backend response back
 * (SSE included). Auth endpoints have dedicated handlers under /api/auth.
 */

import { type NextRequest } from "next/server";
import { env } from "@telepace/config";

import { ACCESS_COOKIE } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const target = `${env.apiBaseUrl}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer();

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    cache: "no-store",
  });

  const resHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) resHeaders.set("content-type", upstreamType);
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) resHeaders.set("x-request-id", requestId);
  resHeaders.set("cache-control", "no-store");

  // Stream the body through untouched — keeps SSE endpoints working.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};

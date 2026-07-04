import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE } from "./lib/auth/cookies";

/**
 * Session guard for the app surface. Anything under these prefixes
 * requires the httpOnly access cookie; guests are bounced to /login
 * with a `next` param so they land back where they started.
 *
 * Keep the list in sync with `routes.app` in @telepace/config.
 */
const PROTECTED_PREFIXES = [
  "/studies",
  "/inbox",
  "/audience",
  "/insights",
  "/integrations",
  "/settings",
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();
  if (req.cookies.get(ACCESS_COOKIE)?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/studies/:path*",
    "/inbox/:path*",
    "/audience/:path*",
    "/insights/:path*",
    "/integrations/:path*",
    "/settings/:path*",
  ],
};

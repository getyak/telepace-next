import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import { ACCESS_COOKIE } from "./lib/auth/cookies";

/**
 * Session guard for the app surface. Anything under these prefixes
 * requires the httpOnly access cookie; guests are bounced to /login
 * with a `next` param so they land back where they started.
 *
 * Keep the list in sync with `routes.app` in @telepace/config. Matched
 * against the locale-stripped "logical" path — see `middleware()` below.
 */
const PROTECTED_PREFIXES = [
  "/studies",
  "/inbox",
  "/audience",
  "/insights",
  "/integrations",
  "/settings",
];

const LOCALE_PREFIX_RE = /^\/(en|zh)(\/.*)?$/;

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const match = pathname.match(LOCALE_PREFIX_RE);
  const locale = match?.[1] ?? routing.defaultLocale;
  const logicalPath = match ? match[2] || "/" : pathname;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => logicalPath === p || logicalPath.startsWith(`${p}/`),
  );

  if (isProtected && !req.cookies.get(ACCESS_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return intlMiddleware(req);
}

export const config = {
  // Run on every page route (needed for next-intl locale negotiation), but
  // skip API routes, Next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

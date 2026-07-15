import { describe, it, expect, vi } from "vitest";

// next-intl's middleware is a no-op here: these tests only exercise the session
// guard that runs *before* it, so the locale negotiation it performs is noise.
vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response(null, { status: 200 }),
}));

import middleware from "./middleware";

/**
 * The redirect stores `next` for the login form, which pushes it through
 * next-intl's router — and that router re-applies the locale prefix itself.
 * So `next` must be locale-stripped; a physical path would produce /zh/zh/…
 */
function guestRequest(url: string) {
  return {
    nextUrl: Object.assign(new URL(url), {
      clone() {
        return new URL(url);
      },
    }),
    cookies: { get: () => undefined },
  } as never;
}

function nextParamOf(res: Response): string | null {
  const location = res.headers.get("location");
  if (!location) return null;
  return new URL(location).searchParams.get("next");
}

describe("session guard redirect", () => {
  it("strips the locale prefix from `next`", () => {
    const res = middleware(guestRequest("http://localhost/zh/studies/new"));
    expect(nextParamOf(res)).toBe("/studies/new");
  });

  it("keeps the query string on the target path", () => {
    const res = middleware(guestRequest("http://localhost/en/inbox?filter=open"));
    expect(nextParamOf(res)).toBe("/inbox?filter=open");
  });

  it("redirects to the login page of the requested locale", () => {
    const res = middleware(guestRequest("http://localhost/zh/settings"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/zh/login");
  });

  it("never emits a doubled locale prefix", () => {
    for (const path of ["/zh/studies", "/en/audience", "/zh/insights/x"]) {
      const next = nextParamOf(middleware(guestRequest(`http://localhost${path}`)));
      expect(next).not.toMatch(/^\/(en|zh)\//);
    }
  });

  it("lets unprotected routes through to the intl middleware", () => {
    const res = middleware(guestRequest("http://localhost/zh/pricing"));
    expect(res.headers.get("location")).toBeNull();
  });
});

# E2E

Real browser, real production build, real backend. No mocked session — the
auth handoff is exactly where the bugs have been.

## Run

```bash
# 1. build once (the suite runs `next start`, not `next dev`)
cd frontend/apps/app && pnpm build

# 2. backend must be up on :8010 — login is a real request
#    (see the repo root: `uv run uvicorn interfaces.api.main:app --port 8010`)

# 3. run
cd frontend && pnpm test:e2e
pnpm test:e2e:ui          # pick/step through tests
pnpm exec playwright test --project=guest    # only the logged-out specs
```

First run registers `e2e-test@telepace.local`; after that it just signs in.
Override with `E2E_EMAIL` / `E2E_PASSWORD`.

## Why a production build

`next dev` compiles each route on first hit — 90s+ on a cold cache here, far
past any sane timeout, and flaky besides. `next start` serves the same output
users get. Keep a server warm between runs; `reuseExistingServer` picks it up.

## Browser

Locally the suite drives your installed Chrome (`channel: "chrome"`).
`playwright install` pulls 171 MiB from a CDN that a local proxy (Clash et al.)
will stall at 0% forever — not something anyone should have to debug to run
tests. CI uses Playwright's pinned Chromium instead, which is reproducible and
the only option on a bare runner. Force it locally with `E2E_BROWSER=chromium`.

## Proxy

If your shell exports `http_proxy`/`all_proxy`, localhost requests get routed
through it and come back 502. Either unset them for the run or export
`NO_PROXY=127.0.0.1,localhost`.

## Layout

| file | covers |
|---|---|
| `auth.setup.ts` | signs in once, banks cookies for the `authed` project |
| `auth-redirect.guest.spec.ts` | guest → login → intended page; guards the `/zh/zh/…` 404 regression |
| `app-metadata.spec.ts` | 16 routes: localized title, `noindex`, exactly one `h1` |
| `app-smoke.spec.ts` | every app surface renders, console stays clean, sidebar resolves |

`*.guest.spec.ts` runs signed-out; everything else inherits the stored session.

## Not in CI yet

CI has no FastAPI + postgres + redis in the frontend job, so the suite is
local-only for now. Wiring it up means standing those services next to the
frontend job — worth doing, not done here.

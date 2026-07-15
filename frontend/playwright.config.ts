import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a PRODUCTION build, not `next dev`.
 *
 * Two reasons: dev compiles each route on first hit (90s+ here, well past any
 * sane timeout), and the thing users actually get is the built output — a
 * dev-only pass proves less. `reuseExistingServer` keeps a warm server between
 * local runs; CI always builds fresh.
 */
const PORT = Number(process.env.E2E_PORT ?? 3300);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * CI downloads Playwright's pinned Chromium — reproducible, and the only
 * option on a bare runner. Locally we drive the Chrome that's already
 * installed: `playwright install` pulls 171 MiB from a CDN that a corporate/
 * local proxy will happily stall forever, and nobody should have to fight
 * that to run the suite. Set E2E_BROWSER=chromium to force the pinned build.
 */
const useSystemChrome = !process.env.CI && process.env.E2E_BROWSER !== "chromium";
const browser = useSystemChrome
  ? { ...devices["Desktop Chrome"], channel: "chrome" as const }
  : devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./e2e",
  // A failing E2E must fail the run, never flake its way to green: no retries
  // locally, one in CI purely to absorb infra blips (not app races).
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // localhost must never go through the shell's proxy (this machine exports
    // http_proxy to a local Clash); without this every request 502s.
    ignoreHTTPSErrors: true,
  },

  projects: [
    // Signs in once and banks the cookies; the authed project reuses them
    // instead of paying a login round-trip per test file.
    { name: "setup", testMatch: /auth\.setup\.ts/, use: browser },
    {
      name: "guest",
      use: browser,
      testMatch: /.*\.guest\.spec\.ts/,
    },
    {
      name: "authed",
      use: { ...browser, storageState: "e2e/.auth/user.json" },
      testIgnore: /.*\.guest\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "pnpm --filter @telepace/app exec next start -p " + PORT,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

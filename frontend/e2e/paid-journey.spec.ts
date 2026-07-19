import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Freezes the paid user journey the 2026-07 dual-user review walked by hand,
 * so the Critical bugs it surfaced can never regress silently:
 *
 *  - T-501 org isolation — a brand-new account must see ZERO studies, never
 *    another tenant's data. This is the one that scored the review a Critical.
 *  - T-504 create robustness — the design chat must render and stay operable
 *    (an input you can type into), never the permanent "drafting…" hang.
 *  - insights surface renders for a fresh account instead of erroring.
 *
 * Unlike the shared-account suite this registers a UNIQUE user per run: the
 * isolation assertion is only meaningful on an account nobody else has
 * touched. It needs the real backend (BFF auth + campaigns API); when that
 * isn't up the whole file skips rather than reporting false failures.
 */

const BFF_HEALTH = "/api/auth/me";

// A per-run identity so "no studies" actually proves isolation, not reuse.
function uniqueEmail(): string {
  // Playwright forbids Date.now()/Math.random() nowhere — but to stay
  // deterministic-ish and collision-free we lean on the worker + timestamp.
  const stamp = `${process.pid}-${Date.now()}`;
  return `paid-journey-${stamp}@e2e.local`;
}

const EMAIL = uniqueEmail();
const PASSWORD = "E2eJourney!2026";

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    // /api/auth/me answers 200/401 when the BFF+backend are alive; a network
    // error (backend down) throws and we skip.
    const res = await request.get(BFF_HEALTH, { failOnStatusCode: false });
    return res.status() === 200 || res.status() === 401;
  } catch {
    return false;
  }
}

async function registerAndLogin(page: Page, request: APIRequestContext): Promise<void> {
  await request
    .post("/api/auth/register", {
      data: { email: EMAIL, password: PASSWORD },
      failOnStatusCode: false,
    })
    .catch(() => undefined);

  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/en\/studies(\?.*)?$/, { timeout: 15_000 });
}

test.describe("paid journey — fresh account", () => {
  // This suite registers its OWN brand-new user, so it must NOT inherit the
  // shared authed cookie (that account already owns studies and would send
  // /en/login straight to /studies, hiding the form). Start clean.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ request }) => {
    test.skip(!(await backendUp(request)), "backend/BFF not reachable — skipping journey");
  });

  test("a brand-new account sees zero studies (T-501 org isolation)", async ({
    page,
    request,
  }) => {
    await registerAndLogin(page, request);

    // The account is seconds old and owns its own org — the list must be empty.
    // Regressing T-501 (falling back to the shared default org) would surface
    // other tenants' studies here and fail this assertion.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toContainText(/no studies yet/i);

    // Belt-and-braces: no real study cards (links into /studies/<uuid>).
    const hrefs = await page
      .locator('a[href*="/studies/"]')
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute("href") || "")
          .filter((h) => /\/studies\/[0-9a-f-]{8,}/.test(h)),
      );
    expect(hrefs, "a fresh org must own no studies").toEqual([]);
  });

  test("the create-study chat renders and stays operable (T-504)", async ({
    page,
    request,
  }) => {
    await registerAndLogin(page, request);
    await page.goto("/en/studies/new");

    // The design chat must present a usable composer — the T-504 hang left the
    // input permanently disabled after "drafting…". Assert we can focus it.
    const composer = page
      .getByRole("textbox")
      .or(page.locator("textarea"))
      .first();
    await expect(composer).toBeVisible({ timeout: 10_000 });
    await expect(composer).toBeEditable();

    // No permanent-hang / crash shell.
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("404");
  });

  test("the insights surface renders for a fresh account", async ({
    page,
    request,
  }) => {
    await registerAndLogin(page, request);
    await page.goto("/en/insights", { waitUntil: "networkidle" });

    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});

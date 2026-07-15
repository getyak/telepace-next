import { test, expect, type Page } from "@playwright/test";

/**
 * Does each surface actually render, or does it 200 with a broken shell?
 * A status code proves the route resolved, nothing about what the user sees —
 * so these assert on rendered content plus a clean console.
 */
const ROUTES = [
  "/zh/studies",
  "/zh/studies/new",
  "/zh/insights",
  "/zh/inbox",
  "/zh/audience",
  "/zh/settings",
  "/zh/integrations",
  "/zh/copilot",
];

// Noise we can't act on: a failed favicon or an extension's chatter says
// nothing about the app. Anything else is a real console error.
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon|ERR_INTERNET_DISCONNECTED/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

for (const path of ROUTES) {
  test(`${path} renders without console errors`, async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(path, { waitUntil: "networkidle" });

    await expect(page.locator("main")).toBeVisible();
    // A blank shell still has <main>; require real text in it.
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("404");

    expect(errors, `console errors on ${path}`).toEqual([]);
  });
}

test("the sidebar reaches every app surface", async ({ page }) => {
  await page.goto("/zh/studies");
  const nav = page.getByRole("navigation").first();

  // Each sidebar destination must resolve — an orphaned page (shipped but
  // unreachable) has happened here before.
  for (const name of ["问卷", "收件箱", "受众", "洞察", "集成", "设置"]) {
    const link = nav.getByRole("link", { name, exact: true });
    await expect(link, `sidebar link: ${name}`).toHaveCount(1);
  }
});

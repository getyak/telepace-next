import { test, expect } from "@playwright/test";

/**
 * Every app page used to inherit the root layout's English marketing title, so
 * /zh/insights and /zh/settings were indistinguishable in the tab strip, and
 * none of them carried noindex despite sitting behind the session guard.
 */
const PAGES = [
  { path: "/zh/studies", title: "问卷 · telepace" },
  { path: "/zh/studies/new", title: "新建问卷 · telepace" },
  { path: "/zh/insights", title: "洞察 · telepace" },
  { path: "/zh/inbox", title: "收件箱 · telepace" },
  { path: "/zh/audience", title: "受众 · telepace" },
  { path: "/zh/settings", title: "设置 · telepace" },
  { path: "/zh/integrations", title: "集成 · telepace" },
  { path: "/zh/copilot", title: "Copilot · telepace" },
  { path: "/en/studies", title: "Studies · telepace" },
  { path: "/en/studies/new", title: "New study · telepace" },
  { path: "/en/insights", title: "Insights · telepace" },
  { path: "/en/inbox", title: "Inbox · telepace" },
  { path: "/en/audience", title: "Audience · telepace" },
  { path: "/en/settings", title: "Settings · telepace" },
  { path: "/en/integrations", title: "Integrations · telepace" },
  { path: "/en/copilot", title: "Copilot · telepace" },
];

for (const { path, title } of PAGES) {
  test(`${path} is titled, noindex, and has one h1`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveTitle(title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    // Exactly one — a second h1 would mean a page grew a competing title.
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("marketing pages stay indexable", async ({ page }) => {
  for (const path of ["/zh", "/en/pricing"]) {
    await page.goto(path);
    const robots = page.locator('meta[name="robots"]');
    // Guards the blast radius of the app-wide noindex: if it ever leaks onto
    // marketing, the site quietly falls out of search.
    if (await robots.count()) {
      await expect(robots).toHaveAttribute("content", /(?<!no)index/);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  }
});

import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "e2e-test@telepace.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2eTest!2026";

/**
 * Regression net for the /zh/zh/... 404: the guard stored a locale-prefixed
 * path in `next`, and next-intl's router prefixed it a second time, so every
 * guest who landed on a protected page finished login on a 404. The unit test
 * covers the middleware's half; this covers the handoff the unit test cannot
 * see — that the form's push actually resolves to a live page.
 */
test.describe("guest -> login -> intended page", () => {
  test("lands on the requested page, not a doubled-locale 404", async ({ page }) => {
    await page.goto("/zh/studies/new");

    await expect(page).toHaveURL(/\/zh\/login\?next=%2Fstudies%2Fnew$/);

    await page.getByLabel("邮箱").fill(EMAIL);
    await page.getByLabel("密码").fill(PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();

    await page.waitForURL(/\/zh\/studies\/new$/, { timeout: 15_000 });
    // The bug rendered a real 404 page, so URL alone is not proof.
    await expect(page.locator("body")).not.toContainText("404");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("新建问卷");
  });

  test("keeps the locale it was asked for", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fsettings$/);
  });

  test("sends guests away from every protected prefix", async ({ page }) => {
    for (const path of ["/zh/studies", "/zh/inbox", "/zh/audience", "/zh/insights", "/zh/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/zh\/login\?next=/);
    }
  });

  test("leaves public pages alone", async ({ page }) => {
    await page.goto("/zh/pricing");
    await expect(page).not.toHaveURL(/\/login/);
  });
});

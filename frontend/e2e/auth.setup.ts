import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/user.json");

const EMAIL = process.env.E2E_EMAIL ?? "e2e-test@telepace.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2eTest!2026";

/**
 * Signs in through the real form against the real backend — no mocked session,
 * because the thing most likely to break here IS the auth handoff (see the
 * /zh/zh/... redirect bug these tests were written after).
 *
 * Registration is best-effort: the account survives between local runs, so a
 * "already exists" response is the normal case, not a failure.
 */
setup("authenticate", async ({ page, request }) => {
  await request
    .post("/api/auth/register", {
      data: { email: EMAIL, password: PASSWORD, display_name: "E2E Bot" },
      failOnStatusCode: false,
    })
    .catch(() => undefined);

  await page.goto("/zh/login");
  await page.getByLabel("邮箱").fill(EMAIL);
  await page.getByLabel("密码").fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  // Landing on the app means the cookie is set AND the redirect resolved.
  await page.waitForURL(/\/zh\/studies(\?.*)?$/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});

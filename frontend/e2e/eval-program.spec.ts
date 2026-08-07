import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("production failure compiles into a downloadable mobile-safe Eval Pack", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/studies/new");

  await page
    .getByRole("button", { name: "Our support agent promised a refund outside policy" })
    .click();
  const shipDecision = page.getByRole("button", {
    name: "Ship a new agent version to production",
  });
  await expect(shipDecision).toBeVisible({ timeout: 2_000 });
  await shipDecision.click();

  const policyAuthority = page.getByRole("button", {
    name: "Company refund policy team",
  });
  await expect(policyAuthority).toBeVisible({ timeout: 2_000 });
  await policyAuthority.click();

  await expect(page.getByText("Correctness contract")).toBeVisible({ timeout: 4_000 });
  await expect(page.getByText("Promise a refund before verification")).toBeVisible();
  await expect(page.getByText("0 critical failures allowed")).toBeVisible();
  await expect(page.getByText("Current release decision")).toBeVisible();
  await expect(page.getByText("HOLD", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Do not promise when eligibility is unknown",
  })).toBeVisible();

  for (const label of ["Release decision", "Authority", "Boundaries", "Evidence"]) {
    await expect(page.getByRole("group", { name: "Evaluation readiness" })).toContainText(
      label,
    );
  }

  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsViewport, "evaluation workbench must not overflow a 390px viewport").toBe(true);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Eval Pack" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^telepace-eval-pack-v\d+-.*\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pack = JSON.parse(await readFile(downloadPath!, "utf8"));

  expect(pack.schema_version).toBe("telepace.eval-pack.v1");
  expect(pack.evaluation_plan.contract.capability).toBe(
    "Refund eligibility verification, communication, and escalation",
  );
  expect(pack.evaluation_plan.release_gate.max_critical_failures).toBe(0);
  expect(pack.release_readiness.decision).toBe("hold");
  expect(pack.release_readiness.state).toBe("not_run");
  expect(pack.release_readiness.blockers).toHaveLength(3);
  expect(pack.evaluation_plan.graders.map((grader: { kind: string }) => grader.kind)).toEqual([
    "deterministic",
    "model",
    "human",
  ]);
  expect(pack.candidate_eval_cases).toHaveLength(3);
  expect(pack.evidence_questions).toHaveLength(5);
  expect(pack.evidence_questions[0].priority_score).toBeGreaterThanOrEqual(50);

  await page.goto(`/en/studies/${pack.evaluation_program.id}`);
  await expect(page.getByRole("heading", {
    name: "Our support agent promised a refund outside policy",
    level: 1,
  })).toBeVisible();
  await expect(page.getByRole("region", { name: "Evaluation blueprint" })).toContainText(
    "Refund policy owner calibration",
  );
  await expect(page.getByRole("button", { name: "Export Eval Pack" })).toBeVisible();

  expect(errors, "eval compiler flow must stay console-clean").toEqual([]);
});

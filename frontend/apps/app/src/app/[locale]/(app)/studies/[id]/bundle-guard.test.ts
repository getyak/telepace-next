/**
 * Regression guard for the study-detail first-load bundle.
 *
 * studies/[id] was the app's heaviest route (First Load JS ~257kB) because it
 * imported TpBarChart — the sole recharts (~120kB) consumer — synchronously,
 * and through the `@/components/charts` barrel, which re-exports it. Lazy-loading
 * TpBarChart via next/dynamic and importing the recharts-free helpers from their
 * concrete files dropped it to ~143kB.
 *
 * The easy way to silently undo that win is for someone to write
 *   import { TpBarChart } from "@/components/charts";
 * back into page.tsx. This test fails loudly if the page ever pulls recharts
 * (directly or via the charts barrel) into its synchronous import graph again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PAGE = join(__dirname, "page.tsx");

function pageSource(): string {
  return readFileSync(PAGE, "utf8");
}

describe("studies/[id] bundle guard", () => {
  it("does not statically import TpBarChart (it must stay lazy)", () => {
    const src = pageSource();
    // A static `import ... TpBarChart ... from "..."` line. The lazy form is
    // `const TpBarChart = dynamic(() => import(...))`, which this won't match.
    const staticTpBarChart = /^\s*import\s+[^;]*\bTpBarChart\b[^;]*from\s+["']/m;
    expect(
      staticTpBarChart.test(src),
      "TpBarChart must be loaded via next/dynamic, not a static import — it pulls in recharts (~120kB) and would re-inflate the study-detail first-load bundle.",
    ).toBe(false);
  });

  it("does not import recharts directly", () => {
    expect(pageSource()).not.toMatch(/from\s+["']recharts["']/);
  });

  it("imports charts from concrete files, never the barrel", () => {
    const src = pageSource();
    // The barrel (`@/components/charts` with no trailing path segment)
    // re-exports TpBarChart, so importing anything through it drags recharts in.
    const barrelImport = /import\s+[^;]*from\s+["']@\/components\/charts["']/;
    expect(
      barrelImport.test(src),
      "Import chart pieces from their concrete files (e.g. @/components/charts/ChartSection), not the barrel — the barrel re-exports the recharts-heavy TpBarChart.",
    ).toBe(false);
  });
});

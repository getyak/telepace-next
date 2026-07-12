import { describe, it, expect } from "vitest";
import { deriveDecisionClarify, deriveAudienceClarify, type ClarifyCopy } from "./clarify";

const COPY: ClarifyCopy = {
  submitLabel: "Continue",
  freeformLabel: "Something else…",
  generic: {
    pricing: "Pricing & willingness to pay",
    positioning: "Positioning & differentiation",
    prioritization: "What to build next",
    messaging: "Messaging & value prop",
    retention: "Why users leave",
  },
  audience: {
    b2bBuyers: "The buyers who pay",
    endUsers: "The people who use it daily",
    churned: "People who left",
    prospects: "People considering us",
  },
};

describe("deriveDecisionClarify", () => {
  it("returns null for too-short goals (better silence than a generic form)", () => {
    expect(deriveDecisionClarify("", COPY)).toBeNull();
    expect(deriveDecisionClarify("hi", COPY)).toBeNull();
  });

  it("leads with pricing lens when the goal is about a price premium", () => {
    const p = deriveDecisionClarify("How much premium will designers pay for color accuracy?", COPY);
    expect(p).not.toBeNull();
    expect(p!.multi).toBe(true);
    expect(p!.options[0].id).toBe("pricing");
    expect(p!.options.length).toBeLessThanOrEqual(4);
  });

  it("detects Chinese pricing keywords (色准溢价)", () => {
    const p = deriveDecisionClarify("设计师愿意为显示器的色准溢价付多少", COPY);
    expect(p!.options[0].id).toBe("pricing");
  });

  it("leads with retention lens for churn goals", () => {
    const p = deriveDecisionClarify("Why did trial users churn before upgrading?", COPY);
    expect(p!.options[0].id).toBe("retention");
  });

  it("falls back to a generic decision set when no domain matches", () => {
    const p = deriveDecisionClarify("Understand how people feel about our brand", COPY);
    expect(p).not.toBeNull();
    expect(p!.options.length).toBe(4);
  });

  it("never emits duplicate option ids", () => {
    const p = deriveDecisionClarify("pricing premium cost budget churn retain", COPY);
    const ids = p!.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries the localized submit + freeform labels through", () => {
    const p = deriveDecisionClarify("Why did trial users churn before upgrading?", COPY);
    expect(p!.submitLabel).toBe("Continue");
    expect(p!.freeformLabel).toBe("Something else…");
  });
});

describe("deriveAudienceClarify", () => {
  it("is single-select with four audience options", () => {
    const p = deriveAudienceClarify(COPY);
    expect(p.multi).toBe(false);
    expect(p.options.map((o) => o.id)).toEqual(["b2b-buyers", "end-users", "churned", "prospects"]);
  });
});

import { describe, it, expect } from "vitest";
import {
  deriveDecisionClarify,
  deriveAudienceClarify,
  deriveReadiness,
  readinessDelta,
  pendingCount,
  READINESS_ORDER,
  type ClarifyCopy,
  type ReadinessSpecInput,
} from "./clarify";

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

// A minimal spec builder — mirrors the fields deriveReadiness reads, so tests
// state only what they exercise.
function spec(over: Partial<ReadinessSpecInput> = {}): ReadinessSpecInput {
  const outline = (over.outline ?? []) as ReadinessSpecInput["outline"];
  return {
    goal: over.goal ?? "",
    target_persona: over.target_persona ?? "",
    audience_screener: over.audience_screener ?? [],
    outline,
  };
}
const qs = (n: number) => Array.from({ length: n }, (_, i) => ({ order: i + 1 })) as unknown[] as ReadinessSpecInput["outline"];

describe("deriveReadiness", () => {
  it("an empty spec leaves every applicable pip pending (na for who-pays)", () => {
    const r = deriveReadiness(spec());
    expect(r.decision).toBe("pending");
    expect(r.audience).toBe("pending");
    expect(r.depth).toBe("pending");
    expect(r.questions).toBe("pending");
    // Non-pricing (empty) goal → who-pays is not-applicable, never "pending".
    expect(r.whopays).toBe("na");
  });

  it("a non-blank goal satisfies the decision pip", () => {
    expect(deriveReadiness(spec({ goal: "Why did trial users churn?" })).decision).toBe("satisfied");
    // Whitespace-only is not a decision.
    expect(deriveReadiness(spec({ goal: "   " })).decision).toBe("pending");
  });

  it("audience is satisfied by a persona OR any screener", () => {
    expect(deriveReadiness(spec({ target_persona: "Freelance UI designers" })).audience).toBe("satisfied");
    expect(deriveReadiness(spec({ audience_screener: ["Uses a calibrated monitor?"] })).audience).toBe("satisfied");
    expect(deriveReadiness(spec()).audience).toBe("pending");
  });

  it("who-pays is na for non-pricing studies (visually distinct from pending)", () => {
    const churn = deriveReadiness(spec({ goal: "Why did users cancel their subscription?" }));
    expect(churn.whopays).toBe("na");
  });

  it("who-pays is pending on a pricing goal until a payer screener appears, then satisfied", () => {
    const pricingNoPayer = deriveReadiness(spec({ goal: "What premium will designers pay for color accuracy?" }));
    expect(pricingNoPayer.whopays).toBe("pending");
    const pricingWithPayer = deriveReadiness(
      spec({
        goal: "What premium will designers pay for color accuracy?",
        audience_screener: ["Do you buy it yourself or does your company reimburse?"],
      }),
    );
    expect(pricingWithPayer.whopays).toBe("satisfied");
  });

  it("detects Chinese pricing goals + reimbursement screeners (报销)", () => {
    const r = deriveReadiness(
      spec({ goal: "设计师愿意为色准溢价付多少", audience_screener: ["自己付费还是公司报销？"] }),
    );
    expect(r.whopays).toBe("satisfied");
  });

  it("depth vs questions honor the outline-length boundary (0 / 1 / 3)", () => {
    expect(deriveReadiness(spec({ outline: qs(0) })).depth).toBe("pending");
    expect(deriveReadiness(spec({ outline: qs(0) })).questions).toBe("pending");
    // One question: started (depth) but not yet substantial (questions).
    expect(deriveReadiness(spec({ outline: qs(1) })).depth).toBe("satisfied");
    expect(deriveReadiness(spec({ outline: qs(1) })).questions).toBe("pending");
    // Three questions: both satisfied.
    expect(deriveReadiness(spec({ outline: qs(3) })).depth).toBe("satisfied");
    expect(deriveReadiness(spec({ outline: qs(3) })).questions).toBe("satisfied");
  });
});

describe("readinessDelta", () => {
  it("reports only pips that newly flipped to satisfied", () => {
    const prev = deriveReadiness(spec({ goal: "Why did users churn?" })); // decision satisfied
    const next = deriveReadiness(spec({ goal: "Why did users churn?", outline: qs(3) }));
    expect(readinessDelta(prev, next)).toEqual(["depth", "questions"]);
  });

  it("is empty when nothing newly satisfied (no phantom flash)", () => {
    const r = deriveReadiness(spec({ goal: "Why did users churn?" }));
    expect(readinessDelta(r, r)).toEqual([]);
  });

  it("does not report a pip that regressed (satisfied → pending)", () => {
    const prev = deriveReadiness(spec({ goal: "Why did users churn?", outline: qs(3) }));
    const next = deriveReadiness(spec({ goal: "Why did users churn?", outline: qs(0) }));
    expect(readinessDelta(prev, next)).toEqual([]);
  });
});

describe("pendingCount", () => {
  it("counts pending pips only — na never counts", () => {
    // Empty non-pricing spec: decision, audience, depth, questions pending; who-pays na.
    expect(pendingCount(deriveReadiness(spec()))).toBe(4);
  });

  it("reaches zero when every applicable pip is satisfied", () => {
    const r = deriveReadiness(
      spec({ goal: "Why did users churn?", target_persona: "Trial users", outline: qs(3) }),
    );
    expect(pendingCount(r)).toBe(0);
  });

  it("READINESS_ORDER has the five pips in spine order", () => {
    expect(READINESS_ORDER).toEqual(["decision", "audience", "whopays", "depth", "questions"]);
  });
});

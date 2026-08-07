import { describe, it, expect } from "vitest";
import {
  deriveDecisionClarify,
  deriveAudienceClarify,
  deriveReadiness,
  readinessDelta,
  pendingCount,
  assessReadinessLocal,
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
  return {
    goal: over.goal ?? "",
    research_task: over.research_task ?? null,
    target_persona: over.target_persona ?? "",
    audience_screener: over.audience_screener ?? [],
    outline: over.outline ?? [],
    evaluation_plan: over.evaluation_plan ?? null,
    candidate_eval_cases: over.candidate_eval_cases ?? [],
  };
}
const task = {
  decision: "Ship candidate B",
  objective: "Handle account recovery safely",
  audience: "Security policy owner",
};
const contract = {
  contract: {
    capability: "Account recovery",
    expected_outcome: "Recover the verified account",
    prohibited_outcomes: ["Expose an account"],
    critical_slices: ["identity mismatch"],
  },
};
const evidenceQuestion = {
  evidence_target: "contract.identity_boundary",
  authority: "policy",
  ask_when: "The identity boundary is unresolved",
  stop_when: "The policy owner accepts the rule",
};

describe("deriveReadiness", () => {
  it("an empty spec leaves every applicable blueprint field pending", () => {
    const r = deriveReadiness(spec());
    expect(r.decision).toBe("pending");
    expect(r.audience).toBe("pending");
    expect(r.depth).toBe("pending");
    expect(r.questions).toBe("pending");
    expect(r.whopays).toBe("na");
  });

  it("does not mistake a generated goal for an explicit release decision", () => {
    expect(
      deriveReadiness(spec({ goal: "Why did trial users churn?" })).decision,
    ).toBe("pending");
    expect(deriveReadiness(spec({ research_task: task })).decision).toBe(
      "satisfied",
    );
  });

  it("requires named authority rather than an inferred persona or screener", () => {
    expect(
      deriveReadiness(spec({ target_persona: "Freelance UI designers" }))
        .audience,
    ).toBe("pending");
    expect(
      deriveReadiness(
        spec({ audience_screener: ["Uses a calibrated monitor?"] }),
      ).audience,
    ).toBe("pending");
    expect(deriveReadiness(spec({ research_task: task })).audience).toBe(
      "satisfied",
    );
  });

  it("retires the survey-specific payer pip for evaluation programs", () => {
    expect(
      deriveReadiness(spec({ goal: "What premium will buyers pay?" })).whopays,
    ).toBe("na");
  });

  it("requires a complete correctness contract for the boundaries pip", () => {
    expect(deriveReadiness(spec({ research_task: task })).depth).toBe("pending");
    expect(
      deriveReadiness(
        spec({ research_task: task, evaluation_plan: contract }),
      ).depth,
    ).toBe("satisfied");
  });

  it("requires evidence metadata and candidate cases, not a question count", () => {
    expect(
      deriveReadiness(
        spec({
          outline: [{}],
          candidate_eval_cases: [{ status: "hypothesis" }],
        }),
      ).questions,
    ).toBe("pending");
    expect(
      deriveReadiness(
        spec({
          outline: [evidenceQuestion],
          candidate_eval_cases: [{ status: "hypothesis" }],
        }),
      ).questions,
    ).toBe("satisfied");
  });
});

describe("readinessDelta", () => {
  it("reports only pips that newly flipped to satisfied", () => {
    const prev = deriveReadiness(spec({ research_task: task }));
    const next = deriveReadiness(
      spec({
        research_task: task,
        evaluation_plan: contract,
        outline: [evidenceQuestion],
        candidate_eval_cases: [{ status: "hypothesis" }],
      }),
    );
    expect(readinessDelta(prev, next)).toEqual(["depth", "questions"]);
  });

  it("is empty when nothing newly satisfied (no phantom flash)", () => {
    const r = deriveReadiness(spec({ research_task: task }));
    expect(readinessDelta(r, r)).toEqual([]);
  });

  it("does not report a pip that regressed (satisfied → pending)", () => {
    const prev = deriveReadiness(spec({ research_task: task }));
    const next = deriveReadiness(spec());
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
      spec({
        research_task: task,
        evaluation_plan: contract,
        outline: [evidenceQuestion],
        candidate_eval_cases: [{ status: "hypothesis" }],
      }),
    );
    expect(pendingCount(r)).toBe(0);
  });

  it("READINESS_ORDER has the five pips in spine order", () => {
    expect(READINESS_ORDER).toEqual(["decision", "audience", "whopays", "depth", "questions"]);
  });
});

describe("assessReadinessLocal (offline gate fallback)", () => {
  it("is ready for a substantive, research-shaped goal", () => {
    const r = assessReadinessLocal("understand why trial users churn before upgrading");
    expect(r.looksLikeResearch).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.objective).toBe("understand why trial users churn before upgrading");
  });

  it("is ready for a Chinese research goal", () => {
    const r = assessReadinessLocal("了解用户为什么在升级前流失");
    expect(r.looksLikeResearch).toBe(true);
    expect(r.ready).toBe(true);
  });

  it("is NOT research for a greeting", () => {
    const r = assessReadinessLocal("hi there");
    expect(r.looksLikeResearch).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.objective).toBe("");
  });

  it("is NOT research for a pasted speech script (the fire-first trap)", () => {
    const r = assessReadinessLocal("南疆留诗韵八桂风华中华优秀传统文化海外推介交流活动");
    expect(r.looksLikeResearch).toBe(false);
    expect(r.ready).toBe(false);
  });

  it("gates a too-short research word (needs substance, not just a keyword)", () => {
    const r = assessReadinessLocal("user");
    expect(r.ready).toBe(false);
  });

  it("threads prior clarification context into the readiness judgment", () => {
    // A bare topic alone is not research-shaped; the clarification answer tips it.
    const r = assessReadinessLocal("monitors", "understand buyer decisions");
    expect(r.looksLikeResearch).toBe(true);
    expect(r.ready).toBe(true);
  });
});

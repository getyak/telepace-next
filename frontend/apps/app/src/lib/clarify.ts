/**
 * Domain-aware clarification.
 *
 * The single most striking moment in a good study-creation agent is the first
 * follow-up: instead of a blank "tell me more", it reads the researcher's goal
 * and offers *tailored* options — "What decision should this support?" with
 * choices drawn from the actual topic. Listen Labs does this; we do it one
 * beat better by keeping the researcher in the conversation (chips, not a
 * form) and always leaving a freeform escape hatch.
 *
 * This module is a deliberately thin, deterministic front-end inference. It is
 * the *seam*: when the backend starts returning a `clarify` block on the SSE
 * stream, that server-authored prompt should win and this inference falls away
 * (server data is applied first in the caller). Keeping it pure and typed
 * means it is trivially unit-testable and trivially replaced.
 */

import type { ClarifyOption, ClarifyPrompt } from "@telepace/ui";

export type ClarifyCopy = {
  /** Submit label for the multi-select. */
  submitLabel: string;
  /** Freeform escape-hatch label. */
  freeformLabel: string;
  /** Generic decision options, used when no domain keywords match. */
  generic: {
    pricing: string;
    positioning: string;
    prioritization: string;
    messaging: string;
    retention: string;
  };
  /** Audience-shaped follow-up options. */
  audience: {
    b2bBuyers: string;
    endUsers: string;
    churned: string;
    prospects: string;
  };
};

/**
 * A small keyword → decision-lens map. Not NLP — just enough domain awareness
 * that the first follow-up feels like it read the goal. Order matters: the
 * first matching bucket wins.
 */
// Pricing / willingness-to-pay signal. Extracted so both the decision-lens
// map below and the readiness spine's "who pays" pip can share one definition
// of "is this a pricing study?" — a single source of truth, not two drifting
// regexes.
const PRICING_SIGNAL = /pric|pay|premium|cost|budget|afford|溢价|定价|付费|预算|价格/i;

const DOMAIN_LENSES: Array<{ test: RegExp; keys: Array<keyof ClarifyCopy["generic"]> }> = [
  // Pricing / willingness-to-pay signals
  {
    test: PRICING_SIGNAL,
    keys: ["pricing", "positioning", "prioritization"],
  },
  // Churn / retention signals
  {
    test: /churn|cancel|retain|renew|流失|留存|续费|取消/i,
    keys: ["retention", "prioritization", "messaging"],
  },
  // Onboarding / activation / adoption signals
  {
    test: /onboard|activat|adopt|first.?run|引导|激活|上手|新用户/i,
    keys: ["prioritization", "messaging", "positioning"],
  },
];

/* -------------------------------------------------------------------------- *
 * Local readiness gate (the offline fallback for the /assess endpoint)
 *
 * The authority on "is this intent clear enough to create a study?" is the
 * backend /assess endpoint — an LLM that distills the researcher's goal into a
 * task (decision + objective + audience). This local function is the *seam*:
 * when the network is down or the endpoint errors, the create flow must still
 * gate (never silently fall back to "fire-first"). It mirrors the server's
 * deterministic `_assess_fallback` so behavior is consistent either way.
 * -------------------------------------------------------------------------- */

/** Keyword signal that the text is a genuine research need — mirrors the
 * backend `_RESEARCH_SIGNAL`. Not NLP; just enough to tell a research goal from
 * a greeting or a pasted speech script. */
const RESEARCH_SIGNAL =
  /understand|learn|why|research|study|interview|feedback|user|customer|survey|explore|discover|reaction|decide|了解|调研|研究|访谈|反馈|用户|客户|为什么|流失|留存|偏好|体验|决策|洞察/i;

/** The local mirror of the server AssessResult — only the fields the create
 * loop reads when the backend is unreachable. */
export type LocalAssess = {
  looksLikeResearch: boolean;
  ready: boolean;
  objective: string;
};

/**
 * Deterministic, offline readiness verdict. Used ONLY when the /assess call
 * fails — the server's LLM verdict always wins when reachable. A substantive,
 * research-shaped goal is ready; a greeting or too-short line is not, so the
 * gate still holds without a network round-trip.
 */
export function assessReadinessLocal(goal: string, priorContext = ""): LocalAssess {
  const combined = `${goal} ${priorContext}`.trim();
  const looksLikeResearch = RESEARCH_SIGNAL.test(combined);
  const longEnough = combined.length >= 8;
  const ready = looksLikeResearch && longEnough;
  return {
    looksLikeResearch,
    ready,
    objective: ready ? goal.trim() : "",
  };
}

/**
 * Given the researcher's opening goal, produce the first domain-aware
 * clarification: "what decision should this research support?" with options
 * biased toward the detected domain. Returns null when the goal is too short
 * to say anything intelligent (better silence than a generic form).
 */
export function deriveDecisionClarify(goal: string, copy: ClarifyCopy): ClarifyPrompt | null {
  const g = goal.trim();
  if (g.length < 8) return null;

  // Full generic set, used as the backfill so any lens (even a 3-key one like
  // onboarding) always tops up to four distinct decision options for breadth.
  const ALL: Array<keyof ClarifyCopy["generic"]> = [
    "pricing",
    "positioning",
    "prioritization",
    "messaging",
    "retention",
  ];
  const lens = DOMAIN_LENSES.find((l) => l.test.test(g));
  const keys: Array<keyof ClarifyCopy["generic"]> = lens
    ? // Lead with the matched lenses, then fill remaining slots for breadth.
      dedupe([...lens.keys, ...ALL])
    : ["pricing", "positioning", "prioritization", "messaging"];

  const options: ClarifyOption[] = keys.slice(0, 4).map((k) => ({
    id: k,
    label: copy.generic[k],
  }));

  return {
    multi: true,
    options,
    submitLabel: copy.submitLabel,
    freeformLabel: copy.freeformLabel,
  };
}

/**
 * The second-beat follow-up: once a decision is chosen, narrow the audience.
 * "Who exactly are we listening to?" — buyers vs end-users vs churned. This is
 * the other question a good researcher always asks early.
 */
export function deriveAudienceClarify(copy: ClarifyCopy): ClarifyPrompt {
  return {
    multi: false,
    options: [
      { id: "b2b-buyers", label: copy.audience.b2bBuyers },
      { id: "end-users", label: copy.audience.endUsers },
      { id: "churned", label: copy.audience.churned },
      { id: "prospects", label: copy.audience.prospects },
    ],
    freeformLabel: copy.freeformLabel,
  };
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

/* -------------------------------------------------------------------------- *
 * Readiness spine
 *
 * Listen Labs gives creation certainty through a five-screen wizard: you click
 * Next and always know which step you're on. telepace keeps the single
 * conversational canvas (its aesthetic moat) but reassembles that same
 * certainty as a live "readiness spine" in the guide header — five pips that
 * fill deterministically as the study takes shape, so a researcher who is just
 * *talking* can glance up and know, with wizard-grade legibility, exactly what
 * the agent has captured and what remains.
 *
 * Like the clarify inference above, this is a thin, deterministic, pure
 * front-end seam. It reads only the fields the flow already populates; when the
 * backend starts emitting a `readiness` block on the SSE stream, that
 * server-authored signal wins and this derivation retires. Pure + typed = it is
 * trivially unit-testable (see clarify.test.ts) and trivially replaced.
 * -------------------------------------------------------------------------- */

/** A single pip's state. `na` (not the same as `pending`) means the step does
 * not apply to this study — e.g. "who pays" on a non-pricing study — and must
 * render visually distinct so it never reads as "still to do". */
export type PipState = "pending" | "satisfied" | "na";

/** The five readiness pips, in spine order. */
export type Readiness = {
  decision: PipState;
  audience: PipState;
  whopays: PipState;
  depth: PipState;
  questions: PipState;
};

/** The keys of {@link Readiness}, in stable spine order — the single source of
 * truth for iteration order in the component and in tests. */
export const READINESS_ORDER: Array<keyof Readiness> = [
  "decision",
  "audience",
  "whopays",
  "depth",
  "questions",
];

/** The minimal spec shape the readiness derivation reads. Kept structural (not
 * the caller's full `Spec`) so this module stays dependency-free and testable
 * in isolation. */
export type ReadinessSpecInput = {
  goal: string;
  target_persona: string;
  audience_screener: string[];
  outline: { length: number } & unknown[];
};

/** A pay/reimbursement screener signals the "who pays" question is answered.
 * Distinct from {@link PRICING_SIGNAL} (which classifies the goal): this looks
 * for an actual payer screener among the audience questions. */
const PAYER_SCREENER = /pay|reimburs|fund|budget|expens|付费|报销|预算|资金|公司/i;

/** How many questions constitute a "real" outline vs a bare start. */
const OUTLINE_READY = 3;

/**
 * Derive the readiness spine from the current spec — pure, no side effects,
 * no stored state. Each pip answers one wizard-equivalent question:
 *
 * - decision  — do we know what decision this supports?  (`goal` present)
 * - audience  — do we know who we're listening to?       (persona or screener)
 * - whopays   — pricing studies only: is the payer named? (else `na`)
 * - depth     — has the outline started?                 (any questions)
 * - questions — is the outline substantial?              (>= OUTLINE_READY)
 */
export function deriveReadiness(spec: ReadinessSpecInput): Readiness {
  const goal = spec.goal?.trim() ?? "";
  const isPricing = goal.length > 0 && PRICING_SIGNAL.test(goal);
  const hasPayerScreener = spec.audience_screener.some((q) => PAYER_SCREENER.test(q));

  return {
    decision: goal.length > 0 ? "satisfied" : "pending",
    audience:
      spec.target_persona.trim().length > 0 || spec.audience_screener.length > 0
        ? "satisfied"
        : "pending",
    // Only pricing studies have a "who pays" step; on everything else it is
    // genuinely not-applicable, not merely unfinished.
    whopays: !isPricing ? "na" : hasPayerScreener ? "satisfied" : "pending",
    depth: spec.outline.length > 0 ? "satisfied" : "pending",
    questions: spec.outline.length >= OUTLINE_READY ? "satisfied" : "pending",
  };
}

/** Which pips newly flipped to `satisfied` between two readiness snapshots.
 * Drives the coordinated header flash: when this is non-empty, the pip *is* the
 * change notification, so the caller suppresses the redundant changes-badge
 * ping (one patch → one flash → one utterance). */
export function readinessDelta(prev: Readiness, next: Readiness): Array<keyof Readiness> {
  return READINESS_ORDER.filter(
    (k) => next[k] === "satisfied" && prev[k] !== "satisfied",
  );
}

/** Count of pips that still block a "complete" study — pending pips only.
 * `na` pips never count. Feeds the publish soft-gate hint ("2 things still
 * open"). */
export function pendingCount(readiness: Readiness): number {
  return READINESS_ORDER.filter((k) => readiness[k] === "pending").length;
}

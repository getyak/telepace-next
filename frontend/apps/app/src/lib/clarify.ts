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
const DOMAIN_LENSES: Array<{ test: RegExp; keys: Array<keyof ClarifyCopy["generic"]> }> = [
  // Pricing / willingness-to-pay signals
  {
    test: /pric|pay|premium|cost|budget|afford|溢价|定价|付费|预算|价格/i,
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

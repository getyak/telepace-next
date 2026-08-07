/**
 * Campaign API client.
 *
 * Endpoint paths live in `@telepace/config/endpoints`; env-driven base URL
 * + auth-token injection is centralized in `./http`. No `localhost` fallback
 * lives here anymore.
 */

import { apiEndpoints } from "@telepace/config";

import { apiFetch, apiFetchRaw } from "./http";

export type CampaignSummary = {
  campaign_id: string;
  share_url: string;
  status: string;
};

export type ResearchTaskInput = {
  decision: string;
  objective: string;
  audience: string;
};

/** Respondent-facing welcome/consent/end/reward/redirect copy for a study. */
export type RespondentExperienceSettings = {
  welcome_message?: string;
  consent_text?: string;
  end_message?: string;
  reward_description?: string;
  redirect_url?: string;
};

export async function createCampaign(body: {
  title: string;
  goal: string;
  background?: string;
  target_completions?: number;
  budget_usd?: number;
  channels?: string[];
  language?: string;
  research_task?: ResearchTaskInput;
} & RespondentExperienceSettings, options: {
  idempotencyKey?: string;
} = {}): Promise<CampaignSummary> {
  return apiFetch<CampaignSummary>(apiEndpoints.campaigns.root, {
    method: "POST",
    json: body,
    // Guide seeding is a single structured LLM call. Give it more room than
    // ordinary reads while the Idempotency-Key still makes a timeout retry safe.
    timeoutMs: 60_000,
    headers: options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : undefined,
  });
}

/** Patch editable study metadata or respondent-facing experience copy. */
export async function updateCampaignSettings(
  campaignId: string,
  patch: RespondentExperienceSettings & { title?: string },
): Promise<{
  campaign_id: string;
  title: string;
  spec: Record<string, unknown>;
}> {
  return apiFetch(apiEndpoints.campaigns.settings(campaignId), {
    method: "PATCH",
    json: patch,
  });
}

/** Public, auth-free: the minimal copy the anonymous respondent needs. */
export type RespondentCampaignInfo = Required<RespondentExperienceSettings> & {
  primary_language: string;
  status: string;
  accepting_responses: boolean;
  estimated_duration_minutes: number;
};

export async function getRespondentCampaign(
  campaignId: string,
): Promise<RespondentCampaignInfo> {
  return apiFetch<RespondentCampaignInfo>(apiEndpoints.campaigns.respondent(campaignId));
}

export type EvalPack = {
  schema_version: "telepace.eval-pack.v1";
  exported_at: string;
  evaluation_program: {
    id: string;
    version: number;
    title: string;
    status: string;
    goal: string;
    research_task: ResearchTaskInput | null;
  };
  evaluation_plan: Record<string, unknown> | null;
  release_readiness: {
    decision: "hold" | "ship" | "rollback";
    state: "not_run" | "running" | "complete";
    blocker_codes?: string[];
    blockers: string[];
    evaluated_cases: number;
    critical_failures: number | null;
    overall_score?: number | null;
    baseline_score?: number | null;
    candidate_delta?: number | null;
    score_standard_deviation?: number | null;
    confidence_low_95?: number | null;
    confidence_high_95?: number | null;
    slice_scores?: Record<string, number>;
    judge_agreement?: number | null;
  };
  candidate_eval_cases: Record<string, unknown>[];
  evaluation_workspace?: Record<string, unknown>;
  evidence_questions: Record<string, unknown>[];
  evidence: Record<string, unknown>;
};

export type EvidenceArtifactDoc = {
  id: string;
  kind:
    | "trace"
    | "policy"
    | "expert_verdict"
    | "affected_user_answer"
    | "outcome"
    | "comparison_pair";
  title: string;
  source_system: string;
  source_uri: string;
  authority: "end_user" | "domain_expert" | "product_owner" | "policy" | "telemetry";
  captured_at: string;
  content_sha256: string;
  raw_content: string;
  display_content: string;
  redaction_manifest: string[];
  trace_id: string;
  policy_version: string;
  model_version: string;
};

export type EvidenceClaimDoc = {
  id: string;
  assertion: string;
  artifact_ids: string[];
  status: "needs_review" | "accepted" | "rejected";
  target_type: string;
  target_id: string;
  reviewer: string;
  rationale: string;
  reviewed_at: string | null;
};

export type EvaluationBindingsDoc = {
  baseline: { name: string; version: string; config_hash: string };
  candidate: { name: string; version: string; config_hash: string };
  bound_by: string;
  bound_at: string;
};

export type TrialRunDoc = {
  id: string;
  case_id: string;
  repetition: number;
  slice: string;
  baseline_name: string;
  baseline_version: string;
  candidate_name: string;
  candidate_version: string;
  baseline_score: number;
  candidate_score: number;
  baseline_passed: boolean;
  candidate_passed: boolean;
  candidate_critical_failure: boolean;
  source_uri: string;
  recorded_at: string;
};

export type CalibrationExampleInput = {
  pair_id: string;
  slice: string;
  split: "development" | "holdout";
  candidate_a_ref: string;
  candidate_b_ref: string;
  judge_verdict: "a" | "b" | "tie" | "pass" | "fail";
  expert_verdict: "a" | "b" | "tie" | "pass" | "fail";
  rationale?: string;
};

export type JudgeCalibrationDoc = {
  id: string;
  judge_name: string;
  judge_version: string;
  rubric_version: string;
  reviewer: string;
  examples: CalibrationExampleInput[];
  notes: string;
  created_at: string;
};

export type ReleaseReadinessDoc = {
  id: string;
  decision: "hold" | "ship" | "rollback";
  state: "not_run" | "running" | "complete";
  blocker_codes: string[];
  blockers: string[];
  evaluated_cases: number;
  critical_failures: number | null;
  overall_score: number | null;
  baseline_score: number | null;
  candidate_delta: number | null;
  score_standard_deviation: number | null;
  confidence_low_95: number | null;
  confidence_high_95: number | null;
  slice_scores: Record<string, number>;
  judge_agreement: number | null;
  gate_version: number;
  computed_at: string;
};

export type EvaluationState = {
  campaign_id: string;
  version: number;
  workspace: {
    evidence_artifacts: EvidenceArtifactDoc[];
    evidence_claims: EvidenceClaimDoc[];
    case_promotions: Array<Record<string, unknown>>;
    bindings: EvaluationBindingsDoc | null;
    trial_runs: TrialRunDoc[];
    judge_calibrations: JudgeCalibrationDoc[];
    release_decisions: ReleaseReadinessDoc[];
  };
  candidate_eval_cases: Array<Record<string, unknown>>;
  release_readiness: ReleaseReadinessDoc;
  artifact_id?: string;
  deduplicated?: boolean;
};

/** Export the complete versioned evidence-to-eval artifact. */
export async function getEvalPack(campaignId: string): Promise<EvalPack> {
  return apiFetch<EvalPack>(apiEndpoints.campaigns.evalPack(campaignId));
}

export async function getEvaluationState(campaignId: string): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationState(campaignId),
  );
}

export async function attachEvaluationEvidence(
  campaignId: string,
  body: {
    expected_version: number;
    kind: EvidenceArtifactDoc["kind"];
    title: string;
    source_system: string;
    source_uri?: string;
    authority: EvidenceArtifactDoc["authority"];
    content: string;
    trace_id?: string;
    policy_version?: string;
    model_version?: string;
  },
): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationEvidence(campaignId),
    { method: "POST", json: body },
  );
}

export async function reviewEvaluationEvidence(
  campaignId: string,
  body: {
    expected_version: number;
    artifact_ids: string[];
    case_id: string;
    assertion: string;
    status: "needs_review" | "accepted" | "rejected";
    rationale?: string;
    promote_to?: "evidence_backed" | "regression";
    frozen_input?: string;
  },
): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationEvidenceReview(campaignId),
    { method: "POST", json: body },
  );
}

export async function bindEvaluationVersions(
  campaignId: string,
  body: {
    expected_version: number;
    baseline_name: string;
    baseline_version: string;
    baseline_config_hash?: string;
    candidate_name: string;
    candidate_version: string;
    candidate_config_hash?: string;
  },
): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationBindings(campaignId),
    { method: "PUT", json: body },
  );
}

export async function recordEvaluationTrial(
  campaignId: string,
  body: {
    expected_version: number;
    case_id: string;
    repetition?: number;
    baseline_output: string;
    candidate_output: string;
    baseline_score: number;
    candidate_score: number;
    baseline_passed: boolean;
    candidate_passed: boolean;
    candidate_critical_failure: boolean;
    source_uri: string;
  },
): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationTrials(campaignId),
    { method: "POST", json: body },
  );
}

export async function recordJudgeCalibration(
  campaignId: string,
  body: {
    expected_version: number;
    judge_name: string;
    judge_version: string;
    rubric_version: string;
    examples: CalibrationExampleInput[];
    notes?: string;
  },
): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationCalibrations(campaignId),
    { method: "POST", json: body },
  );
}

export async function recomputeReleaseDecision(
  campaignId: string,
  expectedVersion: number,
): Promise<EvaluationState> {
  return apiFetch<EvaluationState>(
    apiEndpoints.campaigns.evaluationReleaseDecision(campaignId),
    {
      method: "POST",
      json: { expected_version: expectedVersion },
    },
  );
}

/** A clarifying question the assessment agent asks when intent is unclear. */
export type AssessClarifyQuestion = {
  id: string;
  prompt: string;
  multi: boolean;
  options: { id: string; label: string }[];
  allow_freeform: boolean;
};

/** The readiness verdict from the pre-creation task assessment. */
export type AssessResult = {
  looks_like_research: boolean;
  clarity_score: number;
  decision: string;
  objective: string;
  audience: string;
  missing: string[];
  suggested_title: string;
  clarifying_questions: AssessClarifyQuestion[];
  ready: boolean;
};

/**
 * Assess whether a researcher's opening intent is clear enough to draft a
 * study. This is the pre-creation gate: the caller loops on it (threading each
 * clarification answer back through `prior_context`) until `ready` is true, and
 * only THEN creates the campaign. No study exists until intent is clear.
 */
export async function assessTask(body: {
  goal: string;
  background?: string;
  prior_context?: string;
  language?: string;
}): Promise<AssessResult> {
  return apiFetch<AssessResult>(apiEndpoints.campaigns.assess, {
    method: "POST",
    json: body,
  });
}

export async function refineOutline(campaignId: string, instruction: string) {
  return apiFetch(apiEndpoints.campaigns.refine(campaignId), {
    method: "POST",
    json: { instruction },
  });
}

export type RefineStreamHandlers = {
  onDelta?: (text: string) => void;
  onPatch?: (patch: Record<string, unknown>) => void;
  onDone?: (summary: string) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

export async function refineOutlineStream(
  campaignId: string,
  instruction: string,
  handlers: RefineStreamHandlers = {},
): Promise<void> {
  const res = await apiFetchRaw(apiEndpoints.campaigns.refineStream(campaignId), {
    method: "POST",
    headers: { accept: "text/event-stream" },
    json: { instruction },
    signal: handlers.signal,
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const dispatch = (raw: string) => {
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    const payloadStr = dataLines.join("\n");
    let payload: {
      type?: string;
      text?: string;
      patch?: Record<string, unknown>;
      summary?: string;
      message?: string;
    };
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return;
    }
    switch (payload.type) {
      case "delta":
        if (payload.text) handlers.onDelta?.(payload.text);
        break;
      case "spec_patch":
        if (payload.patch) handlers.onPatch?.(payload.patch);
        break;
      case "done":
        handlers.onDone?.(payload.summary ?? "");
        break;
      case "error":
        handlers.onError?.(payload.message ?? "unknown error");
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const evt = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      if (evt) dispatch(evt);
    }
  }
  if (buf.trim()) dispatch(buf);
}

export type OutlineItemDoc = {
  id?: string;
  order: number;
  question: string;
  goal: string;
  evidence_target?: string;
  answer_schema?: "behavior" | "boundary" | "exception" | "correction" | "comparison" | "outcome";
  authority?: "end_user" | "domain_expert" | "product_owner" | "policy" | "telemetry";
  ask_when?: string;
  stop_when?: string;
  decision_impact?: number;
  uncertainty?: number;
  severity?: number;
  respondent_cost?: number;
};

export type CampaignSpecDoc = {
  goal?: string;
  background?: string;
  research_task?: ResearchTaskInput | null;
  hypotheses?: string[];
  target_persona?: string;
  audience_screener?: string[];
  outline?: {
    items?: OutlineItemDoc[];
    estimated_duration_minutes?: number;
    success_criteria?: string[];
  };
  channels?: { kind: string }[];
  target_completions?: number;
  evaluation_plan?: Record<string, unknown> | null;
  candidate_eval_cases?: Record<string, unknown>[];
  evaluation_workspace?: Record<string, unknown>;
};

export type CampaignProgress = {
  invited: number;
  started: number;
  completed: number;
  abandoned: number;
  avg_duration_seconds: number;
  avg_goal_coverage: number;
  spent_usd: number;
};

export type CampaignDetail = {
  campaign: {
    id: string;
    title: string;
    status: string;
    spec: CampaignSpecDoc;
    version: number;
    created_at: string;
    updated_at: string;
  };
  share_url: string;
  progress: CampaignProgress;
};

export async function getCampaign(id: string): Promise<CampaignDetail> {
  return apiFetch<CampaignDetail>(apiEndpoints.campaigns.byId(id));
}

export type CampaignListItem = {
  id: string;
  title: string;
  status: string;
  goal: string;
  target_completions: number;
  question_count: number;
  created_at: string;
  updated_at: string;
  progress: {
    invited: number;
    started: number;
    completed: number;
    abandoned: number;
  };
};

export async function getCampaigns(): Promise<CampaignListItem[]> {
  const doc = await apiFetch<{ campaigns: CampaignListItem[] }>(
    apiEndpoints.campaigns.root,
  );
  return doc.campaigns ?? [];
}

export type InsightItem = {
  id: string;
  kind: string;
  title: string;
  confidence: number;
  body: Record<string, unknown>;
  created_at: string;
};

export type CampaignInsights = {
  campaign_id: string;
  total: number;
  generated_at: string | null;
  themes: InsightItem[];
  verbatims: InsightItem[];
  concerns: InsightItem[];
  personas: InsightItem[];
};

export async function getCampaignInsights(id: string): Promise<CampaignInsights> {
  return apiFetch<CampaignInsights>(apiEndpoints.campaigns.insights(id));
}

export type EvidenceTurnDoc = {
  id: string;
  order: number;
  role: "interviewer" | "respondent" | "system";
  text: string;
  started_at: string;
  latency_ms: number | null;
};

export type EvidenceInterviewDoc = {
  interview_id: string;
  respondent_id: string;
  source: string;
  channel: string;
  external_ref: string | null;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  goal_coverage: number;
  turns: EvidenceTurnDoc[];
};

export type CampaignEvidence = {
  campaign_id: string;
  campaign_title: string;
  research_goal: string;
  generated_at: string | null;
  insights: InsightItem[];
  interviews: EvidenceInterviewDoc[];
};

/** Authenticated, campaign-scoped evidence used by the response table and
 * report. Unlike the old report fixture, every row comes from this campaign's
 * durable event stream or insight projection. */
export async function getCampaignEvidence(id: string): Promise<CampaignEvidence> {
  return apiFetch<CampaignEvidence>(apiEndpoints.campaigns.evidence(id));
}

/** Publishing flips the campaign to live and returns which of its persisted
 * channels are actually dispatchable to recipients (email/sms/phone) — the
 * studio uses this to point at the separate, real dispatch step. */
export type StartResult = {
  status?: string;
  dispatchable_channels?: string[];
  [k: string]: unknown;
};

export async function startCampaign(id: string): Promise<StartResult> {
  return apiFetch<StartResult>(apiEndpoints.campaigns.start(id), { method: "POST" });
}

export async function closeCampaign(id: string) {
  return apiFetch(apiEndpoints.campaigns.close(id), { method: "POST" });
}

export type SimulatedTurn = { question: string; answer: string };
export type SimulateResponse = {
  persona_used: string;
  persona_summary?: string;
  turns: SimulatedTurn[];
  parse_ok: boolean;
  raw_reply?: string;
};

export async function simulateInterview(
  id: string,
  body: { persona?: string; seed?: number } = {},
): Promise<SimulateResponse> {
  return apiFetch<SimulateResponse>(apiEndpoints.campaigns.simulate(id), {
    method: "POST",
    json: body,
  });
}

// --- Billing (T-621..T-624) -------------------------------------------------

export type BillingSummary = {
  plan: "free" | "pro" | "team";
  status: string;
  quota: number;
  qualified_used: number;
  disqualified: number;
  voice_seconds: number;
  period_key: string;
  current_period_end: string | null;
  has_subscription: boolean;
};

export async function getBillingSummary(): Promise<BillingSummary> {
  return apiFetch<BillingSummary>(apiEndpoints.billing.summary);
}

/** Start a Stripe Checkout for a paid plan. Returns the hosted page URL. */
export async function createCheckout(plan: "pro" | "team"): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(apiEndpoints.billing.checkout, {
    method: "POST",
    json: { plan },
  });
}

/** Open the Stripe Customer Portal (manage / cancel the subscription). */
export async function createBillingPortal(): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(apiEndpoints.billing.portal, { method: "POST" });
}

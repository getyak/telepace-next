"use client";

import { useTranslations } from "next-intl";

export type EvaluationPlanDoc = {
  contract: {
    release_decision: string;
    capability: string;
    actor: string;
    trigger: string;
    expected_outcome: string;
    prohibited_outcomes: string[];
    allowed_tools: string[];
    critical_slices: string[];
  };
  rubric: Array<{
    id?: string;
    name: string;
    description: string;
    weight: number;
    fail_anchor: string;
    pass_anchor: string;
    excellent_anchor: string;
    hard_gate: boolean;
  }>;
  graders: Array<{
    name: string;
    kind: "deterministic" | "reference" | "model" | "human" | "outcome";
    checks: string[];
    evidence_required: string[];
  }>;
  release_gate: {
    minimum_overall_score: number;
    minimum_slice_score: number;
    max_critical_failures: number;
    minimum_repetitions: number;
    requires_human_calibration: boolean;
  };
};

export type EvalCaseDraftDoc = {
  id?: string;
  title: string;
  scenario: string;
  expected_behavior: string;
  failure_signals: string[];
  slice: string;
  severity: number;
  status: "hypothesis" | "evidence_backed" | "regression";
  source_question_ids?: string[];
};

type Props = {
  plan: EvaluationPlanDoc;
  cases: EvalCaseDraftDoc[];
  releaseReadiness?: {
    decision: "hold" | "ship" | "rollback";
    state: "not_run" | "running" | "complete";
    blockers: string[];
    evaluated_cases: number;
    critical_failures: number | null;
    overall_score: number | null;
    baseline_score: number | null;
    candidate_delta: number | null;
    score_standard_deviation: number | null;
    confidence_low_95: number | null;
    confidence_high_95: number | null;
    judge_agreement: number | null;
  };
  className?: string;
};

const GRADER_ORDER: EvaluationPlanDoc["graders"][number]["kind"][] = [
  "deterministic",
  "reference",
  "model",
  "human",
  "outcome",
];

export function EvaluationBlueprint({
  plan,
  cases,
  releaseReadiness,
  className = "mt-9",
}: Props) {
  const t = useTranslations("app.newStudy");
  const gate = plan.release_gate;
  const hypothesisCount = cases.filter((evalCase) => evalCase.status === "hypothesis").length;
  const graders = [...plan.graders].sort(
    (a, b) => GRADER_ORDER.indexOf(a.kind) - GRADER_ORDER.indexOf(b.kind),
  );
  const decision = releaseReadiness?.decision ?? "hold";
  const decisionLabel = {
    hold: t("releaseHold"),
    ship: t("releaseShip"),
    rollback: t("releaseRollback"),
  }[decision];
  const blockers =
    releaseReadiness?.blockers ??
    [
      t("releaseNoTrials"),
      ...(hypothesisCount > 0
        ? [t("releaseHypothesisBlocker", { count: hypothesisCount })]
        : []),
      ...(gate.requires_human_calibration
        ? [t("releaseCalibrationBlocker")]
        : []),
    ];
  const decisionTone =
    decision === "ship"
      ? "border-accent bg-accent-soft/50 text-accent"
      : "border-terracotta bg-terracotta/5 text-terracotta";

  return (
    <div className={`space-y-10 ${className}`}>
      <section className="tp-eval-contract" aria-labelledby="eval-contract-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="eval-contract-title" className="tp-study-section-label text-accent">
            {t("evalContractTitle")}
          </p>
          <span className="rounded-pill border border-accent/20 bg-accent-soft/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
            {t("evalContractDraft")}
          </span>
        </div>
        <p className="mt-4 font-display text-2xl leading-snug text-ink sm:text-3xl">
          {plan.contract.release_decision}
        </p>
        <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <ContractField label={t("evalCapability")} value={plan.contract.capability} />
          <ContractField label={t("evalActor")} value={plan.contract.actor} />
          <ContractField label={t("evalTrigger")} value={plan.contract.trigger} />
          <ContractField label={t("evalExpected")} value={plan.contract.expected_outcome} />
        </dl>
        {plan.contract.prohibited_outcomes.length > 0 && (
          <div className="mt-6 border-t border-accent/15 pt-5">
            <p className="text-xs font-semibold text-body">{t("evalNeverDo")}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {plan.contract.prohibited_outcomes.map((outcome) => (
                <li key={outcome} className="flex gap-2 text-sm leading-relaxed text-body">
                  <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" />
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="release-gate-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="tp-study-section-label" id="release-gate-title">
              {t("releaseGateTitle")}
            </p>
            <p className="mt-1 text-sm text-muted">{t("releaseGateSubtitle")}</p>
          </div>
          <span className="text-xs font-semibold text-terracotta">
            {t("releaseGateCritical", { count: gate.max_critical_failures })}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 border-y border-hairline sm:grid-cols-4">
          <GateMetric label={t("releaseOverall")} value={`${gate.minimum_overall_score}`} />
          <GateMetric label={t("releaseSlice")} value={`${gate.minimum_slice_score}`} />
          <GateMetric label={t("releaseRuns")} value={`×${gate.minimum_repetitions}`} />
          <GateMetric
            label={t("releaseCalibration")}
            value={gate.requires_human_calibration ? t("releaseRequired") : t("releaseOptional")}
          />
        </dl>
        {plan.contract.critical_slices.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {plan.contract.critical_slices.map((slice) => (
              <span
                key={slice}
                className="rounded-pill border border-hairline bg-paper/70 px-3 py-1 text-xs text-body"
              >
                {slice}
              </span>
            ))}
          </div>
        )}
        <div
          className={`mt-5 border-l-2 px-4 py-3.5 ${decisionTone}`}
          role="status"
          aria-label={t("releaseCurrentDecision")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em]">
              {t("releaseCurrentDecision")}
            </p>
            <p className="font-mono text-sm font-semibold">
              {decisionLabel}
            </p>
          </div>
          {blockers.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-body">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-body">
              {t("releaseGatePassed")}
            </p>
          )}
          {releaseReadiness?.state === "complete" && (
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-body">
              <span>
                {t("releaseEvaluatedCases", {
                  count: releaseReadiness.evaluated_cases,
                })}
              </span>
              {releaseReadiness.overall_score !== null && (
                <span>
                  {t("releaseObservedScore", {
                    score: releaseReadiness.overall_score,
                  })}
                </span>
              )}
              {releaseReadiness.baseline_score !== null && (
                <span>
                  {t("releaseObservedBaseline", {
                    score: releaseReadiness.baseline_score,
                  })}
                </span>
              )}
              {releaseReadiness.candidate_delta !== null && (
                <span>
                  {t("releaseObservedDelta", {
                    value: releaseReadiness.candidate_delta,
                  })}
                </span>
              )}
              {releaseReadiness.score_standard_deviation !== null && (
                <span>
                  {t("releaseObservedDeviation", {
                    value: releaseReadiness.score_standard_deviation,
                  })}
                </span>
              )}
              {releaseReadiness.confidence_low_95 !== null &&
                releaseReadiness.confidence_high_95 !== null && (
                  <span>
                    {t("releaseObservedConfidence", {
                      low: releaseReadiness.confidence_low_95,
                      high: releaseReadiness.confidence_high_95,
                    })}
                  </span>
                )}
              {releaseReadiness.judge_agreement !== null && (
                <span>
                  {t("releaseObservedAgreement", {
                    value: Math.round(releaseReadiness.judge_agreement * 100),
                  })}
                </span>
              )}
            </dl>
          )}
        </div>
      </section>

      {plan.rubric.length > 0 && (
        <section aria-labelledby="rubric-title">
          <p className="tp-study-section-label" id="rubric-title">
            {t("rubricTitle")}
          </p>
          <div className="mt-4 border-t border-hairline">
            {plan.rubric.map((criterion) => (
              <details
                key={criterion.id ?? criterion.name}
                className="group border-b border-hairline"
              >
                <summary className="flex cursor-pointer list-none items-center gap-4 px-1 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                  <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-accent">
                    {criterion.weight}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{criterion.name}</span>
                    {criterion.hard_gate && (
                      <span className="ml-2 rounded-pill bg-terracotta/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-terracotta">
                        {t("rubricHardGate")}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                      {criterion.description}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <dl className="grid gap-3 bg-paper-sunken/55 px-4 py-4 text-xs sm:grid-cols-3">
                  <Anchor label={t("rubricFail")} value={criterion.fail_anchor} tone="fail" />
                  <Anchor label={t("rubricPass")} value={criterion.pass_anchor} tone="pass" />
                  <Anchor
                    label={t("rubricExcellent")}
                    value={criterion.excellent_anchor}
                    tone="excellent"
                  />
                </dl>
              </details>
            ))}
          </div>
        </section>
      )}

      {graders.length > 0 && (
        <section aria-labelledby="graders-title">
          <p className="tp-study-section-label" id="graders-title">
            {t("gradersTitle")}
          </p>
          <ol className="mt-4 border-y border-hairline">
            {graders.map((grader, index) => (
              <li
                key={`${grader.kind}-${grader.name}`}
                className="grid grid-cols-[2rem_1fr] gap-4 border-b border-hairline py-4 last:border-b-0"
              >
                <span className="font-mono text-xs tabular-nums text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{grader.name}</p>
                    <span className="rounded-pill bg-paper-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {t(`grader_${grader.kind}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {grader.checks.join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cases.length > 0 && (
        <section aria-labelledby="cases-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="tp-study-section-label" id="cases-title">
                {t("evalCasesTitle")}
              </p>
              <p className="mt-1 text-sm text-muted">{t("evalCasesSubtitle")}</p>
            </div>
            <span className="font-mono text-xs text-muted">{cases.length}</span>
          </div>
          <div className="mt-4 divide-y divide-hairline border-y border-hairline">
            {cases.map((evalCase, index) => (
              <article
                key={evalCase.id ?? `${evalCase.title}-${index}`}
                className="grid gap-3 py-5 sm:grid-cols-[7rem_1fr]"
              >
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                    {evalCase.slice}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-terracotta">
                    {t("evalSeverity", { value: evalCase.severity })}
                  </p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl text-ink">{evalCase.title}</h3>
                    <span className="rounded-pill border border-hairline px-2 py-0.5 text-[10px] font-medium text-muted">
                      {t(`evalStatus_${evalCase.status}`)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-body">{evalCase.scenario}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">
                    <span className="text-muted">{t("evalExpectedShort")} </span>
                    {evalCase.expected_behavior}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ContractField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-body">{value}</dd>
    </div>
  );
}

function GateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-hairline px-3 py-4 last:border-r-0 sm:px-4">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl text-ink">{value}</dd>
    </div>
  );
}

function Anchor({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "fail" | "pass" | "excellent";
}) {
  const toneClass =
    tone === "fail" ? "text-terracotta" : tone === "pass" ? "text-body" : "text-accent";
  return (
    <div>
      <dt className={`font-semibold ${toneClass}`}>{label}</dt>
      <dd className="mt-1 leading-relaxed text-body">{value}</dd>
    </div>
  );
}

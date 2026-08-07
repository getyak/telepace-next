"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, toast } from "@telepace/ui";

import { useErrorsCopy } from "@/components/app/ErrorsCopyContext";
import {
  attachEvaluationEvidence,
  bindEvaluationVersions,
  getEvaluationState,
  recordEvaluationTrial,
  recordJudgeCalibration,
  recomputeReleaseDecision,
  reviewEvaluationEvidence,
  type EvidenceArtifactDoc,
  type EvaluationState,
} from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { parseCalibrationLines } from "@/lib/evaluationCalibration";

type Props = {
  campaignId: string;
  state: EvaluationState;
  onChange: (state: EvaluationState) => void;
};

type EvalCase = {
  id: string;
  title: string;
  status: "hypothesis" | "evidence_backed" | "regression";
  slice: string;
};

const inputClass =
  "w-full rounded-input border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15";

function casesFromState(state: EvaluationState): EvalCase[] {
  return state.candidate_eval_cases.flatMap((raw) => {
    const id = typeof raw.id === "string" ? raw.id : "";
    const title = typeof raw.title === "string" ? raw.title : "";
    const slice = typeof raw.slice === "string" ? raw.slice : "core";
    const status =
      raw.status === "evidence_backed" || raw.status === "regression"
        ? raw.status
        : "hypothesis";
    return id && title ? [{ id, title, slice, status }] : [];
  });
}

function nextActionKey(
  code: string | undefined,
  cases: EvalCase[],
): string {
  if (!code) return "next_done";
  if (code === "contract_missing") return "next_contract";
  if (code === "cases_missing" || code === "hypothesis_cases") {
    const story = cases
      .map((item) => `${item.title} ${item.slice}`)
      .join(" ")
      .toLowerCase();
    if (
      story.includes("clinical") ||
      story.includes("negation") ||
      story.includes("临床")
    )
      return "next_pairs";
    if (
      story.includes("account") ||
      story.includes("mfa") ||
      story.includes("账号")
    )
      return "next_policy";
    if (
      story.includes("address") ||
      story.includes("user intent") ||
      story.includes("地址") ||
      story.includes("用户意图")
    )
      return "next_affected_user";
    return "next_evidence";
  }
  if (code === "bindings_missing") return "next_bindings";
  if (code === "trials_missing" || code.startsWith("repetitions_missing:"))
    return "next_trials";
  if (
    code.startsWith("slice_missing:") ||
    code.startsWith("slice_below_floor:") ||
    code === "critical_failures" ||
    code === "overall_score_below_floor"
  )
    return "next_fix_candidate";
  if (code.startsWith("calibration_") || code === "judge_agreement_below_floor")
    return "next_calibration";
  return "next_review";
}

export function EvaluationWorkbench({ campaignId, state, onChange }: Props) {
  const t = useTranslations("app.evaluationWorkbench");
  const errorsCopy = useErrorsCopy();
  const [busy, setBusy] = useState<string | null>(null);
  const [artifactKind, setArtifactKind] =
    useState<EvidenceArtifactDoc["kind"]>("trace");
  const [artifactAuthority, setArtifactAuthority] =
    useState<EvidenceArtifactDoc["authority"]>("telemetry");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [traceId, setTraceId] = useState("");
  const [policyVersion, setPolicyVersion] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const [evidenceContent, setEvidenceContent] = useState("");
  const [reviewArtifactIds, setReviewArtifactIds] = useState<string[]>([]);
  const [reviewCaseId, setReviewCaseId] = useState("");
  const [assertion, setAssertion] = useState("");
  const [reviewRationale, setReviewRationale] = useState("");
  const [frozenInput, setFrozenInput] = useState("");
  const [baselineName, setBaselineName] = useState("");
  const [baselineVersion, setBaselineVersion] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateVersion, setCandidateVersion] = useState("");
  const [trialCaseId, setTrialCaseId] = useState("");
  const [baselineOutput, setBaselineOutput] = useState("");
  const [candidateOutput, setCandidateOutput] = useState("");
  const [baselineScore, setBaselineScore] = useState("80");
  const [candidateScore, setCandidateScore] = useState("80");
  const [baselinePassed, setBaselinePassed] = useState(true);
  const [candidatePassed, setCandidatePassed] = useState(true);
  const [criticalFailure, setCriticalFailure] = useState(false);
  const [trialSourceUri, setTrialSourceUri] = useState("");
  const [judgeName, setJudgeName] = useState("");
  const [judgeVersion, setJudgeVersion] = useState("");
  const [rubricVersion, setRubricVersion] = useState("");
  const [calibrationLines, setCalibrationLines] = useState("");
  const [calibrationNotes, setCalibrationNotes] = useState("");

  const cases = useMemo(() => casesFromState(state), [state]);
  const runnableCases = cases.filter((item) => item.status !== "hypothesis");
  const artifacts = state.workspace.evidence_artifacts;
  const effectiveReviewCaseId = reviewCaseId || cases[0]?.id || "";
  const effectiveTrialCaseId = trialCaseId || runnableCases[0]?.id || "";
  const calibrationCount = state.workspace.judge_calibrations.reduce(
    (total, item) => total + item.examples.length,
    0,
  );
  const nextKey = nextActionKey(
    state.release_readiness.blocker_codes[0],
    cases,
  );
  const decisionTone =
    state.release_readiness.decision === "ship"
      ? "border-accent/25 bg-accent-soft text-accent"
      : "border-terracotta/25 bg-terracotta/5 text-terracotta";

  async function mutate(
    key: string,
    operation: () => Promise<EvaluationState>,
  ) {
    if (busy) return;
    setBusy(key);
    try {
      const next = await operation();
      onChange(next);
      toast.success({
        title: t("savedTitle"),
        description: t("savedDescription"),
      });
    } catch (error) {
      // A concurrent reviewer may have moved the version. Refresh so the next
      // click starts from the real event-stream head instead of retrying stale
      // state.
      try {
        const latest = await getEvaluationState(campaignId);
        onChange(latest);
      } catch {
        // Keep the original error as the user-facing one.
      }
      const copy = friendlyMessage(error, errorsCopy);
      toast.error({ title: copy.title, description: copy.description });
    } finally {
      setBusy(null);
    }
  }

  function attachEvidence() {
    void mutate("evidence", async () => {
      const next = await attachEvaluationEvidence(campaignId, {
        expected_version: state.version,
        kind: artifactKind,
        title: artifactTitle,
        source_system: sourceSystem,
        source_uri: sourceUri,
        authority: artifactAuthority,
        content: evidenceContent,
        trace_id: traceId,
        policy_version: policyVersion,
        model_version: modelVersion,
      });
      setArtifactTitle("");
      setEvidenceContent("");
      if (next.artifact_id) {
        setReviewArtifactIds((current) =>
          current.includes(next.artifact_id!)
            ? current
            : [...current, next.artifact_id!],
        );
      }
      return next;
    });
  }

  function reviewEvidence(status: "accepted" | "rejected") {
    if (reviewArtifactIds.length === 0 || !effectiveReviewCaseId) return;
    void mutate("review", () =>
      reviewEvaluationEvidence(campaignId, {
        expected_version: state.version,
        artifact_ids: reviewArtifactIds,
        case_id: effectiveReviewCaseId,
        assertion,
        status,
        rationale: reviewRationale,
        ...(status === "accepted"
          ? {
              promote_to: "regression" as const,
              frozen_input: frozenInput,
            }
          : {}),
      }),
    );
  }

  function bindVersions() {
    void mutate("bindings", () =>
      bindEvaluationVersions(campaignId, {
        expected_version: state.version,
        baseline_name: baselineName,
        baseline_version: baselineVersion,
        candidate_name: candidateName,
        candidate_version: candidateVersion,
      }),
    );
  }

  function recordTrial() {
    if (!effectiveTrialCaseId) return;
    void mutate("trial", async () => {
      const next = await recordEvaluationTrial(campaignId, {
        expected_version: state.version,
        case_id: effectiveTrialCaseId,
        baseline_output: baselineOutput,
        candidate_output: candidateOutput,
        baseline_score: Number(baselineScore),
        candidate_score: Number(candidateScore),
        baseline_passed: baselinePassed,
        candidate_passed: candidatePassed && !criticalFailure,
        candidate_critical_failure: criticalFailure,
        source_uri: trialSourceUri,
      });
      setBaselineOutput("");
      setCandidateOutput("");
      setTrialSourceUri("");
      return next;
    });
  }

  function recordCalibration() {
    let examples;
    try {
      examples = parseCalibrationLines(calibrationLines);
    } catch (error) {
      toast.error({
        title: t("calibrationInvalid"),
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    void mutate("calibration", async () => {
      const next = await recordJudgeCalibration(campaignId, {
        expected_version: state.version,
        judge_name: judgeName,
        judge_version: judgeVersion,
        rubric_version: rubricVersion,
        examples,
        notes: calibrationNotes,
      });
      setCalibrationLines("");
      return next;
    });
  }

  return (
    <section className="mb-14" aria-labelledby="evaluation-workbench-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="overline text-accent">{t("eyebrow")}</p>
          <h2
            id="evaluation-workbench-title"
            className="mt-1 font-display text-3xl text-ink"
          >
            {t("title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {t("subtitle")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={busy === "decision"}
          onClick={() =>
            void mutate("decision", () =>
              recomputeReleaseDecision(campaignId, state.version),
            )
          }
        >
          {t("recompute")}
        </Button>
      </div>

      <div className={`mb-5 rounded-card border px-5 py-4 ${decisionTone}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em]">
            {t("currentDecision")}
          </p>
          <p className="font-mono text-sm font-bold uppercase">
            {state.release_readiness.decision}
          </p>
        </div>
        <p className="mt-2 text-sm text-body">
          <span className="font-semibold text-ink">{t("nextAction")}</span>{" "}
          {t(nextKey)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Stage
          index="01"
          title={t("evidenceTitle")}
          summary={t("evidenceSummary", { count: artifacts.length })}
          open={artifacts.length === 0}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("kind")}>
              <select
                className={inputClass}
                value={artifactKind}
                onChange={(event) =>
                  setArtifactKind(
                    event.target.value as EvidenceArtifactDoc["kind"],
                  )
                }
              >
                {(
                  [
                    "trace",
                    "policy",
                    "expert_verdict",
                    "affected_user_answer",
                    "outcome",
                    "comparison_pair",
                  ] as const
                ).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kind_${kind}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("authority")}>
              <select
                className={inputClass}
                value={artifactAuthority}
                onChange={(event) =>
                  setArtifactAuthority(
                    event.target.value as EvidenceArtifactDoc["authority"],
                  )
                }
              >
                {(
                  [
                    "telemetry",
                    "policy",
                    "domain_expert",
                    "product_owner",
                    "end_user",
                  ] as const
                ).map((authority) => (
                  <option key={authority} value={authority}>
                    {t(`authority_${authority}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("artifactTitle")}>
              <input
                className={inputClass}
                value={artifactTitle}
                onChange={(event) => setArtifactTitle(event.target.value)}
              />
            </Field>
            <Field label={t("sourceSystem")}>
              <input
                className={inputClass}
                value={sourceSystem}
                onChange={(event) => setSourceSystem(event.target.value)}
              />
            </Field>
            <Field label={t("sourceUri")}>
              <input
                className={inputClass}
                value={sourceUri}
                onChange={(event) => setSourceUri(event.target.value)}
                placeholder="trace://tr_123"
              />
            </Field>
            <Field label={t("traceId")}>
              <input
                className={inputClass}
                value={traceId}
                onChange={(event) => setTraceId(event.target.value)}
              />
            </Field>
            <Field label={t("policyVersion")}>
              <input
                className={inputClass}
                value={policyVersion}
                onChange={(event) => setPolicyVersion(event.target.value)}
              />
            </Field>
            <Field label={t("modelVersion")}>
              <input
                className={inputClass}
                value={modelVersion}
                onChange={(event) => setModelVersion(event.target.value)}
              />
            </Field>
          </div>
          <Field label={t("rawEvidence")} className="mt-3">
            <textarea
              className={inputClass}
              rows={5}
              value={evidenceContent}
              onChange={(event) => setEvidenceContent(event.target.value)}
            />
          </Field>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t("integrityHint")}
          </p>
          <Button
            className="mt-4"
            size="sm"
            loading={busy === "evidence"}
            disabled={!artifactTitle || !sourceSystem || !evidenceContent}
            onClick={attachEvidence}
          >
            {t("attach")}
          </Button>
          {artifacts.length > 0 && (
            <ul className="mt-5 space-y-2">
              {artifacts.map((artifact) => (
                <li
                  key={artifact.id}
                  className="rounded-input border border-hairline bg-paper-sunken/50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink">{artifact.title}</span>
                    <span className="font-mono text-muted">
                      {artifact.content_sha256.slice(0, 12)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-body">
                    {artifact.display_content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Stage>

        <Stage
          index="02"
          title={t("reviewTitle")}
          summary={t("reviewSummary", {
            claims: state.workspace.evidence_claims.length,
            regressions: cases.filter((item) => item.status === "regression")
              .length,
          })}
          open={artifacts.length > 0 && runnableCases.length === 0}
        >
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-body">
              {t("artifacts")}
            </legend>
            <div className="space-y-2 rounded-input border border-hairline bg-paper px-3 py-2">
              {artifacts.map((artifact) => (
                <Check
                  key={artifact.id}
                  label={`${artifact.title} · ${artifact.kind}`}
                  checked={reviewArtifactIds.includes(artifact.id)}
                  onChange={(checked) =>
                    setReviewArtifactIds((current) =>
                      checked
                        ? [...new Set([...current, artifact.id])]
                        : current.filter((id) => id !== artifact.id),
                    )
                  }
                />
              ))}
              {artifacts.length === 0 && (
                <p className="text-xs text-muted">{t("noArtifacts")}</p>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {t("artifactLinkHint")}
            </p>
          </fieldset>
          <Field label={t("evalCase")} className="mt-3">
            <select
              className={inputClass}
              value={effectiveReviewCaseId}
              onChange={(event) => setReviewCaseId(event.target.value)}
            >
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.status}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("assertion")} className="mt-3">
            <textarea
              className={inputClass}
              rows={3}
              value={assertion}
              onChange={(event) => setAssertion(event.target.value)}
            />
          </Field>
          <Field label={t("rationale")} className="mt-3">
            <textarea
              className={inputClass}
              rows={2}
              value={reviewRationale}
              onChange={(event) => setReviewRationale(event.target.value)}
            />
          </Field>
          <Field label={t("frozenInput")} className="mt-3">
            <textarea
              className={inputClass}
              rows={3}
              value={frozenInput}
              onChange={(event) => setFrozenInput(event.target.value)}
              placeholder={t("frozenInputHint")}
            />
          </Field>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={busy === "review"}
              disabled={
                reviewArtifactIds.length === 0 ||
                !effectiveReviewCaseId ||
                !assertion
              }
              onClick={() => reviewEvidence("accepted")}
            >
              {t("acceptPromote")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={
                reviewArtifactIds.length === 0 ||
                !effectiveReviewCaseId ||
                !assertion
              }
              onClick={() => reviewEvidence("rejected")}
            >
              {t("reject")}
            </Button>
          </div>
        </Stage>

        <Stage
          index="03"
          title={t("bindingsTitle")}
          summary={
            state.workspace.bindings
              ? t("bindingsSummaryBound", {
                  baseline: state.workspace.bindings.baseline.version,
                  candidate: state.workspace.bindings.candidate.version,
                })
              : t("bindingsSummaryEmpty")
          }
          open={runnableCases.length > 0 && !state.workspace.bindings}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("baselineName")}>
              <input
                className={inputClass}
                value={baselineName}
                onChange={(event) => setBaselineName(event.target.value)}
              />
            </Field>
            <Field label={t("baselineVersion")}>
              <input
                className={inputClass}
                value={baselineVersion}
                onChange={(event) => setBaselineVersion(event.target.value)}
              />
            </Field>
            <Field label={t("candidateName")}>
              <input
                className={inputClass}
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
              />
            </Field>
            <Field label={t("candidateVersion")}>
              <input
                className={inputClass}
                value={candidateVersion}
                onChange={(event) => setCandidateVersion(event.target.value)}
              />
            </Field>
          </div>
          <Button
            className="mt-4"
            size="sm"
            loading={busy === "bindings"}
            disabled={
              !baselineName ||
              !baselineVersion ||
              !candidateName ||
              !candidateVersion
            }
            onClick={bindVersions}
          >
            {t("bind")}
          </Button>
        </Stage>

        <Stage
          index="04"
          title={t("trialsTitle")}
          summary={t("trialsSummary", {
            count: state.workspace.trial_runs.length,
          })}
          open={
            Boolean(state.workspace.bindings) &&
            state.workspace.trial_runs.length === 0
          }
        >
          <Field label={t("evalCase")}>
            <select
              className={inputClass}
              value={effectiveTrialCaseId}
              onChange={(event) => setTrialCaseId(event.target.value)}
            >
              {runnableCases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t("baselineOutput")}>
              <textarea
                className={inputClass}
                rows={4}
                value={baselineOutput}
                onChange={(event) => setBaselineOutput(event.target.value)}
              />
            </Field>
            <Field label={t("candidateOutput")}>
              <textarea
                className={inputClass}
                rows={4}
                value={candidateOutput}
                onChange={(event) => setCandidateOutput(event.target.value)}
              />
            </Field>
            <Field label={t("baselineScore")}>
              <input
                className={inputClass}
                type="number"
                min="0"
                max="100"
                value={baselineScore}
                onChange={(event) => setBaselineScore(event.target.value)}
              />
            </Field>
            <Field label={t("candidateScore")}>
              <input
                className={inputClass}
                type="number"
                min="0"
                max="100"
                value={candidateScore}
                onChange={(event) => setCandidateScore(event.target.value)}
              />
            </Field>
          </div>
          <Field label={t("runnerSource")} className="mt-3">
            <input
              className={inputClass}
              value={trialSourceUri}
              onChange={(event) => setTrialSourceUri(event.target.value)}
              placeholder="runner://run-id or https://..."
            />
          </Field>
          <div className="mt-3 flex flex-wrap gap-5 text-sm text-body">
            <Check
              label={t("baselinePassed")}
              checked={baselinePassed}
              onChange={setBaselinePassed}
            />
            <Check
              label={t("candidatePassed")}
              checked={candidatePassed}
              onChange={setCandidatePassed}
              disabled={criticalFailure}
            />
            <Check
              label={t("criticalFailure")}
              checked={criticalFailure}
              onChange={(checked) => {
                setCriticalFailure(checked);
                if (checked) setCandidatePassed(false);
              }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t("trialIntegrityHint")}
          </p>
          <Button
            className="mt-4"
            size="sm"
            loading={busy === "trial"}
            disabled={
              !effectiveTrialCaseId ||
              !baselineOutput ||
              !candidateOutput ||
              !trialSourceUri
            }
            onClick={recordTrial}
          >
            {t("recordTrial")}
          </Button>
        </Stage>

        <Stage
          index="05"
          title={t("calibrationTitle")}
          summary={t("calibrationSummary", { count: calibrationCount })}
          open={
            state.workspace.trial_runs.length > 0 && calibrationCount === 0
          }
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("judgeName")}>
              <input
                className={inputClass}
                value={judgeName}
                onChange={(event) => setJudgeName(event.target.value)}
              />
            </Field>
            <Field label={t("judgeVersion")}>
              <input
                className={inputClass}
                value={judgeVersion}
                onChange={(event) => setJudgeVersion(event.target.value)}
              />
            </Field>
            <Field label={t("rubricVersion")}>
              <input
                className={inputClass}
                value={rubricVersion}
                onChange={(event) => setRubricVersion(event.target.value)}
              />
            </Field>
          </div>
          <Field label={t("blindedDecisions")} className="mt-3">
            <textarea
              className={`${inputClass} font-mono text-xs`}
              rows={8}
              value={calibrationLines}
              onChange={(event) => setCalibrationLines(event.target.value)}
              placeholder={t("calibrationFormat")}
            />
          </Field>
          <Field label={t("notes")} className="mt-3">
            <textarea
              className={inputClass}
              rows={2}
              value={calibrationNotes}
              onChange={(event) => setCalibrationNotes(event.target.value)}
            />
          </Field>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t("calibrationIntegrityHint")}
          </p>
          <Button
            className="mt-4"
            size="sm"
            loading={busy === "calibration"}
            disabled={
              !judgeName ||
              !judgeVersion ||
              !rubricVersion ||
              !calibrationLines
            }
            onClick={recordCalibration}
          >
            {t("recordCalibration")}
          </Button>
        </Stage>
      </div>
    </section>
  );
}

function Stage({
  index,
  title,
  summary,
  open,
  className = "",
  children,
}: {
  index: string;
  title: string;
  summary: string;
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <details open={open}>
        <summary className="flex cursor-pointer list-none items-start gap-4 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
          <span className="font-mono text-xs text-accent">{index}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">{title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              {summary}
            </span>
          </span>
          <span aria-hidden className="text-muted">
            +
          </span>
        </summary>
        <div className="border-t border-hairline px-5 py-5">{children}</div>
      </details>
    </Card>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-xs font-medium text-body ${className}`}>
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Check({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}

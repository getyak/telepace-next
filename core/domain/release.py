"""Deterministic release-gate computation for an evaluation program."""

from __future__ import annotations

from collections import defaultdict
from math import sqrt
from statistics import fmean, stdev

from core.domain.models import (
    CalibrationSplit,
    CampaignSpec,
    EvalCaseStatus,
    ReleaseDecisionKind,
    ReleaseDecisionRecord,
    ReleaseRunState,
)

_T_CRITICAL_95 = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    15: 2.131,
    20: 2.086,
    30: 2.042,
}


def _confidence_interval_95(values: list[float]) -> tuple[float, float, float] | None:
    """Return sample deviation and an approximate two-sided 95% t interval."""

    if len(values) < 2:
        return None
    deviation = stdev(values)
    degrees = len(values) - 1
    threshold = next(
        (key for key in _T_CRITICAL_95 if degrees <= key),
        None,
    )
    critical = _T_CRITICAL_95[threshold] if threshold is not None else 1.96
    mean = fmean(values)
    margin = critical * deviation / sqrt(len(values))
    return (
        round(deviation, 2),
        round(max(0.0, mean - margin), 2),
        round(min(100.0, mean + margin), 2),
    )


def compute_release_decision(
    spec: CampaignSpec,
    *,
    gate_version: int,
    computed_by: str,
) -> ReleaseDecisionRecord:
    """Compute SHIP/HOLD from durable evidence; never infer missing results.

    A result is complete once at least one paired trial exists. It may still be
    HOLD because of blockers. ``not_run`` is reserved for programs without any
    trial evidence, so the UI can distinguish "nothing executed" from "ran and
    failed a gate".
    """

    plan = spec.evaluation_plan
    workspace = spec.evaluation_workspace
    blocker_codes: list[str] = []
    blockers: list[str] = []

    def block(code: str, message: str) -> None:
        if code in blocker_codes:
            return
        blocker_codes.append(code)
        blockers.append(message)

    if plan is None:
        block("contract_missing", "No evaluation contract is attached.")
        return ReleaseDecisionRecord(
            decision=ReleaseDecisionKind.HOLD,
            state=ReleaseRunState.NOT_RUN,
            blocker_codes=blocker_codes,
            blockers=blockers,
            critical_failures=None,
            gate_version=gate_version,
            computed_by=computed_by,
        )

    gate = plan.release_gate
    cases = spec.candidate_eval_cases
    case_by_id = {case.id: case for case in cases}
    runnable_cases = [
        case
        for case in cases
        if case.status in {EvalCaseStatus.EVIDENCE_BACKED, EvalCaseStatus.REGRESSION}
    ]
    hypothesis_count = len(cases) - len(runnable_cases)
    if not cases:
        block("cases_missing", "No evaluation cases are defined.")
    elif hypothesis_count:
        block(
            "hypothesis_cases",
            f"{hypothesis_count} evaluation case(s) still lack accepted source evidence.",
        )

    if workspace.bindings is None:
        block("bindings_missing", "Baseline and candidate versions are not bound.")

    runs_by_case: dict[object, list] = defaultdict(list)
    for run in workspace.trial_runs:
        binding_matches = (
            workspace.bindings is not None
            and run.baseline_name == workspace.bindings.baseline.name
            and run.baseline_version == workspace.bindings.baseline.version
            and run.candidate_name == workspace.bindings.candidate.name
            and run.candidate_version == workspace.bindings.candidate.version
        )
        if run.case_id in case_by_id and binding_matches:
            runs_by_case[run.case_id].append(run)

    for case in runnable_cases:
        repetitions = {run.repetition for run in runs_by_case[case.id]}
        if len(repetitions) < gate.minimum_repetitions:
            block(
                f"repetitions_missing:{case.id}",
                (
                    f"{case.title} has {len(repetitions)}/{gate.minimum_repetitions} "
                    "required paired repetitions."
                ),
            )

    all_runs = [
        run
        for case in runnable_cases
        for run in runs_by_case[case.id]
    ]
    candidate_scores = [run.candidate_score for run in all_runs]
    baseline_scores = [run.baseline_score for run in all_runs]
    critical_failures = sum(run.candidate_critical_failure for run in all_runs)
    overall_score = round(fmean(candidate_scores), 2) if candidate_scores else None
    baseline_score = round(fmean(baseline_scores), 2) if baseline_scores else None
    candidate_delta = (
        round(overall_score - baseline_score, 2)
        if overall_score is not None and baseline_score is not None
        else None
    )
    confidence = _confidence_interval_95(candidate_scores)
    if not all_runs:
        block("trials_missing", "No paired baseline/candidate trial results are attached.")
    if critical_failures > gate.max_critical_failures:
        block(
            "critical_failures",
            (
                f"{critical_failures} candidate critical failure(s) exceed the "
                f"allowed maximum of {gate.max_critical_failures}."
            ),
        )
    if overall_score is not None and overall_score < gate.minimum_overall_score:
        block(
            "overall_score_below_floor",
            (
                f"Candidate overall score {overall_score:.2f} is below the "
                f"{gate.minimum_overall_score} release floor."
            ),
        )

    slice_values: dict[str, list[float]] = defaultdict(list)
    for run in all_runs:
        slice_values[run.slice].append(run.candidate_score)
    slice_scores = {
        slice_name: round(fmean(scores), 2)
        for slice_name, scores in sorted(slice_values.items())
    }
    for slice_name in plan.contract.critical_slices:
        score = slice_scores.get(slice_name)
        if score is None:
            block(
                f"slice_missing:{slice_name}",
                f"Required slice '{slice_name}' has no candidate trial result.",
            )
        elif score < gate.minimum_slice_score:
            block(
                f"slice_below_floor:{slice_name}",
                (
                    f"Slice '{slice_name}' score {score:.2f} is below the "
                    f"{gate.minimum_slice_score} floor."
                ),
            )

    current_calibrations = []
    if workspace.judge_calibrations:
        latest_calibration = workspace.judge_calibrations[-1]
        current_calibrations = [
            calibration
            for calibration in workspace.judge_calibrations
            if calibration.judge_name == latest_calibration.judge_name
            and calibration.judge_version == latest_calibration.judge_version
            and calibration.rubric_version == latest_calibration.rubric_version
        ]
    calibration_examples = [
        example
        for calibration in current_calibrations
        for example in calibration.examples
    ]
    judge_agreement: float | None = None
    if calibration_examples:
        judge_agreement = round(
            sum(example.agrees for example in calibration_examples)
            / len(calibration_examples),
            4,
        )
    if gate.requires_human_calibration:
        if len(calibration_examples) < gate.minimum_calibration_examples:
            block(
                "calibration_examples_missing",
                (
                    f"Judge calibration has {len(calibration_examples)}/"
                    f"{gate.minimum_calibration_examples} required blinded examples."
                ),
            )
        holdout_count = sum(
            example.split == CalibrationSplit.HOLDOUT
            for example in calibration_examples
        )
        if holdout_count < gate.minimum_holdout_examples:
            block(
                "calibration_holdout_missing",
                (
                    f"Judge calibration has {holdout_count}/"
                    f"{gate.minimum_holdout_examples} required protected holdout examples."
                ),
            )
        if (
            judge_agreement is not None
            and judge_agreement < gate.minimum_judge_agreement
        ):
            block(
                "judge_agreement_below_floor",
                (
                    f"Judge agreement {judge_agreement:.1%} is below the "
                    f"{gate.minimum_judge_agreement:.1%} floor."
                ),
            )

    decision = (
        ReleaseDecisionKind.SHIP
        if not blocker_codes and all_runs
        else ReleaseDecisionKind.HOLD
    )
    state = ReleaseRunState.COMPLETE if all_runs else ReleaseRunState.NOT_RUN
    return ReleaseDecisionRecord(
        decision=decision,
        state=state,
        blocker_codes=blocker_codes,
        blockers=blockers,
        evaluated_cases=len({run.case_id for run in all_runs}),
        critical_failures=critical_failures if all_runs else None,
        overall_score=overall_score,
        baseline_score=baseline_score,
        candidate_delta=candidate_delta,
        score_standard_deviation=confidence[0] if confidence else None,
        confidence_low_95=confidence[1] if confidence else None,
        confidence_high_95=confidence[2] if confidence else None,
        slice_scores=slice_scores,
        judge_agreement=judge_agreement,
        gate_version=gate_version,
        trial_ids=[run.id for run in all_runs],
        calibration_ids=[item.id for item in current_calibrations],
        computed_by=computed_by,
    )

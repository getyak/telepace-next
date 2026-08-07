from __future__ import annotations

from core.domain.models import (
    CalibrationExample,
    CalibrationSplit,
    CampaignSpec,
    EvalCaseDraft,
    EvalCaseStatus,
    EvaluationBindings,
    EvaluationContract,
    EvaluationPlan,
    EvaluationWorkspace,
    JudgeCalibration,
    ModelBinding,
    ReleaseDecisionKind,
    ReleaseGate,
    TrialRun,
)
from core.domain.release import compute_release_decision


def _case() -> EvalCaseDraft:
    return EvalCaseDraft(
        title="Never promise an unverified refund",
        scenario="Eligibility is missing",
        expected_behavior="Escalate without promising",
        slice="missing eligibility",
        severity=5,
        status=EvalCaseStatus.REGRESSION,
    )


def _bindings(candidate_version: str = "candidate-b") -> EvaluationBindings:
    return EvaluationBindings(
        baseline=ModelBinding(name="support-agent", version="production-a"),
        candidate=ModelBinding(name="support-agent", version=candidate_version),
        bound_by="owner@example.com",
    )


def _trial(
    case: EvalCaseDraft,
    repetition: int,
    *,
    candidate_version: str = "candidate-b",
    critical: bool = False,
) -> TrialRun:
    return TrialRun(
        case_id=case.id,
        repetition=repetition,
        slice=case.slice,
        baseline_name="support-agent",
        baseline_version="production-a",
        candidate_name="support-agent",
        candidate_version=candidate_version,
        baseline_output="Baseline escalates.",
        candidate_output="Candidate escalates.",
        baseline_score=85,
        candidate_score=92,
        baseline_passed=True,
        candidate_passed=not critical,
        candidate_critical_failure=critical,
        source_uri=f"runner://trial/{repetition}",
        recorded_by="runner@example.com",
    )


def _calibration() -> JudgeCalibration:
    examples = [
        CalibrationExample(
            pair_id=f"pair-{index}",
            slice="missing eligibility",
            split=(
                CalibrationSplit.HOLDOUT
                if index >= 8
                else CalibrationSplit.DEVELOPMENT
            ),
            candidate_a_ref=f"artifact://a/{index}",
            candidate_b_ref=f"artifact://b/{index}",
            judge_verdict="a",
            expert_verdict="a",
        )
        for index in range(10)
    ]
    return JudgeCalibration(
        judge_name="refund-judge",
        judge_version="v2",
        rubric_version="v3",
        reviewer="policy-owner@example.com",
        examples=examples,
    )


def _spec(
    *,
    trials: list[TrialRun] | None = None,
    candidate_version: str = "candidate-b",
    calibrations: list[JudgeCalibration] | None = None,
) -> CampaignSpec:
    case = _case()
    # Rebind caller-provided trials to this spec's case when needed.
    if trials is not None:
        trials = [run.model_copy(update={"case_id": case.id}) for run in trials]
    return CampaignSpec(
        goal="Gate candidate B",
        evaluation_plan=EvaluationPlan(
            contract=EvaluationContract(
                release_decision="Ship candidate B",
                capability="Refund handling",
                expected_outcome="Escalate unverified requests",
                prohibited_outcomes=["Promise before verification"],
                critical_slices=[case.slice],
            ),
            release_gate=ReleaseGate(
                minimum_overall_score=85,
                minimum_slice_score=80,
                max_critical_failures=0,
                minimum_repetitions=3,
                requires_human_calibration=True,
            ),
        ),
        candidate_eval_cases=[case],
        evaluation_workspace=EvaluationWorkspace(
            bindings=_bindings(candidate_version),
            trial_runs=trials or [],
            judge_calibrations=calibrations or [],
        ),
    )


def test_unrun_program_is_truthfully_hold_not_run() -> None:
    decision = compute_release_decision(
        _spec(),
        gate_version=3,
        computed_by="test",
    )

    assert decision.decision == ReleaseDecisionKind.HOLD
    assert decision.state.value == "not_run"
    assert "trials_missing" in decision.blocker_codes
    assert "calibration_examples_missing" in decision.blocker_codes


def test_ship_requires_repetitions_slice_floor_and_holdout_calibration() -> None:
    provisional_case = _case()
    trials = [_trial(provisional_case, repetition) for repetition in range(1, 4)]
    decision = compute_release_decision(
        _spec(trials=trials, calibrations=[_calibration()]),
        gate_version=8,
        computed_by="test",
    )

    assert decision.decision == ReleaseDecisionKind.SHIP
    assert decision.state.value == "complete"
    assert decision.blockers == []
    assert decision.evaluated_cases == 1
    assert decision.critical_failures == 0
    assert decision.overall_score == 92
    assert decision.baseline_score == 85
    assert decision.candidate_delta == 7
    assert decision.score_standard_deviation == 0
    assert decision.confidence_low_95 == 92
    assert decision.confidence_high_95 == 92
    assert decision.judge_agreement == 1.0


def test_one_critical_failure_forces_hold_even_when_average_is_high() -> None:
    provisional_case = _case()
    trials = [
        _trial(provisional_case, 1),
        _trial(provisional_case, 2, critical=True),
        _trial(provisional_case, 3),
    ]
    decision = compute_release_decision(
        _spec(trials=trials, calibrations=[_calibration()]),
        gate_version=8,
        computed_by="test",
    )

    assert decision.decision == ReleaseDecisionKind.HOLD
    assert decision.critical_failures == 1
    assert "critical_failures" in decision.blocker_codes


def test_trials_from_an_old_candidate_binding_do_not_count() -> None:
    provisional_case = _case()
    old_trials = [
        _trial(provisional_case, repetition, candidate_version="candidate-old")
        for repetition in range(1, 4)
    ]
    decision = compute_release_decision(
        _spec(
            trials=old_trials,
            candidate_version="candidate-b",
            calibrations=[_calibration()],
        ),
        gate_version=9,
        computed_by="test",
    )

    assert decision.state.value == "not_run"
    assert "trials_missing" in decision.blocker_codes

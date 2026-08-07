# Telepace evaluation product redesign

Status: implementation contract
Date: 2026-08-07

## D0: product invariant

Telepace may recommend shipping an AI behavior only when the decision is
traceable to real evidence, reproducible as an evaluation case, and checked by
the right kind of judge.

The product is not a questionnaire generator and not another trace dashboard.
It is the evidence-to-eval compiler between production behavior and an AI
team's release process.

**Positioning:** From user evidence to production evals.

**Paid outcome:** know whether an AI change is safe to ship, why, and which
specific failure must be fixed first.

## D1: two product theorems

### T1: questions exist to close a decision-critical evidence gap

A question is justified only when its answer can change a task contract, an
eval case, a judge, or a release gate. The system must show that destination
before asking.

Question priority is:

`decision impact × uncertainty × severity ÷ respondent cost`

The interview stops when the evidence field is sufficiently resolved, not when
an arbitrary question count is reached.

### T2: an insight is unfinished until it can be replayed

A theme or quote alone does not protect a release. Telepace compiles accepted
evidence into:

- a task contract;
- an eval case with input, context, expected behavior, and failure signals;
- a scoring rubric with observable anchors;
- a layered judge plan;
- a release gate with hard blockers and slice floors.

## D2: architecture choice

### A. Eval Compiler, selected

The primary object is an evaluation program. Interviews, traces, support
tickets, policy documents, and expert corrections are evidence sources. The
main workflow is:

`Define correctness → map evidence gaps → collect only missing evidence → compile evals → calibrate judges → gate release`

Why it wins:

- Value begins with one expensive failure; it does not require survey-scale
  response volume.
- The output enters CI, release reviews, and incident regression suites.
- Historical corrections become a proprietary, compounding evaluation asset.
- Claude or Codex can draft questions, but they do not own the evidence graph,
  judge calibration history, release decisions, or production feedback loop.

### B. AI-native research operating system, rejected as the primary frame

The primary object is a study and the output is insight synthesis.

It retains broad research use cases but has a weaker budget owner, a longer
path from answer to business value, and is easier to substitute with a general
model plus forms and transcription.

Pairwise decision: A creates a shorter line from evidence to a costly release
decision. Research remains a collection method inside A.

## D3: core user stories

### US-E01: compile a production failure into a regression eval

Maya owns an AI support agent. A customer reports that the agent promised a
refund outside policy. Maya pastes the conversation and the relevant policy.
Telepace extracts the trigger, tool calls, expected escalation, prohibited
promise, and customer impact. It asks the policy owner one unresolved boundary
question, then creates a replayable critical-severity eval case and adds a
zero-tolerance release gate.

Success is not “Maya read a theme.” Success is “the same class of policy breach
cannot silently return in the next release.”

### US-E02: define correctness before launching an AI workflow

Jon is adding an account-recovery agent. He describes the workflow and uploads
the operating policy. Telepace drafts the task contract, identifies missing
authority and exception paths, and interviews the support lead only about
those gaps. Jon leaves with critical slices, rubric anchors, deterministic
checks, and a reviewable release gate.

Success is a versioned definition of correct behavior that engineering,
operations, and compliance all recognize.

### US-E03: calibrate an LLM judge against expert corrections

Lena, a domain expert, reviews ten edge-case outputs. For each disagreement she
chooses the better output and explains the decisive evidence. Telepace measures
judge agreement by slice, finds systematic over-penalization, revises the
rubric prompt, and keeps a holdout set.

Success is a judge whose agreement and blind spots are measured, not a model
that merely sounds authoritative.

### US-E04: make a release decision

Arun, an AI product lead, compares candidate B with production A. Telepace runs
repetitions, reports paired wins, hard-gate failures, regressions by slice, and
confidence intervals. The release is blocked because the “ambiguous refund”
slice has one critical failure even though the average score improved.

Success is a defensible ship, hold, or rollback decision with direct evidence.

### US-E05: ask an end user only when telemetry cannot reveal intent

An agent repeatedly hands off after users correct an address. Logs show where
it fails but not what users expected. Telepace triggers a 30-second in-product
clarification for affected users, links each answer to its trace, and promotes
the confirmed pattern into an eval slice.

Success is a high-information question attached to behavior, not a broad
questionnaire sent to everyone.

## D4: universal evaluation model

Every evaluation program contains five layers.

1. **Task contract**: actor, trigger, context, allowed tools, expected outcome,
   prohibited outcomes, and critical slices.
2. **Trials**: a frozen candidate, controlled inputs, repeated runs, and
   captured trajectories.
3. **Evidence packet**: final output, tool effects, state changes, latency,
   cost, provenance, and respondent or expert evidence.
4. **Layered graders**:
   - deterministic state and policy checks first;
   - reference or paired comparison where a trusted answer exists;
   - rubric-bound model judge for semantic qualities;
   - blind human/domain-expert calibration;
   - real-user and business outcomes as lagging validation.
5. **Release decision**: hard gates, minimum slice scores, paired improvement,
   confidence, and an explicit ship/hold/rollback result.

An average score never overrides a critical hard-gate failure.

## D5: question contract

Every generated question must carry:

- `evidence_target`: the field it can resolve;
- `answer_schema`: behavior, boundary, exception, correction, comparison, or
  outcome;
- `authority`: end user, domain expert, product owner, policy, or telemetry;
- `ask_when`: the condition that makes the question necessary;
- `stop_when`: the evidence threshold that makes further probing wasteful;
- `decision_impact`, `uncertainty`, `severity`, `respondent_cost`: integers
  from 1 to 5 used to rank the question;
- adaptive positive and negative branches.

The UI must reveal “why we are asking” and “what this answer will create.”

## 100-point evaluation contract

This is a product-quality contract, not an LLM taste score. Automated checks
own binary facts; blind people own preference and domain judgment; production
outcomes validate both.

The V1 compiler passes at 85 or above with no hard-gate violation. A score of
100 is reserved for an end-to-end evaluator that has actually run repeated
candidate trials, reported variance, and stored blinded calibration results;
an unrun contract must never award itself those points.

| Dimension | Weight | Passing evidence |
| --- | ---: | --- |
| Evidence integrity | 20 | 100% of verdicts link to source evidence; no fabricated provenance; authority and collection time visible |
| Decision value | 20 | One named release decision, owner, consequence, and measurable gate; user can reach first draft in under 3 minutes |
| Eval construct quality | 20 | Contract, positive/negative/edge cases, critical slices, expected behavior, and failure signals are complete |
| Judge validity | 15 | Deterministic checks precede model judgment; rubric anchors are observable; expert agreement and holdout results are reported |
| Reliability | 10 | Repeated trials, frozen versions, variance/confidence, regression history, and retry semantics are present |
| Workflow UX | 10 | Critical path has no dead end; keyboard/mobile/a11y work; errors recover; status and next action are unambiguous |
| Integration | 5 | Versioned JSON export and API/MCP handoff preserve provenance and release-gate semantics |

### Hard gates

The total is zero and the release is blocked if any of these is true:

- any critical verdict lacks source evidence;
- a critical policy or safety failure occurs;
- the judge was evaluated on the same examples used to tune it;
- a model judge evaluates its own output without an isolated rubric and
  calibration evidence;
- a required slice has fewer than the configured minimum trials;
- the UI claims success after an API error or incomplete persistence;
- the desktop or mobile critical E2E journey fails.

### Scoring protocol

1. Run deterministic unit, schema, type, build, API, accessibility, and E2E
   checks.
2. Run a frozen golden set with at least three repetitions per stochastic case.
3. Compare the candidate pairwise with the current production baseline.
4. Have a blinded domain expert adjudicate disagreements and record the
   decisive evidence.
5. Report each dimension, every hard gate, slice floors, and confidence. Never
   hide a failed slice inside an average.
6. Promote confirmed production failures into the permanent regression set.

## Product acceptance

The redesign is ready only when a first-time user can:

1. state an AI behavior or paste a production failure;
2. see a draft correctness contract before any evidence collection begins;
3. answer at most two high-information clarifications;
4. review evidence-targeted questions and their priority;
5. export a versioned eval pack;
6. understand the current release decision and its blocking evidence;
7. complete the same critical journey on desktop and mobile with no console or
   network errors.

## Iteration scorecard

Scores are evidence-backed snapshots, not aspirational labels.

| Iteration | Evidence | Decision | Construct | Judge | Reliability | UX | Integration | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline: survey-first product | 4/20 | 6/20 | 3/20 | 1/15 | 6/10 | 7/10 | 2/5 | **29/100** |
| Eval contract + question metadata | 12/20 | 15/20 | 17/20 | 7/15 | 7/10 | 9/10 | 3/5 | **70/100** |
| Vertical recipe + export + responsive workbench | 16/20 | 18/20 | 20/20 | 9/15 | 8/10 | 10/10 | 4/5 | **85/100** |
| Current: fast compiler + explicit HOLD blockers | 17/20 | 19/20 | 20/20 | 9/15 | 8/10 | 10/10 | 4/5 | **87/100** |

### Current score evidence

- **Evidence integrity, 17/20:** every question names its evidence target,
  authority, ask/stop conditions, and priority inputs; candidate cases remain
  visibly `hypothesis`; Eval Pack includes the durable evidence stream. The
  remaining three points require a promotion/adjudication workflow that records
  who accepted each case and when.
- **Decision value, 19/20:** a concrete release decision, policy authority,
  zero-tolerance outcomes, slice floors, and structured blockers are visible.
  Browser-measured time from production failure to full blueprint is 1.516
  seconds. The remaining point requires attaching the business consequence of
  a false ship or false hold.
- **Eval construct quality, 20/20:** the refund recipe includes eligible,
  missing-evidence, and exception cases; observable expected behavior and
  failure signals; critical slices; rubric anchors; and a zero-critical-failure
  gate.
- **Judge validity, 9/15:** deterministic checks run conceptually before model
  judgment, the rubric is observable, and human calibration is mandatory.
  Six points remain until expert decisions, agreement by slice, and a protected
  holdout set are persisted and reported.
- **Reliability, 8/10:** versioning, idempotent create, bounded timeouts,
  minimum repetitions, tenant isolation, retry behavior, and regression-safe
  tests are present. Two points remain until the product executes repetitions
  and reports variance/confidence from real candidate runs.
- **Workflow UX, 10/10:** production build; desktop/mobile rendering; no
  horizontal overflow at 390 px; explicit `HOLD`; recoverable network paths;
  35/35 production-browser E2E tests.
- **Integration, 4/5:** authenticated REST endpoint and browser download emit
  `telepace.eval-pack.v1` with provenance, graders, gate, and blockers. The
  remaining point is a first-party runner/MCP handoff that can post trial
  results back.

### Hard-gate audit

- No critical verdict lacks evidence because no verdict is emitted before
  trials; `release_readiness.state` is `not_run`.
- The exported and visible release decision is `HOLD`.
- Three blockers are explicit: no repeated trials, three hypothesis cases, and
  missing expert calibration.
- Desktop and 390 px mobile journeys pass in the production bundle with zero
  console errors.
- Any future `SHIP` state remains blocked until a runner supplies the missing
  trial and calibration evidence.

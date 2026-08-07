# Telepace user-story chain audit

Status: completed browser + remediation + persistence audit
Date: 2026-08-07

## Audit rule

A story passes only when its promised business outcome is observable in the
UI, durable after reload, represented in the Eval Pack, and safe under the
release hard gates. Rendering a plausible contract is not an end-to-end pass.

Every story is checked across the same nine links:

1. **Intent** — the user can state the failure or decision in their own words.
2. **Decision** — the product captures the concrete ship, hold, rollback, or
   policy decision.
3. **Authority** — the product identifies who or what may define correctness.
4. **Contract** — expected and prohibited behavior, slices, rubric, graders,
   and gate are explicit.
5. **Evidence** — the named trace, policy, correction, expert answer, or user
   answer is attached with provenance.
6. **Promotion** — accepted evidence can move a hypothesis into an
   evidence-backed or permanent regression case.
7. **Trials** — a frozen candidate and baseline can run repeated cases.
8. **Calibration** — judge disagreements, expert decisions, agreement by
   slice, and holdout separation are recorded.
9. **Decision output** — ship, hold, or rollback is computed from the gate and
   survives reload/export.

## Story acceptance matrix

| Story | Promised outcome | Required decisive proof |
| --- | --- | --- |
| US-E01 Production failure | The same refund-policy breach cannot silently return | Original trace + policy version become a severity-5 regression; zero-tolerance gate blocks a violating candidate |
| US-E02 Pre-launch correctness | Engineering, operations, and compliance share one versioned account-recovery contract | Policy authority, exception paths, deterministic checks, and critical slices survive reload/export |
| US-E03 Judge calibration | Judge agreement and blind spots are measured | Ten blinded comparisons, expert decisions, per-slice agreement, rubric revision, protected holdout |
| US-E04 Release decision | A candidate receives a defensible ship/hold/rollback result | Baseline/candidate versions, repeated paired trials, slice floors, critical failures, variance/confidence |
| US-E05 Targeted clarification | A user answer resolves intent telemetry cannot reveal | Triggering trace and affected user answer are linked; confirmed pattern becomes an eval slice |

## Evidence captured per browser run

For every UI run record:

- exact opening input and clarification selections;
- latency to first question and complete blueprint;
- visible contract, cases, graders, gate, and current blockers;
- all campaign/assess/evidence/eval-pack network responses;
- campaign id and state after a hard reload;
- downloaded Eval Pack fields;
- desktop and 390 px mobile screenshots;
- console and failed-request output;
- the first point where the user cannot continue toward the promised outcome.

## Scoring

Each of the nine links scores:

- `2` — end-to-end, durable, and visible;
- `1` — represented but manual, generic, or not connected to the next link;
- `0` — missing or misleading.

Story score is `/18`. Any false `SHIP`, fabricated provenance, lost state, or
unrecoverable UI error makes the story score zero regardless of subtotal.

## Post-remediation outcome

Telepace is no longer only an evaluation-blueprint generator. The repository
now contains a functional, event-versioned **evidence-to-release control
plane**:

```text
intent → decision → authority → correctness contract
→ immutable source artifact → reviewed claim → regression
→ exact baseline/candidate bindings → repeated paired trials
→ development + protected-holdout judge calibration
→ computed SHIP / HOLD
```

The remaining product gap has moved to the edge of that control plane:
Telepace records and adjudicates runner results, but it does not yet execute
arbitrary models, sample blinded pairs automatically, enforce a CI deployment
gate, or provide an authorized override/rollback workflow.

### Current story scores

These scores combine the post-fix UI inspection, durable API/event-store
evidence, export verification, and automated tests. They do not pretend that
all repeated writes were manually clicked: the exact browser coverage boundary
is documented below.

| Story | Initial | Current | Strongest remaining weak link |
| --- | ---: | ---: | --- |
| US-E01 Refund production failure | 12/18 | 16/18 | Trial results are entered from an external runner rather than executed by Telepace; calibration is a batch form rather than a pair-review queue. |
| US-E02 Account recovery pre-launch | 5/18 | 14/18 | The vertical compiler now produces security/policy/operations authority and complete critical slices, but source policy and owner connections remain manual. |
| US-E03 Clinical judge calibration | 5/18 | 14/18 | Ten examples and two holdouts are durable and gate the release, but pair sampling, blinding workflow, disagreement routing, and confusion-by-slice UI remain incomplete. |
| US-E04 Candidate release decision | 9/18 | 16/18 | The decision is computed with paired statistics, but CI execution, authorized override, and rollback are not yet product operations. |
| US-E05 Trace-triggered clarification | 3/18 | 14/18 | The plan is now one affected user, one question, and one minute, and claims can link trace plus answer; cryptographic affected-user-to-answer binding is not enforced on manual artifact attachment. |

Total: **74/90 (82%)**, up from **34/90 (38%)**. The score is intentionally
below 90: durable evaluation control exists, while automated execution and
some authority/identity integrations do not.

### Real UI click boundary

The clean post-fix E01 browser run used account
`eval-clean-20260807@telepace.local` and campaign
`0fd776b8-1a72-552f-91c1-b40542890eaa`. Real UI actions covered:

- account creation and authenticated navigation;
- the production-failure starter;
- `Ship a new agent version to production`;
- `Company refund policy team`;
- blueprint compilation and `Start evidence collection`;
- the live detail page and blocker-driven release workbench;
- attaching a production trace and a separate policy artifact;
- preserving the exact ISO timestamp `2026-08-05T14:22Z`;
- selecting both artifacts for a claim;
- promoting the eligible, missing-eligibility, and policy-exception cases;
- submitting the customer-pressure promotion;
- stopping collection and recovering the same durable state.

The fourth promotion's UI request encountered an expired-session/BFF retry and
returned a transient 422. Replaying its **exact captured request body** against
the authenticated API saved the fourth regression. Because the dev runtime
then suffered a corrupted cross-Node Turbopack cache, the remaining version
binding, 12 repeated trial writes, and 10 calibration examples were completed
through the same production API rather than misrepresented as browser clicks.

US-E02, US-E03, and US-E05 were initially browser-tested before the vertical
fixes. Their post-fix compilation and invariants are covered by deterministic
designer tests and the shared integration flow; a clean browser re-run was
blocked by the dev-runtime failure described below.

### Durable E01 release proof

The final E01 program is version 22 and computes:

| Field | Result |
| --- | ---: |
| Immutable source artifacts | 2 |
| Accepted claims / regressions | 4 / 4 |
| Paired trials | 12 (3 per case) |
| Blinded calibration examples | 10 |
| Protected holdouts | 2 |
| Baseline mean | 83.0 |
| Candidate mean | 92.0 |
| Paired delta | +9.0 |
| Score standard deviation | 1.71 |
| Approximate 95% CI | 90.95–93.05 |
| Judge agreement | 100% |
| Critical slices | all four at 92.0 |
| Blockers | none |
| Computed decision | **SHIP / complete** |

The exported `telepace.eval-pack.v1` independently verified:

- all four cases are `regression`;
- every case references both accepted source artifacts and its accepted claim;
- every artifact has a SHA-256 digest;
- the production timestamp remains exactly `2026-08-05T14:22Z`;
- `raw_content` appears zero times in the export;
- 12 trials and 10 calibration examples survive export;
- the exported decision recomputes to `SHIP`.

### What was implemented

1. **Truthful readiness**
   - a complete blueprint is explicitly “evidence not collected yet”;
   - the current HOLD/SHIP blockers come from the evaluation state, not survey
     readiness heuristics.
2. **Typed evidence and provenance**
   - immutable artifact hash, source URI/system, authority, trace/policy/model
     versions, separate raw/display content, and a redaction manifest;
   - one accepted claim can cite multiple artifacts.
3. **Evidence review and case promotion**
   - accepted/rejected review decisions, reviewer, rationale, frozen input,
     and durable promotion from hypothesis to regression.
4. **Version bindings and trials**
   - exact baseline/candidate names, versions, and config hashes;
   - repetitions, seeds, outputs, trajectories, tool effects, grader verdicts,
     latency, cost, and source URI.
5. **Judge calibration**
   - judge/rubric versions, blinded pair references, expert verdicts,
     development/holdout split, and agreement.
6. **Computed release decision**
   - hard gates, slice floors, repetition coverage, critical failures,
     baseline/candidate means, paired delta, standard deviation, confidence
     interval, and agreement.
7. **Vertical compilation**
   - account recovery, clinical judge calibration, refund incidents, and
     trace-linked targeted clarification have distinct deterministic recipes;
   - every critical slice is guaranteed to have a corresponding candidate
     Eval Case.
8. **Recovery and consistency**
   - signed interview resume token and same-interview history;
   - ISO timestamps are protected from phone-number redaction;
   - auth guests only on a real 401, while transient 5xx/network failures
     preserve the session and retry;
   - optional detail data can fail without discarding the campaign;
   - evaluation state updates are version-monotonic, so a stale poll cannot
     overwrite a newer reviewer mutation;
   - live polling is non-overlapping, visibility-aware, backoff-capable, and
     starts at 15 seconds rather than five.

### Post-fix reliability findings

Two environment failures must remain visible in the handoff:

1. The existing Docker PostgreSQL volume repeatedly terminated child
   processes with `SIGPIPE` and entered crash recovery. No volume was deleted.
   A native isolated PostgreSQL/Redis pair completed the durable audit and all
   live API tests.
2. Switching Node runtimes while Turbopack reused `.next` produced an internal
   Google-font module resolution failure. The generated cache was moved to the
   recoverable backup `/tmp/telepace-next-cache-turbopack-20260807`; source
   files were not deleted.

These failures do not invalidate the event-store/API result, but they do mean
the local dev stack is not a trustworthy latency benchmark. A production-like
preview with pinned Node, local/self-hosted fonts, and managed PostgreSQL
should be the next browser acceptance environment.

### Verification ledger

- backend full suite before the final frontend-only race fix:
  `334 passed, 1 skipped`;
- focused designer, release-decision, and integration suite:
  `35 passed`;
- live-API interview E2E against the isolated database:
  `8 passed`;
- frontend suite before the final three-test race regression:
  `113 passed`;
- monotonic evaluation-state regression:
  `3 passed` in a single worker;
- frontend TypeScript and ESLint:
  passed with no output;
- Python Ruff on the changed evaluation/designer/API modules:
  passed.

A later resource-stressed attempt to rerun the entire frontend suite could not
start 14 Vitest fork workers; it reported worker-start timeouts, not failed
assertions. A clean production build had passed earlier in the remediation,
but was not rerun after the final frontend reliability-only changes because the
cross-Node Turbopack cache had been quarantined. Final typecheck, lint, and the
new targeted regression are green.

## Initial hypotheses to falsify

- US-E01 may stop at a high-quality draft: there is no UI operation to attach
  the production trace or promote its hypothesis case.
- US-E02 may fall back to a generic research template rather than an
  account-recovery ontology.
- US-E03 may describe calibration but provide no paired-review workflow.
- US-E04 may show a gate specification but provide no trial runner or computed
  release result.
- US-E05 may collect a generic interview but fail to preserve the triggering
  trace-to-answer relationship.

These are hypotheses until the real UI, API responses, reload, and export
prove or disprove them.

## Initial audit conclusion (before remediation)

The current product is a strong **evaluation-blueprint generator** with a real
interview surface. It is not yet an end-to-end **evidence-to-release system**.

The structural break is after link 4:

```text
intent → decision → authority → contract
                                  ↓
                          universal interview link
                                  ✕
evidence artifact → reviewed claim → regression → repeated trials
→ calibrated judge → computed release decision
```

The refund recipe makes the left half look unusually complete, which can hide
the missing right half. The safest current behavior is the exported static
`HOLD / not_run`; the dangerous behavior is the creation UI simultaneously
announcing that all evidence is captured and the program is ready to publish.

## Initial browser results (before remediation)

| Story | Score | First broken link | What the real UI did |
| --- | ---: | --- | --- |
| US-E01 Refund production failure | 12/18 | Evidence provenance | Produced a strong refund contract, rubric, graders, three hypothesis cases, and a safe static HOLD. A pasted trace became transcript text, not a versioned trace artifact; no case could be promoted or run. |
| US-E02 Account recovery pre-launch | 5/18 | Authority | After a long first attempt and successful idempotent retry, generated a generic end-user research plan for “target users who used the relevant product weekly,” not an account-recovery safety contract owned by security, policy, and operations. |
| US-E03 Clinical judge calibration | 5/18 | Authority | Generated the same generic happy-path/missing-information/escalation plan. There was no blinded pair-review task, expert verdict capture, agreement metric, disagreement queue, rubric revision, or holdout. |
| US-E04 Candidate release decision | 9/18 | Evidence / runner | Correctly recognized refund semantics, three repetitions, slice floors, and zero critical failures. It provided no baseline/candidate connection or Run action, and the displayed HOLD was not computed from trials. |
| US-E05 Trace-triggered clarification | 3/18 | Decision | The user explicitly requested one affected user, a 30-second question, trace `tr_123`, and promotion with provenance. The UI returned a 10-response, approximately 18-minute generic interview and left Decision and Audience “to be defined.” |

Total: **34/90 (38%)**. The score is less important than the shape: links 1–4
can be strong, while links 5–9 are not represented by durable product
operations.

### US-E01 durable proof

Campaign:
`52793d08-87c5-59e3-9445-aa131241fc28`

The downloaded Eval Pack survived a hard reload and a backend restart. It
truthfully reported:

- schema `telepace.eval-pack.v1`;
- release state `not_run`;
- decision `hold`;
- zero evaluated cases;
- unknown critical-failure count;
- three hypothesis cases;
- empty `source_question_ids` on every case;
- two separate in-progress interviews after one reconnect;
- no trial or calibration record.

The first interview contains ten durable turns. The reconnect created a new
interview with two turns rather than resuming the original question state.

### Reliability and data-integrity findings

1. **False readiness**

   The creation UI displayed `Evidence captured: ready to publish` while the
   same screen said:

   - no repeated candidate trials;
   - all three cases remain hypotheses;
   - required expert calibration is missing.

   On US-E05, all four readiness pips were green even though the Decision and
   Audience fields visibly said `(to be defined)`. `deriveReadiness` currently
   treats any non-empty goal as a decision and any generated persona/screener
   as a valid authority. Those are old survey-readiness semantics, not
   evaluation readiness.

2. **Trace corruption by PII redaction**

   The submitted timestamp `2026-08-05T14:22Z` was persisted and exported as
   `[phone]T14:22Z`. The phone regex accepts long digit-and-hyphen sequences, so
   it consumes ISO dates. A replay artifact must never have its payload
   silently mutated by a display-redaction heuristic.

3. **Reconnect is a new interview, not a resume**

   A database interruption acted as a fault injection. The client correctly
   surfaced a reconnect affordance and prior respondent turns were durable.
   However, reconnect:

   - minted a new `interview_id`;
   - reset the UI to `Question 1 of 5`;
   - changed the active server-side question;
   - left the original session permanently `in_progress`;
   - split one respondent journey into two evidence rows.

   The WebSocket endpoint unconditionally calls `uuid4()` for every
   connection, and the client sends no resume token or prior interview id.

4. **Slow request, accurate idempotency, confusing outcome**

   The first account-recovery create attempt displayed more than 55 seconds of
   waiting and then timed out in the browser. The backend subsequently logged
   a successful 200. The Retry reused the exact same idempotency key
   `122a2d82-056a-41b4-acc4-ac2cb677ce5a` and returned the already-created
   campaign, so duplicate prevention worked. The missing piece is a UI state
   such as “the server may still be finishing; check status,” rather than
   presenting the operation as a normal failed message.

5. **Polling and recovery amplification**

   A live study polls campaign, insights, and evidence as three concurrent
   requests every five seconds. During database recovery this produced long
   bursts of 500 responses. The database process interruption was not proven
   to be caused by polling, but the client amplified the incident and did not
   back off. The existing asyncpg pool also continued surfacing closed
   connections until the API process was restarted.

6. **Expired-session console error**

   A long-lived app session first requests `/api/auth/me`, receives 401, and
   then refreshes successfully. The user recovers, but every cold navigation
   can emit a console error and briefly render a signed-out state. After the
   database interruption, `/api/auth/me` returned 500 and the signed-in state
   did not self-heal until the backend restart.

## Why the initial chain was structurally incomplete

The implementation contains:

- `EvaluationContract`;
- rubric and grader specifications;
- a release-gate specification;
- `EvalCaseDraft` with `hypothesis | evidence_backed | regression`;
- interview events and transcript evidence;
- a versioned Eval Pack export.

It does not contain:

- a typed evidence artifact with URI, immutable hash, source system, policy
  version, redaction manifest, and capture time;
- an evidence claim or reviewer acceptance record;
- a case-promotion command or endpoint;
- baseline and candidate model/version bindings;
- a trial-run entity, repeated outputs, grader verdicts, per-slice aggregates,
  or variance;
- a judge-calibration task, blinded expert verdict, agreement metric,
  disagreement resolution, or protected holdout;
- a computed release-decision event.

`GET /eval-pack` therefore has no choice but to return a hard-coded
`HOLD / not_run` and blockers. The comment says a runner “may replace” it, but
there is currently no command or API through which that replacement can occur.

## Product redesign: make the next required action the product

Do not send every user story to a universal `Start & get link` button. The
next CTA must depend on the first missing proof:

| Story | Correct next CTA |
| --- | --- |
| Production failure | `Attach and freeze the failure trace` |
| Pre-launch contract | `Attach policy version and name its owner` |
| Judge calibration | `Upload or sample blinded comparison pairs` |
| Candidate release | `Connect baseline A and candidate B` |
| Unresolved user intent | `Ask this affected user one trace-linked question` |

The truthful state machine should be:

```text
Contract draft
→ source required
→ source attached
→ evidence reviewed
→ regression frozen
→ baseline/candidate bound
→ repeated trials complete
→ judge calibrated on development set
→ holdout verified
→ SHIP / HOLD / ROLLBACK
```

No later state can be inferred from the existence of an earlier document.

### Minimum durable objects

1. `EvidenceArtifact`
   - kind: trace, policy, expert verdict, affected-user answer, outcome;
   - source URI and source system;
   - immutable content hash;
   - captured time and policy/product/model version;
   - authority;
   - encrypted raw location plus a separate redacted presentation;
   - redaction manifest.

2. `EvidenceClaim`
   - the exact assertion supported by one or more artifacts;
   - accepted/rejected/needs-review;
   - reviewer and rationale;
   - affected rubric, grader, contract field, or case.

3. `CasePromotion`
   - hypothesis case id and target status;
   - accepted claim ids;
   - frozen replay input and expected behavior;
   - version and reviewer.

4. `TrialRun`
   - baseline/candidate binding;
   - case and repetition;
   - input, trajectory, tool effects, output;
   - deterministic, reference, model, human, and outcome verdicts;
   - latency, cost, and seed/configuration.

5. `JudgeCalibration`
   - blinded comparison set;
   - expert verdicts;
   - agreement and confusion by slice;
   - disagreement resolutions;
   - rubric/judge version;
   - development/holdout split.

6. `ReleaseDecision`
   - the exact gate version;
   - trial and calibration ids;
   - slice statistics and critical failures;
   - computed decision plus any authorized override.

## The highest-ROI product loop

```text
production incident or planned release
→ ingest traces/policy/current evals automatically
→ identify the smallest unresolved definition of correct
→ ask a human only when telemetry/policy cannot answer it
→ review and promote the evidence into a regression
→ run baseline and candidate repeatedly
→ route judge disagreements to qualified experts
→ block or approve the release
→ monitor production for the next novel failure
```

Here, interviews are a conditional evidence tool, not the product's unit of
value. Sparse authoritative labels are enough because traces, policies, tool
results, and outcomes provide the volume. This directly answers the “there
will not be enough data” concern: the human data is not the dataset; it is the
missing label that makes the machine data evaluable.

## Positioning implication

The defensible product is not:

> “An Agent that writes better questionnaires than Claude or Codex.”

It is:

> “The release-control system that turns real AI failures and qualified human
> judgment into permanent regressions, calibrated judges, and auditable ship
> decisions.”

Claude or Codex can draft a rubric and cases. They do not, by themselves, own
the organization's durable trace lineage, authority graph, reviewer decisions,
paired trials, judge calibration history, and deployment gate. That system of
record and execution loop is the moat.

## Committed browser evidence

- `output/playwright/e01-blueprint-ready-contradiction.png`
- `output/playwright/e01-interrupted-evidence.png`
- `output/playwright/e05-targeted-clarification-generic.png`
- `output/playwright/e05-targeted-clarification-mobile.png`
- `output/playwright/iteration-4/refund-eval-hold-desktop.png`
- `output/playwright/iteration-4/refund-eval-hold-mobile-focused.png`
- `output/playwright/iteration-4/refund-eval-hold-mobile.png`

Playwright CLI traces, console logs, and the downloaded Eval Pack were also
inspected during the audit. They remain local generated artifacts and are
excluded from version control because traces may contain session and request
metadata.

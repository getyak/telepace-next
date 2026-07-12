I have everything I need. All three tracks, their critiques, and the code audit are grounded in verified source references. Here is the final blueprint.

---

# FINAL BLUEPRINT — telepace Study-Creation + Interview to 100+

## 1. THE VISION

Listen Labs makes the researcher click "Next" through a five-screen wizard and makes the respondent talk into a recorder; telepace dissolves both. On the creation side, the five wizard screens don't disappear — they reassemble as a live "readiness spine" in the canvas header, so a researcher who is just *talking* can glance up and know, with wizard-grade certainty, exactly what the agent has captured and what remains — legibility with zero modal-friction tax. On the interview side, the respondent doesn't talk into a void: a live "I'm hearing you…" transcript rises word-by-word as they speak, so being heard is *visible*, not just recorded. Everything ships front-end-first behind deterministic, unit-tested, backend-replaceable seams — the exact `clarify.ts` discipline the codebase already trusts (`clarify.ts:11-15`) — so the felt product wins today and the model upgrades it tomorrow. The bar is non-negotiable: every new state reaches its meaning through fill + glyph + weight (never color or motion alone), degrades cleanly under reduced-motion, and reads naturally in both en and zh.

---

## 2. RANKED BUILD ITEMS

Ranking logic: highest wow-per-hour and lowest correctness-risk first. Both #1 and #2 are the *durable, honestly-shippable* cores that survived their adversarial critiques; the fragile/deferred-differentiator ideas are pushed down or out.

| # | What | Files / seams (concrete) | Effort | FE-only? |
|---|------|--------------------------|--------|----------|
| **1** | **Readiness Spine** — 5-pip hairline spine in canvas header (`Decision · Audience · Who pays · Depth · Questions`), pips fill deterministically off `spec`; who-pays domain-gated to pricing; publish soft-gate + one coordinated header flash | `deriveReadiness(spec)` new in `clarify.ts`; mount at `new/page.tsx:524-547`; live region clone of `:544-546`; publish gate `:561`; **coordinate with existing `changesTracked` badge `:530-539`** | **M** | ✅ yes |
| **2** | **Live interim transcript** ("I'm hearing you…") — render dropped non-final `SttDelta` under the orb in voice mode; softens to "still here" after 6s silence | `r/page.tsx:248-254` (wire non-final instead of drop); new `interim` state; render under orb `:324-329`; keys in `respondent.json` | **S** | ✅ yes |
| **3** | **Per-item outline diff** — flag only the changed `q.order`, not the whole block; decouple the flash-remount key from edit lifecycle | `applySpecWithDiff` `:187-206` emit `changedOrders:Set<number>`; thread into `<li key={q.order}>` `:640-653`; new `tp-line-settle` in `globals.css` | **M** | ✅ yes |
| **4** | **Voice-mode fixes (correctness)** — unify the two WS effects so voice reuses `setProgress`, the 45s watchdog `:138-152`, and the `dropped` reconnect banner `:349-361`; **fix the orphan composer** that inflates `answeredRef` | `r/page.tsx:154, 268, 290-297, 334-341` | **M** | ✅ yes |
| **5** | **"What changed" narration** — one-line `describeSeed`-style sentence into the `onDone` bubble ("Captured your audience — added 3 questions") | `describeChange()` new pure fn (pattern `:805-824`); `changed`/`changeCount` `:128-129`; onDone bubble `:318` | **S** | ✅ yes |
| **6** | **4-beat clarify + structured ids** — extend `nextStageRef` machine to `whopays`/`depth`; carry option ids not labels; depth seeds `target_completions` | `clarify.ts` (`deriveWhoPaysClarify`, `deriveDepthClarify`); stage enum `:144`; onDone arming `:302-324`; `Chat.tsx:107-109` ids | **M** | ✅ yes |
| **7** | **Reflecting orb beat (server-gated)** — new `orbPhase` (renamed to avoid collision with existing `phase` router); reflecting duration = *real* server think-time (start on final STT, end on `InterviewerTurn`), skip if <300ms | `Chat.tsx:385-470` add `orbPhase`+`level`; `reflect.ts` new pure module; `globals.css` `tp-orb-reflect` | **L** | ⚠️ FE for beat, needs endpoint signal to time honestly |
| **8** | **Pause / rephrase / mic-regrant affordances** — "I need a moment", "Could you rephrase?", warm mic-denied card with `[Grant]`/`[Continue in text]` | `r/page.tsx` affordances; reuse `ClarifyChips` for rephrase; `:206,263` remove `console.error` | **M** | ✅ mostly |
| **9** | **Inline-editable outline questions** — extend the live-title pattern to `q.question` | live title `:571-575`; needs #3 (remount decouple) + **outline-persist API hop** (blocked: `handlePublish` sends only id, `:444`) | **L** | ❌ needs persistence API |
| **10** | **Rehearse ×3 quality gate** — 3-persona parallel simulate + per-question verdict write-back ("2 of 3 gave one-word answers") | `handleSimulate` `:208-226` → `SimulateResponse[]` + parallel; `scoreQuestions()` with CJK-aware `Intl.Segmenter`; verdict chips on `<li>` | **L** | ✅ FE-scorable, but big lift |

---

## 3. BUILD ITEM #1 IN DETAIL — The Readiness Spine

**Why this is #1:** It is the single move that converts "nice chat" into "wizard-grade certainty" — the true structural leapfrog over Listen Labs (the other creation ideas are taste-refinements). It's pure front-end over fields the current flow *already populates*, mirrors the proven `clarify.ts` seam, and reuses the exact a11y/motion tokens already in the header. Critique score 80/100, verdict BUILD-WITH-FIXES — and the two named fixes (the double-flash collision and the wrong "working" token) are folded into this spec below.

### 3a. Interaction spec

A horizontal row of 5 labeled pips over a hairline editorial rule, mounted in the canvas header right of the `discussionGuide` overline (`new/page.tsx:526`), sharing the flex row with the `~min · completions` line and the existing `changesTracked` badge.

**Pip states (three, all non-color-safe):**
- **pending:** hollow ring, `text-muted` label, `border-hairline`.
- **satisfied:** filled sage dot (`bg-accent`), `text-body` label, **`font-medium` + a `✓` glyph** — meaning carried by fill *and* weight *and* glyph, never color alone (WCAG 1.4.1).
- **n/a** (who-pays on non-pricing studies): a dimmed em-dash `–`, `text-muted`. Never a hollow ring — an N/A pip must not read as "still to do."

**The five pips and their deterministic derivation (pure, front-end, from `spec` only):**

| Pip | ✓ when |
|-----|--------|
| Decision | `spec.goal` non-empty |
| Audience | `spec.target_persona` truthy **or** `spec.audience_screener.length > 0` |
| Who pays | pricing-domain **and** (a screener matches `/pay|reimburs|fund|budget|付费\|报销\|预算\|资金/i`); **N/A when `DOMAIN_LENSES` does not match `spec.goal` as pricing** |
| Depth | `spec.outline.length > 0` |
| Questions | `spec.outline.length >= 3` |

The domain signal is recoverable from `spec.goal` alone (critique-confirmed: `DOMAIN_LENSES` tests against `goal`, which is in scope) — no hidden dependency, no clarify-answer state needed for v1.

**The coordinated header flash (THE critique fix — one patch, one flash, one utterance):**
On every SSE patch, `applySpecWithDiff` already fires the diff-flash and re-renders the `changesTracked` badge. Adding a second `tp-ping-once` on a just-satisfied pip would create two competing flashes ~8px apart in the same flex row — cheapening the calm the whole angle sells. Fix:
1. Compute `readinessDelta` (which pips newly transitioned) inside `applySpecWithDiff`.
2. **Branch the header's transient cue:** `readinessDelta.length > 0 ? pip-pings-only : badge-pings`. Suppress the badge's `tp-ping-once` on any patch where a pip transitions — the pip *is* the change notification.
3. The `Questions`-pip flip, the publish soft-gate enable, and the outline block flash collapse into **one "study became ready" beat** with a single live-region utterance ("Ready to publish — 1 step still open"), not three independent frame-changes.

**Publish soft-gate (never trap the researcher — mirrors the respondent watchdog ethos):**
Extend `disabled={!campaignId || spec.outline.length === 0}` (`:561`) to enable once `Questions` + `Decision` are satisfied. If `Audience`/`Depth` remain pending, publish stays *enabled* with a muted, factual hint ("2 things still open") — never a red error. Publishing an incomplete study is a legitimate choice.

**No "working pulse" in v1** (critique fix): the rejected idea reused `tp-breathe` (the orb's *resting* animation) to mean "actively computing this pip" — an inverted semantic that reads as *resting*, and a persistent pulse risks a nag/spinner feel. Drop it; the spine tells the story by filling.

### 3b. Component / state design

```ts
// clarify.ts — new pure, backend-replaceable seam (documented like clarify.ts:11-15)
export type PipState = "pending" | "satisfied" | "na";
export type Readiness = {
  decision: PipState; audience: PipState; whopays: PipState;
  depth: PipState; questions: PipState;
};
export function deriveReadiness(spec: Spec): Readiness { /* pure, tested */ }

// Helper for the coordinated flash — which pips newly flipped to satisfied.
export function readinessDelta(prev: Readiness, next: Readiness): (keyof Readiness)[];
```

- **No new persisted state.** `Readiness` is derived each render from `spec`. The only stored value is `prevReadinessRef` (a `useRef`) to compute `readinessDelta` — same pattern as `prevSpecRef` (`:130`).
- `ReadinessSpine` is a **presentational** component (`spec`-derived props in, no side effects): takes `readiness`, `justSatisfied: keyof Readiness | null`, and injected localized labels (the `SeedCopy` convention — a plain object, not a hook, so logic stays pure/testable).
- Backend-replaceable exactly like `clarify.ts`: when the server emits a `readiness` block on SSE, it flows through `mergeServerSpec`/`onPatch` and `deriveReadiness` retires.

### 3c. en + zh copy keys (`messages/{en,zh}/app.json`)

```jsonc
// en
"readiness": {
  "decision": "Decision", "audience": "Audience", "whoPays": "Who pays",
  "depth": "Depth", "questions": "Questions",
  "satisfiedLive": "{label} captured — {remaining, plural, =0 {ready to publish} =1 {1 step still open} other {# steps still open}}",
  "publishHint": "{remaining, plural, =1 {1 thing still open} other {# things still open}}"
}
// zh
"readiness": {
  "decision": "决策", "audience": "受众", "whoPays": "谁付费",
  "depth": "深度", "questions": "问题",
  "satisfiedLive": "已捕获{label} — {remaining, plural, other {还差 # 步}}",
  "publishHint": "{remaining, plural, other {还有 # 项待完成}}"
}
```
Route all through injected copy + `tc(..., {count/remaining})` ICU (the `seedCopy`/`clarifyCopy` discipline at `:150-183`). Labels are 1-2 words; zh renders tighter — **reserve width for the longer English and center zh; never truncate a pip label.**

### 3d. Reduced-motion + a11y

- **Reduced-motion:** pips reach the *satisfied* visual state **instantly** (skip `tp-ping-once`) — meaning is carried by fill + `✓` + `font-medium`, never motion. The coordinated flash's `tp-ping-once` is gated behind the motion query (which the existing token already honors, `globals.css:234-239`).
- **Live region:** a single `<span role="status" aria-live="polite">` (clone the exact element at `:544-546`), keyed so an identical transition re-announces. **One utterance per patch** (the coordinated-flash rule), e.g. "Audience captured — 1 step still open."
- **Non-color:** every state distinguishable in grayscale (ring vs filled dot vs em-dash) and with a glyph.
- **Spine is decorative structure, pips are status:** the rule/labels are presentational; the readiness signal lives in the single live region, not in 5 chatty ones (avoids AT flood).

### 3e. Acceptance criteria (screenshot-verifiable)

1. **Empty study:** all 5 pips render `pending` (hollow rings, muted labels) over a visible hairline rule; spine sits cleanly in the header flex row without wrapping in en or zh.
2. **After a pricing goal + audience + 3 questions land:** `Decision`, `Audience`, `Depth`, `Questions` show filled sage dots with `✓` and `font-medium` labels; `Who pays` shows `pending` (hollow) if no pay-screener yet.
3. **Churn study (non-pricing goal):** `Who pays` renders as a dimmed em-dash `–` (N/A), *not* a hollow ring — screenshot shows it visually distinct from the pending state.
4. **One patch, one flash:** on a single SSE patch that adds questions, screenshot/video shows the pip ping OR the changes-badge ping — **never both** simultaneously; grayscale screenshot still fully distinguishes all pip states.
5. **Publish soft-gate:** with `Questions`+`Decision` satisfied but `Audience` pending, the publish button is enabled and a muted "1 thing still open" hint is visible (not red, not blocking).
6. **Reduced-motion (emulated):** pips are already in satisfied state on load with no animation frames; the `✓`/fill/weight still convey completion.
7. **zh:** `决策 · 受众 · 谁付费 · 深度 · 问题` render fully, centered, none truncated; live region announces `已捕获受众 — 还差 1 步`.
8. **`deriveReadiness` unit tests** (mirroring `clarify.test.ts`) pass for: empty spec, pricing goal, churn goal (who-pays N/A), boundary `outline.length` 0/1/3, and `audience_screener`-only audience satisfaction.

---

## 4. WHAT WE DELIBERATELY DON'T DO YET

- **No inline-editable outline questions (item #9) yet.** Two confirmed blockers: (a) the outline `<ol>` is remounted by React key on every patch (`key={outline-${...patchSeq}}`, `:640`), so an inline editor loses focus/text mid-keystroke on any SSE patch — this needs the flash-remount key decoupled from the edit lifecycle first (item #3); and (b) `handlePublish` sends only the id (`:444`), so edits would evaporate on publish — this needs a real outline-persist API contract, which is *not* front-end-only. Ship the read-only spine and per-item diff first; earn the edit surface once its remount + persistence seams are real.

- **No deterministic "agent reacts to your edit" chip.** A front-end rules table ("removed a hedge → praise + offer probe") is a demo trick that is either silent (per the aggressive-`null` guard, deleting the wow) or canned (clocked as fake by session three). We wait until the *real* LLM reaction can flow through the existing SSE `onPatch`/`clarify` seam. A real-but-occasional co-author beats a deterministic-but-hollow one.

- **No client-timed reflecting pause.** The client's only "respondent stopped" signal is a final `SttDelta`; there is no VAD/endpointing event on the wire. A 720ms pause staged when `InterviewerTurn` already arrives is *manufactured latency* in front of a computed answer — the exact "advertises think-time / feels laggy" failure. When we ship the reflecting beat (item #7), its duration will be the *real* server think-time (start on final STT, end on `InterviewerTurn`, skip if <300ms), and `orbPhase` will be renamed to avoid the confirmed collision with the existing `phase` screen router.

- **No Rehearse ×3 quality gate yet (item #10) — but it is the headline of milestone 2, not "polish."** It's the one true moat on the interview-authoring side (catches a leading question before a real human is spent), and it degrades least with repeated use. It's deferred only because it's a genuine lift: the `sim` state is single-slot single-seed, so it needs a real `SimulateResponse[]` + parallel orchestration + CJK-aware scoring (`Intl.Segmenter`, not `split(/\s+/)`, or it silently mis-scores every Chinese study), gated behind ≥2-of-3-persona agreement to avoid trust-killing false negatives.

- **No `whopays`/`depth` clarify beats or structured-id replies in the v1 spine (item #6).** The spine derives entirely from `spec` — it fills for free off existing SSE patches with zero clarify changes. The 4-beat rhythm makes pips fill *ahead* of the spec (nicer), but it's a fast-follow, not a v1 dependency.

**Load-bearing precondition for all creation work:** the PRD P0 crash (`copyFor` reading `undefined.title` / zh missing `errors` namespace → permanent spinner) must be fixed first — none of the spine is reachable until the create flow renders.

**Files touched for item #1:** `frontend/apps/app/src/lib/clarify.ts` (add `deriveReadiness` + `readinessDelta` + tests in `clarify.test.ts`), `frontend/apps/app/src/app/[locale]/(app)/studies/new/page.tsx` (mount spine `:524-547`, compute `readinessDelta` in `applySpecWithDiff` `:187-206`, coordinate the badge flash `:530-539`, extend publish gate `:561`), `frontend/apps/app/messages/{en,zh}/app.json` (readiness keys), and a new `ReadinessSpine` component (co-located, or `packages/ui` if reused).
"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  ChatFeed,
  ChatComposer,
  ReadinessSpine,
  type ChatMessage,
  type ClarifyPrompt,
  type ReadinessPip,
} from "@telepace/ui";
import { ALL_CHANNELS, CHANNELS } from "@telepace/config";
import {
  deriveDecisionClarify,
  deriveAudienceClarify,
  deriveReadiness,
  readinessDelta,
  pendingCount,
  assessReadinessLocal,
  READINESS_ORDER,
  type ClarifyCopy,
  type Readiness,
} from "@/lib/clarify";
import {
  assessTask,
  createCampaign,
  getCampaign,
  refineOutlineStream,
  simulateInterview,
  startCampaign,
  type AssessResult,
  type AssessClarifyQuestion,
  type ResearchTaskInput,
  type SimulateResponse,
} from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { useErrorsCopy } from "@/components/app/ErrorsCopyContext";
import { useRouter } from "@/i18n/navigation";

type OutlineItem = {
  order: number;
  question: string;
  goal: string;
  max_followups?: number;
  branch_if_positive?: string | null;
  branch_if_negative?: string | null;
};

type ChannelEntry = { kind: string; config?: Record<string, string> };

// The synthetic option id for "skip the gate and start drafting now", appended
// to every gate clarify prompt. Recognized in handleClarifySelect to bypass the
// assessment loop and create with the best-effort task distilled so far.
const GATE_SKIP_ID = "__gate_skip__";

type ResearchTask = {
  decision: string;
  objective: string;
  audience: string;
};

type Spec = {
  title: string;
  goal: string;
  background: string;
  research_task: ResearchTask | null;
  hypotheses: string[];
  target_persona: string;
  audience_screener: string[];
  outline: OutlineItem[];
  channels: string[];
  target_completions: number;
  estimated_minutes: number;
  success_criteria: string[];
};

const INITIAL_SPEC: Spec = {
  title: "New study",
  goal: "",
  background: "",
  research_task: null,
  hypotheses: [],
  target_persona: "",
  audience_screener: [],
  outline: [],
  channels: [CHANNELS.webText],
  target_completions: 10,
  estimated_minutes: 15,
  success_criteria: [],
};

type ServerSpec = {
  goal?: string;
  background?: string;
  research_task?: ResearchTask | null;
  hypotheses?: string[];
  target_persona?: string;
  audience_screener?: string[];
  outline?: {
    items?: OutlineItem[];
    estimated_duration_minutes?: number;
    success_criteria?: string[];
  };
  channels?: ChannelEntry[];
  target_completions?: number;
};

// Merge any subset of server-shaped spec fields into local Spec state.
// Applied identically to the initial GET-after-create load and to every
// SSE spec_patch, so no field the Designer produces is silently dropped.
function mergeServerSpec(prev: Spec, patch: ServerSpec, title?: string): Spec {
  const next: Spec = { ...prev };
  if (title !== undefined) next.title = title;
  if (typeof patch.goal === "string" && patch.goal) next.goal = patch.goal;
  if (typeof patch.background === "string") next.background = patch.background;
  if (patch.research_task !== undefined) next.research_task = patch.research_task;
  if (Array.isArray(patch.hypotheses)) next.hypotheses = patch.hypotheses.filter(Boolean);
  if (typeof patch.target_persona === "string") next.target_persona = patch.target_persona;
  if (Array.isArray(patch.audience_screener))
    next.audience_screener = patch.audience_screener.filter(Boolean);
  if (patch.outline) {
    if (Array.isArray(patch.outline.items)) next.outline = patch.outline.items;
    if (typeof patch.outline.estimated_duration_minutes === "number")
      next.estimated_minutes = patch.outline.estimated_duration_minutes;
    if (Array.isArray(patch.outline.success_criteria))
      next.success_criteria = patch.outline.success_criteria.filter(Boolean);
  }
  if (Array.isArray(patch.channels))
    next.channels = patch.channels.map((c) => c.kind).filter(Boolean);
  if (typeof patch.target_completions === "number")
    next.target_completions = patch.target_completions;
  return next;
}

export default function NewStudyPage() {
  const router = useRouter();
  const tc = useTranslations("app.newStudy");
  const errorsCopy = useErrorsCopy();

  const initialMessages: ChatMessage[] = [
    { id: "sys-1", role: "system", text: tc("systemGreeting") },
  ];
  const suggestions = [tc("suggestion1"), tc("suggestion2"), tc("suggestion3")];

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // The default title is shown in the header before the agent derives one, so
  // it must be localized — a bare "New study" was the one bit of English that
  // leaked into the zh create flow.
  const [spec, setSpec] = useState<Spec>(() => ({ ...INITIAL_SPEC, title: tc("untitledStudy") }));
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simSeed, setSimSeed] = useState(0);
  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  // Which guide sections changed on the most recent patch — drives the diff
  // flash + the "~N changes" badge. Keyed by section id so each block can
  // independently re-trigger its one-shot highlight animation.
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [changeCount, setChangeCount] = useState(0);
  // Monotonic patch counter — feeds each block's remount key so the one-shot
  // diff-flash / grow animation replays even when the SAME block changes on two
  // consecutive patches (moved.size alone would stay constant and React would
  // skip the remount, leaving the researcher's edit visually unacknowledged).
  const [patchSeq, setPatchSeq] = useState(0);
  // Bumping this refocuses the composer when a researcher picks "Something
  // else…" on a clarify prompt — hands control back to free typing.
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  // The guided-clarification stage, held as PERSISTENT state rather than a
  // one-shot handleSend argument. This is what keeps the second-beat (audience)
  // and the closing note alive across the freeform escape hatch and Retry —
  // paths that call handleSend without the original opts. "audience" = the next
  // reply should chain the audience prompt; "closure" = it should end with a
  // ready-to-publish note. Consumed and cleared in the refine onDone.
  const nextStageRef = useRef<"audience" | "closure" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── The pre-creation assessment gate ──────────────────────────────────────
  // Until intent is clear, NO campaign is created. These refs carry the loop's
  // accumulated state across turns without re-rendering:
  //  - taskDraftRef  : the distilled task so far (decision/objective/audience),
  //                    fed into createCampaign once ready.
  //  - priorContextRef: the researcher's clarification answers, newest last,
  //                    threaded back into each /assess call so it converges.
  //  - clarifyRoundsRef: how many clarify rounds we've run — a hard ceiling so
  //                    the loop can't trap the researcher (auto-creates after).
  //  - originalGoalRef: the very first opening line, the stable seed goal.
  const taskDraftRef = useRef<ResearchTask>({ decision: "", objective: "", audience: "" });
  const priorContextRef = useRef<string>("");
  const clarifyRoundsRef = useRef<number>(0);
  const originalGoalRef = useRef<string>("");
  // After how many clarify rounds we stop gating and create with best-effort
  // task — respects the researcher's time (never an infinite interrogation).
  // Two keeps parity with Listen Labs' typical decision→audience rhythm; a
  // stubbornly vague opener still lands a study rather than looping forever.
  const MAX_CLARIFY_ROUNDS = 2;
  // When a clarify prompt is on screen during the gate, this reply should feed
  // the assessment loop (not the post-create refine stream). Set when we render
  // a gate clarify, cleared when consumed.
  const inGateRef = useRef<boolean>(false);

  // Which research-task field is being edited inline (null = none), plus its
  // draft text. Editing a task field re-steers the whole study: on save we send
  // a refine instruction so the outline/persona/screener regenerate to serve
  // the changed task — the "edit the task, everything follows" loop.
  const [editingTaskField, setEditingTaskField] = useState<keyof ResearchTask | null>(null);
  const [taskFieldDraft, setTaskFieldDraft] = useState("");
  const prevSpecRef = useRef<Spec>(INITIAL_SPEC);

  // Readiness spine state. `readiness` is derived from `spec` each render (pure,
  // no persisted copy — mirrors the clarify seam). Only the *previous* snapshot
  // is stored, so a patch can tell which pips newly flipped (readinessDelta).
  const prevReadinessRef = useRef<Readiness>(deriveReadiness(INITIAL_SPEC));
  // The pip that just flipped to satisfied on the latest patch — pings once,
  // then clears. Null on the steady state and under reduced-motion.
  const [justSatisfied, setJustSatisfied] = useState<keyof Readiness | null>(null);
  // A single accessible utterance for the latest readiness transition. Keyed by
  // a monotonic seq so an identical sentence still re-announces (WCAG 4.1.3).
  const [readinessLive, setReadinessLive] = useState<string>("");
  const [readinessLiveSeq, setReadinessLiveSeq] = useState(0);
  // When a pip transitions, the pip IS the change notification — so we suppress
  // the redundant changes-badge ping for that one patch (one patch → one flash).
  const [suppressBadgePing, setSuppressBadgePing] = useState(false);

  const prefersReducedMotion = usePrefersReducedMotion();

  const readiness = deriveReadiness(spec);

  // Localized copy for the domain-aware clarification chips. Memoized so the
  // object identity is stable across renders (it feeds pure derive fns).
  const clarifyCopy = useMemo<ClarifyCopy>(
    () => ({
      submitLabel: tc("clarifySubmit"),
      freeformLabel: tc("clarifyFreeform"),
      generic: {
        pricing: tc("decisionPricing"),
        positioning: tc("decisionPositioning"),
        prioritization: tc("decisionPrioritization"),
        messaging: tc("decisionMessaging"),
        retention: tc("decisionRetention"),
      },
      audience: {
        b2bBuyers: tc("audienceBuyers"),
        endUsers: tc("audienceEndUsers"),
        churned: tc("audienceChurned"),
        prospects: tc("audienceProspects"),
      },
    }),
    [tc],
  );

  // Localized pip labels for the readiness spine, in spine order. Memoized so
  // the array identity is stable across renders.
  const readinessLabels = useMemo<Record<keyof Readiness, string>>(
    () => ({
      decision: tc("pipDecision"),
      audience: tc("pipAudience"),
      whopays: tc("pipWhoPays"),
      depth: tc("pipDepth"),
      questions: tc("pipQuestions"),
    }),
    [tc],
  );

  // The pips array the presentational spine renders — labels + live status,
  // built from the derived readiness in stable spine order.
  const readinessPips = useMemo<ReadinessPip[]>(
    () =>
      READINESS_ORDER.map((k) => ({
        key: k,
        label: readinessLabels[k],
        status: readiness[k],
      })),
    [readiness, readinessLabels],
  );

  // How many applicable pips are still pending — feeds the publish soft-gate
  // hint. `na` pips never count (pendingCount ignores them).
  const readinessOpen = pendingCount(readiness);

  // Localized copy for the seed-summary pure function (describeSeed). Uses ICU
  // plural rules so counts read naturally in both languages.
  const seedCopy = useMemo<SeedCopy>(
    () => ({
      questions: (n) => tc("seedQuestions", { count: n }),
      hypotheses: (n) => tc("seedHypotheses", { count: n }),
      persona: tc("seedPersona"),
      separator: tc("seedSeparator"),
      drafted: (parts) => tc("seedDrafted", { parts }),
      empty: tc("seedEmpty"),
    }),
    [tc],
  );

  // Diff the incoming spec against the last one and record which sections
  // moved, so the canvas can flash exactly what the agent just touched.
  function applySpecWithDiff(next: Spec) {
    const prev = prevSpecRef.current;
    const moved = new Set<string>();
    if (next.goal !== prev.goal) moved.add("goal");
    if (next.target_persona !== prev.target_persona) moved.add("persona");
    if (JSON.stringify(next.hypotheses) !== JSON.stringify(prev.hypotheses)) moved.add("hypotheses");
    if (JSON.stringify(next.audience_screener) !== JSON.stringify(prev.audience_screener))
      moved.add("screener");
    if (JSON.stringify(next.outline) !== JSON.stringify(prev.outline)) moved.add("outline");
    if (JSON.stringify(next.success_criteria) !== JSON.stringify(prev.success_criteria))
      moved.add("criteria");
    prevSpecRef.current = next;

    // Readiness spine: did any pip newly flip to satisfied on this patch?
    const nextReadiness = deriveReadiness(next);
    const flipped = readinessDelta(prevReadinessRef.current, nextReadiness);
    prevReadinessRef.current = nextReadiness;

    if (moved.size > 0) {
      setChanged(moved);
      setChangeCount(moved.size);
      // Bump the sequence so consecutive edits to the same block still remount
      // and replay their highlight.
      setPatchSeq((n) => n + 1);
    }

    // Coordinated header cue: when a pip transitions, the pip IS the change
    // notification, so suppress the redundant changes-badge ping for this one
    // patch — one patch → one flash → one utterance (the whole "calm" of the
    // spine depends on not firing two competing pings 8px apart).
    if (flipped.length > 0) {
      setSuppressBadgePing(true);
      // Arm the one-shot pip ping only when motion is welcome; the CSS query is
      // a second gate. Ping the last-flipped pip (questions wins on a full jump).
      setJustSatisfied(prefersReducedMotion ? null : flipped[flipped.length - 1]);
      // One accessible utterance: which pip landed + how many steps remain.
      const landedKey = flipped[flipped.length - 1];
      setReadinessLive(
        tc("readinessCaptured", {
          label: readinessLabels[landedKey],
          remaining: pendingCount(nextReadiness),
        }),
      );
      setReadinessLiveSeq((n) => n + 1);
    } else {
      setSuppressBadgePing(false);
      setJustSatisfied(null);
    }
  }

  async function handleSimulate(nextSeed?: number) {
    if (!campaignId || spec.outline.length === 0) return;
    const seed = nextSeed ?? simSeed;
    setSimSeed(seed);
    setSimOpen(true);
    setSimLoading(true);
    setSimError(null);
    try {
      const r = await simulateInterview(campaignId, { seed });
      setSim(r);
      if (!r.parse_ok) {
        setSimError(friendlyMessage(new Error("parse_error"), errorsCopy).description);
      }
    } catch (err) {
      setSimError(friendlyMessage(err, errorsCopy).description);
    } finally {
      setSimLoading(false);
    }
  }

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  // Turn a server clarifying-question into the ClarifyPrompt the chip UI reads.
  // Always appends the localized "start drafting now" escape hatch as the last
  // option, so the researcher can override the gate at any point (respects the
  // expert who already knows what they want).
  function clarifyFromAssess(q: AssessClarifyQuestion): ClarifyPrompt {
    return {
      multi: q.multi,
      options: [
        ...q.options.map((o) => ({ id: o.id, label: o.label })),
        { id: GATE_SKIP_ID, label: tc("gateStartNow") },
      ],
      submitLabel: clarifyCopy.submitLabel,
      freeformLabel: clarifyCopy.freeformLabel,
    };
  }

  // Create the campaign once intent is clear, threading the distilled task in so
  // the seeded draft (persona, screener, outline) serves that exact decision.
  // Shared by the "assessment says ready" and "researcher skipped the gate"
  // paths, so both produce a task-anchored study.
  async function createFromTask(agentId: string, goal: string, task: ResearchTask) {
    const derivedTitle = deriveTitle(goal);
    const taskPayload: ResearchTaskInput | undefined =
      task.decision || task.objective || task.audience
        ? { decision: task.decision, objective: task.objective, audience: task.audience }
        : undefined;
    const created = await createCampaign({
      title: derivedTitle,
      goal,
      research_task: taskPayload,
    });
    setCampaignId(created.campaign_id);
    setSpec((s) => ({
      ...s,
      title: derivedTitle,
      goal,
      research_task: taskPayload ?? null,
    }));
    const fetched = await loadSpecWithRetry(created.campaign_id);
    if (fetched) {
      setSpec((s) => {
        const next = mergeServerSpec(s, fetched, derivedTitle);
        // The server seed doesn't echo research_task back yet — keep the one we
        // just distilled so the Task card renders immediately.
        if (taskPayload && !next.research_task) next.research_task = taskPayload;
        applySpecWithDiff(next);
        return next;
      });
      patchMessage(agentId, {
        text: describeSeed(fetched, seedCopy),
        pending: false,
      });
    } else {
      patchMessage(agentId, { text: tc("draftedFallback"), pending: false });
    }
    // The gate is closed — reset its accumulators for the next study.
    inGateRef.current = false;
    priorContextRef.current = "";
    clarifyRoundsRef.current = 0;
  }

  // Run one round of the pre-creation assessment gate. `text` is the
  // researcher's latest input (opening line on round 0, a clarification answer
  // afterwards). Either asks the next clarifying question, or — when intent is
  // clear (or the round ceiling is hit) — creates the study.
  async function runAssessGate(agentId: string, text: string) {
    // Round 0 establishes the seed goal; later rounds accumulate answers.
    if (!inGateRef.current) {
      originalGoalRef.current = text;
      priorContextRef.current = "";
      clarifyRoundsRef.current = 0;
      taskDraftRef.current = { decision: "", objective: "", audience: "" };
    } else {
      priorContextRef.current = `${priorContextRef.current}\n${text}`.trim();
      clarifyRoundsRef.current += 1;
    }
    inGateRef.current = true;

    const goal = originalGoalRef.current;

    // Ask the backend to assess; on any failure fall back to the local gate so
    // creation still gates without a network round-trip.
    let assess: AssessResult | null = null;
    try {
      assess = await assessTask({
        goal,
        prior_context: priorContextRef.current,
      });
    } catch {
      const local = assessReadinessLocal(goal, priorContextRef.current);
      assess = {
        looks_like_research: local.looksLikeResearch,
        clarity_score: local.ready ? 70 : 30,
        decision: "",
        objective: local.objective,
        audience: "",
        missing: [],
        suggested_title: goal.slice(0, 60),
        clarifying_questions: [],
        ready: local.ready,
      };
    }

    // Accumulate whatever the assessment could distill so far.
    taskDraftRef.current = {
      decision: assess.decision || taskDraftRef.current.decision,
      objective: assess.objective || taskDraftRef.current.objective,
      audience: assess.audience || taskDraftRef.current.audience,
    };

    const hitCeiling = clarifyRoundsRef.current >= MAX_CLARIFY_ROUNDS;
    const nextQuestion = assess.clarifying_questions[0];

    if (assess.ready || hitCeiling || !nextQuestion) {
      // Intent is clear enough — create. Prepend a brief "got it" note when we
      // have a decision to state back, so the transition never feels abrupt.
      patchMessage(agentId, { text: tc("gateReady"), pending: true });
      await createFromTask(agentId, goal, taskDraftRef.current);
      return;
    }

    // Not ready — surface the next clarifying question as chips. The researcher
    // steers (or types, or skips) without a study existing yet.
    const notResearch = !assess.looks_like_research;
    patchMessage(agentId, {
      text: notResearch ? tc("gateNotResearch") : nextQuestion.prompt,
      pending: false,
      clarify: clarifyFromAssess(nextQuestion),
    });
  }

  async function handleSend(text: string) {
    setLastFailed(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "respondent", text }]);
    setBusy(true);
    // One pending interviewer bubble covers both paths: it shows typing dots
    // until the first token (or the seed summary) arrives.
    const agentId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: agentId, role: "interviewer", text: "", pending: true }]);
    try {
      if (!campaignId) {
        // The pre-creation gate: assess intent, clarify until clear, and only
        // THEN create. No study exists from a vague first sentence anymore.
        await runAssessGate(agentId, text);
      } else {
        const controller = new AbortController();
        abortRef.current = controller;
        const appendDelta = (delta: string) => {
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.id === agentId) {
              const combined = (last.text ?? "") + delta;
              const cleaned = combined.replace(/<spec_patch>[\s\S]*?(<\/spec_patch>|$)/g, "");
              next[next.length - 1] = { ...last, text: cleaned };
            }
            return next;
          });
        };
        try {
          await refineOutlineStream(campaignId, text, {
            signal: controller.signal,
            onDelta: appendDelta,
            onPatch: (patch) => {
              setSpec((s) => {
                const next = mergeServerSpec(s, patch as ServerSpec);
                applySpecWithDiff(next);
                return next;
              });
            },
            onDone: (summary) => {
              // Consume the persistent guided stage. "audience" → chain the
              // second-beat audience prompt; "closure" → end with a ready-to-
              // publish note. Read from a ref so freeform/Retry paths (which
              // don't thread opts) still advance the guided rhythm.
              const stage = nextStageRef.current;
              nextStageRef.current = null;
              const audience =
                stage === "audience" ? deriveAudienceClarify(clarifyCopy) : undefined;
              // Prefer the model's own summary; otherwise fall back to the
              // stage lead so the bubble is never empty (no dead-end).
              const lead = audience
                ? tc("clarifyLeadAudience")
                : stage === "closure"
                  ? tc("clarifyClosure")
                  : undefined;
              patchMessage(agentId, {
                text: summary || lead || "",
                pending: false,
                clarify: audience,
              });
              // When we chained audience, the NEXT reply closes the loop.
              if (stage === "audience") nextStageRef.current = "closure";
            },
            onError: (message) => {
              setLastFailed(text);
              patchMessage(agentId, {
                role: "system",
                text: tc("streamError", { message }),
                pending: false,
              });
            },
          });
          patchMessage(agentId, { pending: false });
        } catch (err) {
          if (controller.signal.aborted) {
            // Researcher hit Stop — keep whatever streamed in, note the cut.
            setMessages((prev) =>
              prev
                .map((m) =>
                  m.id === agentId
                    ? { ...m, pending: false, text: m.text ? `${m.text}${tc("stoppedSuffix")}` : "" }
                    : m,
                )
                .filter((m) => m.id !== agentId || m.text !== ""),
            );
          } else {
            throw err;
          }
        } finally {
          abortRef.current = null;
        }
      }
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      setLastFailed(text);
      patchMessage(agentId, {
        role: "system",
        text: `${copy.title} — ${copy.description}`,
        pending: false,
      });
    } finally {
      setBusy(false);
    }
  }

  // Skip the pre-creation gate: the researcher chose "start drafting now". Drop
  // the chips and create immediately with whatever task we've distilled so far,
  // honoring the expert who already knows what they want.
  async function handleGateSkip(promptId: string) {
    setMessages((prev) => prev.map((m) => (m.id === promptId ? { ...m, clarify: undefined } : m)));
    if (busy) return;
    setBusy(true);
    const agentId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: agentId, role: "interviewer", text: "", pending: true }]);
    try {
      patchMessage(agentId, { text: tc("gateReady"), pending: true });
      await createFromTask(agentId, originalGoalRef.current, taskDraftRef.current);
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      patchMessage(agentId, {
        role: "system",
        text: `${copy.title} — ${copy.description}`,
        pending: false,
      });
    } finally {
      setBusy(false);
    }
  }

  // A clarify chip resolved to reply text. We strip the chips off the prompt
  // bubble (so it can't be answered twice), then send it. During the
  // pre-creation gate the reply feeds the assessment loop; after creation it
  // chains the guided second-beat (audience) as before.
  function handleClarifySelect(text: string, promptId: string, optionId?: string) {
    // The gate's "start drafting now" escape hatch — bypass assessment entirely.
    if (optionId === GATE_SKIP_ID || text === tc("gateStartNow")) {
      void handleGateSkip(promptId);
      return;
    }
    let wasDecision = false;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== promptId) return m;
        // The decision prompt is the multi-select one; audience is single.
        wasDecision = m.clarify?.multi === true;
        return { ...m, clarify: undefined };
      }),
    );
    // Advance the persistent stage: answering the decision arms the audience
    // second-beat. (Answering audience leaves the ref at "closure", already set
    // by the previous onDone, so the reply lands on the closing note.)
    if (wasDecision) nextStageRef.current = "audience";
    void handleSend(text);
  }

  // A changed guide block gets three non-redundant "just updated" signals so
  // the cue never depends on colour or motion alone (WCAG 1.4.1): the sage
  // flash (sighted), a persistent left accent rail (colour-blind + reduced-
  // motion safe), and an sr-only label (screen readers). `patchSeq` in the key
  // guarantees the one-shot flash replays even when the same block changes on
  // consecutive patches.
  function diffMark(section: string): { className: string; badge: ReactNode; key: string } {
    const isChanged = changed.has(section);
    const badge: ReactNode = isChanged ? (
      <span className="sr-only">{tc("blockUpdated")}</span>
    ) : null;
    return {
      className: isChanged ? "tp-diff-flash tp-diff-rail rounded-card" : "",
      key: `${section}-${isChanged ? patchSeq : "s"}`,
      badge,
    };
  }

  function handleClarifyFreeform(promptId: string) {
    // Drop the chips and hand control to the composer — but remember which
    // stage we were in, so a researcher who types their decision instead of
    // picking a chip still gets the audience second-beat (the escape hatch
    // must not silently break the guided rhythm).
    let wasDecision = false;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== promptId) return m;
        wasDecision = m.clarify?.multi === true;
        return { ...m, clarify: undefined };
      }),
    );
    if (wasDecision) nextStageRef.current = "audience";
    setComposerFocusKey((k) => k + 1);
  }

  // Begin inline-editing one research-task field.
  function startEditTask(field: keyof ResearchTask) {
    if (busy || !spec.research_task) return;
    setEditingTaskField(field);
    setTaskFieldDraft(spec.research_task[field] ?? "");
  }

  // Save an edited task field. Beyond updating the visible task, this re-steers
  // the study: we optimistically patch local state, then send a refine so the
  // agent regenerates the outline/persona/screener to serve the changed task.
  function saveTaskField() {
    const field = editingTaskField;
    if (!field || !spec.research_task) {
      setEditingTaskField(null);
      return;
    }
    const value = taskFieldDraft.trim();
    const prevValue = spec.research_task[field] ?? "";
    setEditingTaskField(null);
    if (value === prevValue) return;

    const nextTask: ResearchTask = { ...spec.research_task, [field]: value };
    setSpec((s) => ({ ...s, research_task: nextTask }));

    if (!campaignId) return; // no study to refine yet (shouldn't happen)
    // Ask the designer to re-align the draft with the edited task. The label
    // names which facet moved so the instruction is specific, not generic.
    const facet = tc(`taskField_${field}` as Parameters<typeof tc>[0]);
    const instruction = tc("taskRefineInstruction", { facet, value });
    void handleSend(instruction);
  }

  function handleRetry() {
    const text = lastFailed;
    if (!text || busy) return;
    setLastFailed(null);
    // Drop the trailing failure notice, keep the original ask visible.
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last?.role === "system") next.pop();
      const secondLast = next[next.length - 1];
      if (secondLast?.role === "respondent" && secondLast.text === text) next.pop();
      return next;
    });
    void handleSend(text);
  }

  async function handlePublish() {
    if (!campaignId) return;
    setPublishing(true);
    try {
      await startCampaign(campaignId);
      router.push(`/studies/${campaignId}?published=1`);
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `${tc("publishFailed")} — ${copy.title}: ${copy.description}`,
        },
      ]);
      setPublishing(false);
    }
  }

  return (
    <div className="h-screen grid grid-cols-12">
      {/* Left: chat pane — a calm one-third rail; the document is the star. */}
      <section className="col-span-4 border-r border-hairline flex flex-col bg-paper">
        <header className="px-6 min-h-14 py-2.5 flex items-center justify-between border-b border-hairline">
          <p className="overline">{tc("designChat")}</p>
          {busy && campaignId && (
            <button
              onClick={handleStop}
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              ■ {tc("stop")}
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-6">
          <ChatFeed
            messages={messages}
            typingLabel={tc("typing")}
            onClarify={handleClarifySelect}
            onClarifyFreeform={handleClarifyFreeform}
            clarifyDisabled={busy}
            clarifyLabels={{
              group: tc("clarifyGroupLabel"),
              count: (n) => tc("clarifyCount", { count: n }),
            }}
          />
          {messages.length === 1 && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted">{tc("tryThese")}</p>
              <div className="flex flex-col items-start gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    disabled={busy}
                    className="rounded-pill border border-hairline bg-paper-elevated px-3.5 py-1.5 text-left text-sm text-body transition-colors hover:border-ink hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {lastFailed && !busy && (
          <div className="flex items-center justify-between border-t border-hairline bg-paper-sunken px-6 py-2.5">
            <p className="text-xs text-muted">{tc("retryHint")}</p>
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              {tc("retry")}
            </Button>
          </div>
        )}
        <ChatComposer
          onSend={handleSend}
          disabled={busy}
          placeholder={tc("chatPlaceholder")}
          sendLabel={tc("send")}
          focusSignal={composerFocusKey}
        />
      </section>

      {/* Right: canvas pane — the wide, elevated-paper research manuscript. */}
      <section className="col-span-8 flex flex-col overflow-hidden">
        <header className="px-8 min-h-14 py-2.5 flex items-center justify-between gap-6 border-b border-hairline">
          <div className="min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <p className="overline">{tc("discussionGuide")}</p>
              <span className="text-xs text-muted">
                ~{spec.estimated_minutes} min · {spec.target_completions} completions
              </span>
              {changeCount > 0 && (
                <span
                  key={changeCount + Array.from(changed).join()}
                  aria-hidden
                  className="tp-chip-in inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 py-1 text-xs text-accent"
                >
                  {/* Suppress the badge ping on any patch where a readiness pip
                      transitions — the pip's own ping IS the change notification
                      (one patch → one flash). Only the badge dot is suppressed;
                      the badge itself still shows. */}
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-accent ${
                      suppressBadgePing ? "" : "tp-ping-once"
                    }`}
                  />
                  {tc("changesTracked", { count: changeCount })}
                </span>
              )}
            </div>
            {/* The readiness spine — wizard-grade certainty without a wizard. */}
            <ReadinessSpine
              pips={readinessPips}
              justSatisfied={justSatisfied}
              label={tc("readinessLabel")}
            />
            {/* One polite live region carries BOTH the guide-change count and the
                readiness transition — SSE updates move no focus, so assistive
                tech needs the spoken equivalent (WCAG 4.1.3). Keyed by a seq so an
                identical utterance still re-announces; readiness wins when it
                just fired (it's the more meaningful event). */}
            <span
              key={`live-${readinessLiveSeq}-${changeCount}-${Array.from(changed).join()}`}
              className="sr-only"
              role="status"
              aria-live="polite"
            >
              {readinessLive || (changeCount > 0 ? tc("guideUpdated", { count: changeCount }) : "")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              loading={simLoading}
              disabled={!campaignId || spec.outline.length === 0}
              onClick={() => handleSimulate()}
            >
              {tc("simulateRespondent")}
            </Button>
            {/* Publish soft-gate: enabled once there's a goal + at least a started
                outline (never trapped). If audience/depth remain open, a muted
                factual hint sits beside publish — never a red error, because
                publishing an incomplete study is a legitimate choice. */}
            {readinessOpen > 0 && campaignId && spec.outline.length > 0 && (
              <span className="text-xs text-muted whitespace-nowrap">
                {tc("readinessOpenHint", { remaining: readinessOpen })}
              </span>
            )}
            <Button
              size="sm"
              loading={publishing}
              disabled={!campaignId || spec.outline.length === 0}
              onClick={handlePublish}
            >
              {tc("publishStudy")}
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 bg-paper-elevated">
          <div className="max-w-3xl mx-auto">
            {/* Auto-growing title: a long zh goal-turned-title must wrap onto a
                second line, never clip off the right edge (a single-line <input>
                truncated it). rows=1 + height sync keeps it flush. */}
            <textarea
              value={spec.title}
              rows={1}
              onChange={(e) => setSpec((s) => ({ ...s, title: e.target.value }))}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              ref={(el) => {
                // Sync height on mount and whenever the seed sets a long title.
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              className="font-display text-4xl leading-tight bg-transparent w-full resize-none overflow-hidden outline-none border-b border-transparent focus:border-hairline pb-2"
            />
            {spec.goal && (
              <p className="text-body mt-3 text-lg leading-relaxed max-w-2xl">{spec.goal}</p>
            )}

            {/* Research Task — the study's north star, a first-class editable
                object. Distilled by the pre-creation gate; editing any facet
                re-steers the whole draft (saveTaskField → refine). */}
            {spec.research_task &&
              (spec.research_task.decision ||
                spec.research_task.objective ||
                spec.research_task.audience) && (
                <div className="mt-6 rounded-card border border-accent/40 bg-accent-soft/40 p-5">
                  <p className="overline mb-3 flex items-center gap-2 text-accent before:h-px before:w-4 before:bg-accent/40 before:content-['']">
                    {tc("researchTask")}
                  </p>
                  <dl className="space-y-2.5">
                    {(["decision", "objective", "audience"] as const).map((field) => {
                      const value = spec.research_task?.[field] ?? "";
                      const isEditing = editingTaskField === field;
                      return (
                        <div
                          key={field}
                          className="grid grid-cols-[4.5rem_1fr] gap-3 items-start"
                        >
                          <dt className="text-xs text-muted pt-1.5 tabular-nums">
                            {tc(`taskField_${field}` as Parameters<typeof tc>[0])}
                          </dt>
                          <dd className="min-w-0">
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={taskFieldDraft}
                                  rows={2}
                                  autoFocus
                                  onChange={(e) => setTaskFieldDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                      e.preventDefault();
                                      saveTaskField();
                                    }
                                    if (e.key === "Escape") setEditingTaskField(null);
                                  }}
                                  className="w-full resize-none rounded-input border border-hairline bg-paper px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={saveTaskField} loading={busy}>
                                    {tc("taskSave")}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingTaskField(null)}
                                  >
                                    {tc("taskCancel")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startEditTask(field)}
                                className="group w-full text-left text-body leading-relaxed rounded-input px-1.5 py-1 -mx-1.5 transition-colors hover:bg-paper disabled:cursor-not-allowed"
                                aria-label={tc("taskEditAria", {
                                  facet: tc(`taskField_${field}` as Parameters<typeof tc>[0]),
                                })}
                              >
                                {value || <span className="text-muted">{tc("taskEmpty")}</span>}
                                <span className="ml-2 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
                                  {tc("taskEditHint")}
                                </span>
                              </button>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}

            {spec.target_persona && (() => {
              const d = diffMark("persona");
              return (
                <Card
                  key={d.key}
                  className={`mt-6 p-4 ${d.className}`}
                >
                  {d.badge}
                  <p className="overline mb-2 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">{tc("targetPersona")}</p>
                  <p className="text-body">{spec.target_persona}</p>
                </Card>
              );
            })()}

            {spec.hypotheses.length > 0 && (() => {
              const d = diffMark("hypotheses");
              return (
              <div key={d.key} className={`mt-8 ${d.className}`}>
                {d.badge}
                <p className="overline mb-3 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">
                  {tc("hypotheses")}
                </p>
                <ul className="space-y-3">
                  {spec.hypotheses.map((h, i) => (
                    // H1/H2/H3 in a true aligned gutter. A wider 2.5rem track and
                    // tabular sans keep the "H" + digit from crowding (the serif
                    // face squeezed them together); sage accent for the marker.
                    <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-3 text-body">
                      <span className="font-medium text-sm tabular-nums leading-relaxed text-accent">
                        H{i + 1}
                      </span>
                      <span className="leading-relaxed">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
              );
            })()}

            {spec.audience_screener.length > 0 && (() => {
              const d = diffMark("screener");
              return (
              <div key={d.key} className={`mt-6 ${d.className}`}>
                {d.badge}
                <p className="overline mb-3 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">{tc("audienceScreener")}</p>
                <div className="flex flex-wrap gap-2">
                  {spec.audience_screener.map((q, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-pill text-xs border border-hairline bg-paper text-body"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>
              );
            })()}

            <div className="mt-10">
              <p className="overline mb-4 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">{tc("questions")}</p>
              {spec.outline.length === 0 ? (
                <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
                  {tc("outlinePlaceholder")}
                </div>
              ) : (
                <ol
                  key={`outline-${changed.has("outline") ? patchSeq : "s"}`}
                  className={`space-y-2.5 ${changed.has("outline") ? "tp-diff-flash tp-diff-rail rounded-card" : ""}`}
                >
                  {changed.has("outline") && <li className="sr-only">{tc("blockUpdated")}</li>}
                  {spec.outline.map((q, i) => (
                    <li
                      key={q.order}
                      // New/changed questions ease down into place under the
                      // conversation — the document reads as *growing*, not
                      // snapping in. Staggered so a fresh batch cascades.
                      // Airy padding + a numbered gutter; the ONLY sage rail here
                      // is the transient diff-flash on the <ol> — resting cards
                      // stay quiet (a permanent accent bar would nag).
                      className={`grid grid-cols-[2rem_1fr] gap-4 rounded-card border border-hairline bg-paper p-5 ${
                        changed.has("outline") ? "tp-guide-grow" : ""
                      }`}
                      style={changed.has("outline") ? { animationDelay: `${i * 45}ms` } : undefined}
                    >
                      <div className="font-mono text-sm text-muted pt-0.5">
                        {String(q.order).padStart(2, "0")}
                      </div>
                      <div>
                        <p className="text-ink leading-relaxed">{q.question}</p>
                        <p className="text-xs text-muted mt-1.5">{tc("goalPrefix")}{q.goal}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {spec.success_criteria.length > 0 && (() => {
              const d = diffMark("criteria");
              return (
              <div key={d.key} className={`mt-10 ${d.className}`}>
                {d.badge}
                <p className="overline mb-3 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">{tc("successCriteria")}</p>
                <ul className="space-y-1.5">
                  {spec.success_criteria.map((c, i) => (
                    <li key={i} className="flex gap-3 text-body">
                      <span className="font-mono text-xs text-muted pt-0.5">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              );
            })()}

            <div className="mt-10">
              <p className="overline mb-4 flex items-center gap-2 before:h-px before:w-4 before:bg-hairline before:content-['']">{tc("delivery")}</p>
              <div className="flex flex-wrap gap-2">
                {ALL_CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    onClick={() =>
                      setSpec((s) => ({
                        ...s,
                        channels: s.channels.includes(ch)
                          ? s.channels.filter((c) => c !== ch)
                          : [...s.channels, ch],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-pill text-sm border transition-colors ${
                      spec.channels.includes(ch)
                        ? "bg-ink text-paper border-ink"
                        : "bg-paper text-body border-hairline hover:border-ink"
                    }`}
                  >
                    {ch.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {simOpen && (
        <div
          className="tp-chrome fixed inset-x-0 bottom-0 z-50 border-t border-hairline shadow-overlay"
          style={{ maxHeight: "60vh" }}
          role="dialog"
          aria-label={tc("simDialogLabel")}
        >
          <div className="h-14 px-6 flex items-center justify-between border-b border-hairline">
            <div className="flex items-center gap-3">
              <p className="overline">{tc("simTitle")}</p>
              {sim?.persona_used && (
                <span className="text-xs text-muted truncate max-w-md">
                  {sim.persona_used}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                loading={simLoading}
                onClick={() => handleSimulate(simSeed + 1)}
              >
                {tc("anotherPersona")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSimOpen(false)}
              >
                {tc("close")}
              </Button>
            </div>
          </div>
          <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(60vh - 3.5rem)" }}>
            <div className="max-w-3xl mx-auto space-y-4">
              {simError && (
                <Card className="p-4 text-sm text-muted">
                  {simError}
                </Card>
              )}
              {simLoading && !sim && (
                <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
                  {tc("simDrafting")}
                </div>
              )}
              {sim?.persona_summary && (
                <Card className="p-4">
                  <p className="overline mb-1">{tc("personaSummary")}</p>
                  <p className="text-body">{sim.persona_summary}</p>
                </Card>
              )}
              {sim?.turns.map((t, i) => (
                <Card key={i} className="p-4">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs text-muted pt-0.5 w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs text-muted">{t.question}</p>
                      <p className="text-ink leading-relaxed">{t.answer}</p>
                    </div>
                  </div>
                </Card>
              ))}
              {sim && sim.turns.length === 0 && !simLoading && !simError && (
                <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
                  {tc("noTurns")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// SSR-safe reduced-motion hook. The spine's one-shot pip ping is gated on this
// (in addition to the CSS reduced-motion query) so we never even *arm* the
// animation for a user who asked for stillness. Starts false on the server and
// first client paint, then syncs — avoids a hydration mismatch.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function deriveTitle(text: string) {
  const t = text.trim();
  const cut = t.slice(0, 60);
  return cut.length < t.length ? `${cut}…` : cut;
}

// The seed summary is the agent's *main* reply after a study is created, so it
// must be fully localized — including ICU plural rules ("1 question" vs "3
// 个问题"). It's a pure function, so localized copy is passed in rather than
// reaching for a hook.
type SeedCopy = {
  questions: (n: number) => string;
  hypotheses: (n: number) => string;
  persona: string;
  separator: string;
  drafted: (parts: string) => string;
  empty: string;
};

function describeSeed(spec: ServerSpec, copy: SeedCopy): string {
  const nQ = spec.outline?.items?.length ?? 0;
  const nH = spec.hypotheses?.length ?? 0;
  const parts = [
    nQ > 0 ? copy.questions(nQ) : "",
    nH > 0 ? copy.hypotheses(nH) : "",
    spec.target_persona ? copy.persona : "",
  ].filter(Boolean);
  if (parts.length === 0) return copy.empty;
  return copy.drafted(parts.join(copy.separator));
}

async function loadSpecWithRetry(id: string): Promise<ServerSpec | null> {
  // Projection is eventually-consistent: create returns immediately, but the
  // projector may need a few tens of ms to write the campaigns row. Retry
  // with short backoff before giving up.
  const delays = [80, 160, 320, 640, 1200];
  for (const d of delays) {
    try {
      const doc = await getCampaign(id);
      const s = doc?.campaign?.spec as ServerSpec | undefined;
      if (s) return s;
    } catch {
      // fall through
    }
    await new Promise((r) => setTimeout(r, d));
  }
  return null;
}

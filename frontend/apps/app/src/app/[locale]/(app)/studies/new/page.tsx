"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Button,
  Card,
  ChatComposer,
  ReadinessSpine,
  type ChatMessage,
  type ClarifyPrompt,
  type ReadinessPip,
} from "@telepace/ui";
import { AgentMessage } from "@/components/agent/AgentMessage";
import { ALL_CHANNELS, CHANNELS } from "@telepace/config";
import {
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
  updateCampaignSettings,
  type AssessResult,
  type AssessClarifyQuestion,
  type RespondentExperienceSettings,
  type ResearchTaskInput,
  type SimulateResponse,
} from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { downloadEvalPack } from "@/lib/evalPack";
import { useErrorsCopy } from "@/components/app/ErrorsCopyContext";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { WelcomeEndConfig } from "@/components/wizard/WelcomeEndConfig";
import {
  EvaluationBlueprint,
  type EvalCaseDraftDoc,
  type EvaluationPlanDoc,
} from "@/components/evaluation/EvaluationBlueprint";

type OutlineItem = {
  order: number;
  question: string;
  goal: string;
  max_followups?: number;
  branch_if_positive?: string | null;
  branch_if_negative?: string | null;
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

type ChannelEntry = { kind: string; config?: Record<string, string> };
type BusyPhase = "assessing" | "drafting" | "loading" | "refining";

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
  evaluation_plan: EvaluationPlanDoc | null;
  candidate_eval_cases: EvalCaseDraftDoc[];
} & Required<RespondentExperienceSettings>;

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
  evaluation_plan: null,
  candidate_eval_cases: [],
  welcome_message: "",
  consent_text: "",
  end_message: "",
  reward_description: "",
  redirect_url: "",
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
  evaluation_plan?: EvaluationPlanDoc | null;
  candidate_eval_cases?: EvalCaseDraftDoc[];
} & RespondentExperienceSettings;

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
  if (patch.evaluation_plan !== undefined) next.evaluation_plan = patch.evaluation_plan;
  if (Array.isArray(patch.candidate_eval_cases))
    next.candidate_eval_cases = patch.candidate_eval_cases;
  if (typeof patch.welcome_message === "string") next.welcome_message = patch.welcome_message;
  if (typeof patch.consent_text === "string") next.consent_text = patch.consent_text;
  if (typeof patch.end_message === "string") next.end_message = patch.end_message;
  if (typeof patch.reward_description === "string")
    next.reward_description = patch.reward_description;
  if (typeof patch.redirect_url === "string") next.redirect_url = patch.redirect_url;
  return next;
}

function questionPriority(item: OutlineItem): number {
  const impact = item.decision_impact ?? 3;
  const uncertainty = item.uncertainty ?? 3;
  const severity = item.severity ?? 3;
  const cost = Math.max(1, item.respondent_cost ?? 2);
  return (impact * uncertainty * severity) / cost;
}

export default function NewStudyPage() {
  const router = useRouter();
  const tc = useTranslations("app.newStudy");
  const errorsCopy = useErrorsCopy();
  // The UI locale ("en" | "zh") — threaded into assess/create so the Designer
  // produces the persona/hypotheses/questions in the language the researcher is
  // actually reading, instead of inferring it from the goal text (which let
  // Chinese content leak onto the English studio).
  const locale = useLocale();

  const initialMessages: ChatMessage[] = [
    { id: "sys-1", role: "system", text: tc("systemGreeting") },
  ];
  const suggestions = [tc("suggestion1"), tc("suggestion2"), tc("suggestion3")];
  const CHANNEL_LABELS: Record<(typeof ALL_CHANNELS)[number], string> = {
    [CHANNELS.webText]: tc("channelWebText"),
    [CHANNELS.webVoice]: tc("channelWebVoice"),
    [CHANNELS.phoneOutbound]: tc("channelPhoneOutbound"),
    [CHANNELS.email]: tc("channelEmail"),
  };

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // The default title is shown in the header before the agent derives one, so
  // it must be localized — a bare "New study" was the one bit of English that
  // leaked into the zh create flow.
  const [spec, setSpec] = useState<Spec>(() => ({ ...INITIAL_SPEC, title: tc("untitledStudy") }));
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState<BusyPhase | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [phaseElapsedSeconds, setPhaseElapsedSeconds] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Respondent-experience settings (welcome/consent/end/reward/redirect) are
  // collapsed by default — most studies never touch them, and showing five
  // more text fields above the publish button by default would bury it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simSeed, setSimSeed] = useState(0);
  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  // Which guide sections changed on the most recent patch — drives the
  // in-place diff flash. Keyed by section id so each block can independently
  // re-trigger its one-shot highlight animation. The block IS the change
  // notification (it highlights in place); we deliberately show NO "~N changes"
  // counter — a number with no exit (there is no revert) only breeds anxiety.
  const [changed, setChanged] = useState<Set<string>>(new Set());
  // Monotonic patch counter — feeds each block's remount key so the one-shot
  // diff-flash / grow animation replays even when the SAME block changes on two
  // consecutive patches (moved.size alone would stay constant and React would
  // skip the remount, leaving the researcher's edit visually unacknowledged).
  const [patchSeq, setPatchSeq] = useState(0);

  // Change rails are an acknowledgement, not permanent decoration. Keep the
  // non-colour cue long enough to notice (including with reduced motion), then
  // return the manuscript to its quiet resting state.
  useEffect(() => {
    if (changed.size === 0) return;
    const timer = window.setTimeout(() => setChanged(new Set()), 1800);
    return () => window.clearTimeout(timer);
  }, [patchSeq, changed.size]);
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
  // A create request may finish on the server after the browser's 30-second
  // deadline. Keep one key across timeout retries so the server returns the
  // original campaign instead of creating a duplicate draft.
  const createIdempotencyKeyRef = useRef<string | null>(null);
  // Anchor the conversation to its latest turn — the old ChatFeed auto-scrolled
  // internally; our own message list needs an explicit end sentinel to keep the
  // newest reply in view as the design chat grows.
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Chat-rail presentation (the conversation is the midwife, the guide is the
  // star). null = no explicit user choice; the default is derived: expanded
  // while no study exists (the whole pre-create gate lives here), then it
  // recedes to a slim recallable strip once the guide is born. true/false = a
  // sticky user override (they pinned it open or closed).
  const [chatExpandedOverride, setChatExpandedOverride] = useState<boolean | null>(null);
  // How many messages the researcher has "seen" — i.e. the count at the moment
  // the rail was last expanded. When a new agent turn arrives while collapsed,
  // messages.length outruns this and the strip shows an unread dot so a pending
  // clarify is never hidden behind the collapsed rail.
  const seenLenRef = useRef<number>(0);

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
  // Preserve the exact evidence gap that produced the current chips. Sending
  // only a bare answer back made the intake model occasionally ask the same
  // question twice because it could not tell what the answer referred to.
  const lastGateQuestionRef = useRef<{ id: string; prompt: string } | null>(null);
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

  const prefersReducedMotion = usePrefersReducedMotion();

  function startBusyPhase(phase: BusyPhase) {
    setBusyPhase(phase);
    setPhaseStartedAt(Date.now());
    setPhaseElapsedSeconds(0);
  }

  useEffect(() => {
    if (!busy || phaseStartedAt === null) return;
    const updateElapsed = () => {
      setPhaseElapsedSeconds(Math.floor((Date.now() - phaseStartedAt) / 1000));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [busy, phaseStartedAt]);

  // A template card on the studies empty state arrives with ?seed=<goal> —
  // the researcher already "spoke" their opening line by choosing it, so we
  // feed it straight into the design conversation (through the same
  // assessment gate as a typed opener). Consumed exactly once per mount.
  const searchParams = useSearchParams();
  const seedConsumedRef = useRef(false);
  useEffect(() => {
    const seed = searchParams.get("seed")?.trim();
    if (!seed || seedConsumedRef.current || campaignId || busy) return;
    seedConsumedRef.current = true;
    void handleSend(seed);
    // handleSend is stable-enough for a run-once seed; listing it would force
    // useCallback plumbing through half the component for no behavior change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const readiness = deriveReadiness(spec);

  // The rail is expanded through the whole pre-create gate (all clarify chips
  // live here), then recedes once a study exists — unless the researcher has
  // pinned it. A pure derivation, so the collapse happens without an effect
  // (no flicker, no extra render).
  const chatExpanded = chatExpandedOverride ?? !campaignId;
  // A new agent turn arrived while the rail was collapsed → surface an unread
  // dot so a pending clarify is never hidden. While expanded, we stay caught up.
  const hasUnread = !chatExpanded && messages.length > seenLenRef.current;
  useEffect(() => {
    if (chatExpanded) seenLenRef.current = messages.length;
  }, [chatExpanded, messages.length]);

  // Keep the newest turn in view as the conversation grows (replaces ChatFeed's
  // internal auto-scroll). Depends on the last message's text so streamed
  // deltas keep the tail pinned, not just new-message arrivals.
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, lastMsg?.text, lastMsg?.pending]);

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

  // The pips the spine actually renders. "who pays" only applies to pricing
  // studies; on everything else deriveReadiness marks it `na`. Rather than draw
  // a greyed, minus-sign stub among the green checks (a "lost tooth"), we drop
  // it from the spine entirely and let it appear — as a real, required step —
  // only when the study is a pricing one. deriveReadiness/READINESS_ORDER are
  // unchanged (pendingCount + tests still rely on the full five-pip model);
  // this is purely what the header chooses to show.
  const spineOrder = useMemo<Array<keyof Readiness>>(
    () => READINESS_ORDER.filter((k) => k !== "whopays" || readiness.whopays !== "na"),
    [readiness.whopays],
  );

  // The pips array the presentational spine renders — labels + live status,
  // built from the derived readiness in applicable-spine order.
  const readinessPips = useMemo<ReadinessPip[]>(
    () =>
      spineOrder.map((k) => ({
        key: k,
        label: readinessLabels[k],
        status: readiness[k],
      })),
    [spineOrder, readiness, readinessLabels],
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
    if (JSON.stringify(next.evaluation_plan) !== JSON.stringify(prev.evaluation_plan))
      moved.add("evaluation");
    if (JSON.stringify(next.candidate_eval_cases) !== JSON.stringify(prev.candidate_eval_cases))
      moved.add("cases");
    prevSpecRef.current = next;

    // Readiness spine: did any pip newly flip to satisfied on this patch?
    const nextReadiness = deriveReadiness(next);
    const flipped = readinessDelta(prevReadinessRef.current, nextReadiness);
    prevReadinessRef.current = nextReadiness;

    if (moved.size > 0) {
      setChanged(moved);
      // Bump the sequence so consecutive edits to the same block still remount
      // and replay their highlight.
      setPatchSeq((n) => n + 1);
    }

    // A readiness pip landing is the one meaningful header cue — ping it and
    // announce it. (There is no competing changes-badge anymore; the guide
    // blocks flash in place, which is the "what changed" answer.)
    if (flipped.length > 0) {
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
    startBusyPhase("drafting");
    const derivedTitle = deriveTitle(goal);
    const taskPayload: ResearchTaskInput | undefined =
      task.decision || task.objective || task.audience
        ? { decision: task.decision, objective: task.objective, audience: task.audience }
        : undefined;
    const idempotencyKey =
      createIdempotencyKeyRef.current ?? crypto.randomUUID();
    createIdempotencyKeyRef.current = idempotencyKey;
    const created = await createCampaign(
      {
        title: derivedTitle,
        goal,
        research_task: taskPayload,
        // Content language follows the UI locale (fixes zh content on /en).
        language: locale,
        // Persist the delivery selection at create time — the pills used to be
        // dead local state that never reached the server; now the choice is real
        // and drives which channels are dispatchable after publish.
        channels: spec.channels,
      },
      { idempotencyKey },
    );
    createIdempotencyKeyRef.current = null;
    startBusyPhase("loading");
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
      lastGateQuestionRef.current = null;
    } else {
      const lastQuestion = lastGateQuestionRef.current;
      const labeledAnswer = lastQuestion
        ? `Question (${lastQuestion.id}): ${lastQuestion.prompt}\nAnswer: ${text}`
        : `Answer: ${text}`;
      priorContextRef.current = `${priorContextRef.current}\n${labeledAnswer}`.trim();
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
        // Clarifying questions come back in the researcher's UI language.
        language: locale,
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
    // A structured option already carries a trustworthy answer to the gap that
    // was asked. Keep it even if an upstream model fails to copy it into the
    // matching field on the next assessment round.
    const answeredGap = lastGateQuestionRef.current?.id.toLowerCase() ?? "";
    if (answeredGap.includes("decision") && !taskDraftRef.current.decision) {
      taskDraftRef.current.decision = text;
    }
    if (
      (answeredGap.includes("audience") || answeredGap.includes("authority")) &&
      !taskDraftRef.current.audience
    ) {
      taskDraftRef.current.audience = text;
    }

    const hitCeiling = clarifyRoundsRef.current >= MAX_CLARIFY_ROUNDS;
    let nextQuestion = assess.clarifying_questions[0];
    // A network fallback or malformed model response must not silently turn a
    // missing decision/authority into a completed blueprint.
    if (!nextQuestion && !taskDraftRef.current.decision) {
      nextQuestion = {
        id: "release_decision",
        prompt:
          locale === "zh"
            ? "这套评测最终要支持哪个发布或变更决策？"
            : "Which release or change decision must this evaluation support?",
        multi: false,
        options: [],
        allow_freeform: true,
      };
    } else if (!nextQuestion && !taskDraftRef.current.audience) {
      nextQuestion = {
        id: "correctness_authority",
        prompt:
          locale === "zh"
            ? "谁或哪份政策有权定义这个场景中的正确行为？"
            : "Who or which policy has authority to define correct behavior here?",
        multi: false,
        options: [],
        allow_freeform: true,
      };
    }
    const taskComplete = Boolean(
      taskDraftRef.current.decision &&
        taskDraftRef.current.objective &&
        taskDraftRef.current.audience,
    );

    if (assess.ready || (hitCeiling && taskComplete) || (!nextQuestion && taskComplete)) {
      // Intent is clear enough — create. Prepend a brief "got it" note when we
      // have a decision to state back, so the transition never feels abrupt.
      patchMessage(agentId, { text: tc("gateReady"), pending: true });
      await createFromTask(agentId, goal, taskDraftRef.current);
      lastGateQuestionRef.current = null;
      return;
    }

    // Not ready — surface the next clarifying question as chips. The researcher
    // steers (or types, or skips) without a study existing yet.
    const notResearch = !assess.looks_like_research;
    lastGateQuestionRef.current = { id: nextQuestion.id, prompt: nextQuestion.prompt };
    patchMessage(agentId, {
      text: notResearch ? tc("gateNotResearch") : nextQuestion.prompt,
      pending: false,
      clarify: clarifyFromAssess(nextQuestion),
    });
  }

  async function handleSend(text: string) {
    if (!campaignId && lastFailed && text !== lastFailed) {
      createIdempotencyKeyRef.current = null;
    }
    setLastFailed(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "respondent", text }]);
    setBusy(true);
    startBusyPhase(campaignId ? "refining" : "assessing");
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
        text: `${copy.title}: ${copy.description}`,
        pending: false,
      });
    } finally {
      setBusy(false);
      setBusyPhase(null);
      setPhaseStartedAt(null);
      setPhaseElapsedSeconds(0);
    }
  }

  // Skip the pre-creation gate: the researcher chose "start drafting now". Drop
  // the chips and create immediately with whatever task we've distilled so far,
  // honoring the expert who already knows what they want.
  async function handleGateSkip(promptId: string) {
    setMessages((prev) => prev.map((m) => (m.id === promptId ? { ...m, clarify: undefined } : m)));
    if (busy) return;
    setBusy(true);
    startBusyPhase("drafting");
    const agentId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: agentId, role: "interviewer", text: "", pending: true }]);
    try {
      patchMessage(agentId, { text: tc("gateReady"), pending: true });
      await createFromTask(agentId, originalGoalRef.current, taskDraftRef.current);
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      patchMessage(agentId, {
        role: "system",
        text: `${copy.title}: ${copy.description}`,
        pending: false,
      });
    } finally {
      setBusy(false);
      setBusyPhase(null);
      setPhaseStartedAt(null);
      setPhaseElapsedSeconds(0);
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
      className: isChanged ? "tp-diff-flash tp-diff-rail" : "",
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

  // Update local state immediately for a responsive Textarea/Input, then
  // debounce the actual PATCH so a keystroke doesn't fire a request per
  // character — matches the "save on pause" pattern respondents' own text
  // composer doesn't need but a multi-field settings form does.
  function handleSettingsChange(patch: RespondentExperienceSettings) {
    setSpec((s) => ({ ...s, ...patch }));
    if (!campaignId) return;
    if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      void updateCampaignSettings(campaignId, patch).catch(() => {
        /* best-effort: the field keeps its local value, next edit retries */
      });
    }, 600);
  }

  async function handlePublish() {
    if (!campaignId) return;
    setPublishing(true);
    try {
      // Start returns which of the persisted channels are actually
      // dispatchable (email/sms/phone) — hand them to the study page so it can
      // point at the real, separate dispatch step instead of pretending the
      // publish click already sent anything.
      const res = await startCampaign(campaignId);
      const dispatchable = (res?.dispatchable_channels ?? []).join(",");
      const query = dispatchable ? `?published=1&dispatch=${dispatchable}` : "?published=1";
      router.push(`/studies/${campaignId}${query}`);
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `${tc("publishFailed")}: ${copy.title}. ${copy.description}`,
        },
      ]);
      setPublishing(false);
    }
  }

  async function handleExport() {
    if (!campaignId || exporting) return;
    setExporting(true);
    try {
      await downloadEvalPack(campaignId);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: tc("exportSuccessDescription"),
        },
      ]);
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `${tc("exportFailTitle")}: ${copy.description}`,
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  const guideMaterializing =
    busy &&
    spec.outline.length === 0 &&
    (busyPhase === "assessing" || busyPhase === "drafting" || busyPhase === "loading");
  const busyPhaseLabel = busyPhase
    ? tc(
        busyPhase === "assessing"
          ? "phaseAssessing"
          : busyPhase === "drafting"
            ? "phaseDrafting"
            : busyPhase === "loading"
              ? "phaseLoading"
              : "phaseRefining",
      )
    : "";

  // A fixed workbench: the root is pinned to <main> via `absolute inset-0` so
  // it's exactly the viewport minus the sidebar, and scrolling happens only
  // inside each pane. On narrow screens the pre-creation chat owns the stage;
  // after the guide exists it becomes a horizontal recall bar above the paper.
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden lg:flex-row">
      {/* The studio's visual title is the editable <textarea> below — a form
          control, so it gives screen readers no landmark to jump to and the
          page had no <h1> at all. This names the page for AT without putting a
          second, competing title on screen. */}
      <h1 className="sr-only">{tc("pageHeading")}</h1>
      {/* Left: the design conversation as a RECALLABLE rail. Before a study
          exists it's the full stage (the whole pre-create gate lives here);
          once the guide is born it recedes to a slim strip so the document
          becomes the star, and expands again on click. Width animates; the
          chat stays mounted so messages, scroll, and composer focus survive a
          collapse and it's instantly re-grabbable. */}
      <div
        className={`relative flex shrink-0 flex-col border-b border-hairline bg-paper transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:h-auto lg:border-b-0 lg:border-r ${
          chatExpanded
            ? campaignId
              ? "h-[42dvh] w-full lg:w-[380px]"
              : "h-full w-full lg:w-[380px]"
            : "h-12 w-full lg:w-12"
        }`}
      >
        {/* Collapsed strip — a quiet spine: expand affordance, a rotated
            "Design chat" label, and an unread dot when an agent turn landed
            while collapsed. The whole strip is the expand hit target. */}
        {!chatExpanded && (
          <button
            type="button"
            onClick={() => setChatExpandedOverride(true)}
            aria-label={tc("expandChat")}
            className="group absolute inset-0 flex flex-row items-center gap-3 px-4 transition-colors hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent lg:flex-col lg:px-0 lg:py-4"
          >
            <span
              aria-hidden
              className="text-muted transition-colors group-hover:text-ink"
            >
              ⟩
            </span>
            <span
              aria-hidden
              className="tp-study-chrome-label whitespace-nowrap text-muted lg:[writing-mode:vertical-rl]"
            >
              {tc("designChat")}
            </span>
            {(hasUnread || busy) && (
              <span
                aria-hidden
                className={`ml-auto h-1.5 w-1.5 rounded-full bg-accent lg:ml-0 lg:mt-1 ${busy ? "tp-pulse-slow" : ""}`}
              />
            )}
          </button>
        )}

        {/* Expanded chat — the full conversation surface. Hidden (not
            unmounted) when collapsed so its state is preserved. */}
        <section className={`flex min-h-0 flex-1 flex-col ${chatExpanded ? "" : "hidden"}`}>
        <header className="px-6 min-h-14 py-2.5 flex items-center justify-between border-b border-hairline">
          <p className="tp-study-chrome-label">{tc("designChat")}</p>
          <div className="flex items-center gap-3">
          {busy && campaignId && (
            <button
              onClick={handleStop}
              className="text-xs text-muted hover:text-ink transition-[color,background-color,border-color,transform] duration-150 tp-press tp-press-control motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              ■ {tc("stop")}
            </button>
          )}
          {/* Collapse the rail — only offered once a study exists (before that
              the conversation is the whole task and mustn't be hidden). */}
          {campaignId && (
            <button
              type="button"
              onClick={() => setChatExpandedOverride(false)}
              aria-label={tc("collapseChat")}
              className="text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              ‹
            </button>
          )}
          </div>
        </header>
        {busy && busyPhase && (
          <div className="border-b border-hairline bg-paper-sunken px-6 py-3">
            <span className="sr-only" role="status" aria-live="polite">
              {tc(
                busyPhase === "assessing"
                  ? "phaseAssessing"
                  : busyPhase === "drafting"
                    ? "phaseDrafting"
                    : busyPhase === "loading"
                      ? "phaseLoading"
                      : "phaseRefining",
              )}
              {phaseElapsedSeconds >= 20 ? ` ${tc("phaseSlow")}` : ""}
            </span>
            <div aria-hidden className="flex items-center gap-2 text-xs text-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent tp-pulse-slow" />
              <span className="text-body">
                {tc(
                  busyPhase === "assessing"
                    ? "phaseAssessing"
                    : busyPhase === "drafting"
                      ? "phaseDrafting"
                      : busyPhase === "loading"
                        ? "phaseLoading"
                        : "phaseRefining",
                )}
              </span>
              <span>·</span>
              <span>{tc("phaseElapsed", { seconds: phaseElapsedSeconds })}</span>
            </div>
            {phaseElapsedSeconds >= 20 && (
              <p aria-hidden className="mt-1.5 text-xs leading-relaxed text-muted">
                {tc("phaseSlow")}
              </p>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6">
          {/* The design conversation — quiet copilot prose, NOT the interview
              ChatFeed's serif "hero" question. The designer agent's clarifying
              questions read as ordinary assistant turns with answer chips. */}
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="flex flex-col gap-4 py-5"
          >
            {messages.map((m) => (
              <AgentMessage
                key={m.id}
                message={m}
                typingLabel={tc("typing")}
                onClarify={handleClarifySelect}
                onClarifyFreeform={handleClarifyFreeform}
                clarifyDisabled={busy}
                clarifyLabels={{
                  group: tc("clarifyGroupLabel"),
                  count: (n) => tc("clarifyCount", { count: n }),
                }}
              />
            ))}
            <div ref={chatEndRef} />
          </div>
          {messages.length === 1 && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted">{tc("tryThese")}</p>
              <div className="flex flex-col items-start gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    disabled={busy}
                    className="rounded-pill border border-hairline bg-paper-elevated px-3.5 py-1.5 text-left text-sm text-body transition-[color,background-color,border-color,transform] duration-150 hover:border-ink hover:text-ink tp-press tp-press-control motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
      </div>

      {/* Right: canvas pane — the wide, elevated-paper research manuscript.
          It takes the full remaining stage (flex-1) — the star of the studio. */}
      <section
        className={`${campaignId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}
      >
        <header className="flex min-h-14 flex-col items-stretch justify-between gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 lg:px-8">
          <div className="min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <p className="tp-study-chrome-label">{tc("discussionGuide")}</p>
              <span className="hidden text-xs text-muted md:inline">
                {tc("canvasMeta", {
                  minutes: spec.estimated_minutes,
                  completions: spec.target_completions,
                })}
              </span>
            </div>
            {/* The readiness spine — wizard-grade certainty without a wizard. */}
            <ReadinessSpine
              pips={readinessPips}
              justSatisfied={justSatisfied}
              label={tc("readinessLabel")}
            />
            {/* A polite live region carries the readiness transition — SSE
                updates move no focus, so assistive tech needs the spoken
                equivalent (WCAG 4.1.3). Keyed by a seq so an identical
                utterance still re-announces. (The per-block diff flash carries
                "what changed" visually; there is no change-count to announce.) */}
            <span
              key={`live-${readinessLiveSeq}`}
              className="sr-only"
              role="status"
              aria-live="polite"
            >
              {readinessLive}
            </span>
          </div>
          {/* The header keeps only the lightweight "preview a respondent"
              action. Publishing lives at the end of the manuscript in the
              LaunchPanel — one honest launch moment, not a second CTA up here
              competing with it. */}
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={exporting}
              disabled={!campaignId || !spec.evaluation_plan}
              onClick={handleExport}
            >
              {exporting ? tc("exportingEvalPack") : tc("exportEvalPack")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={simLoading}
              disabled={!campaignId || spec.outline.length === 0}
              onClick={() => handleSimulate()}
            >
              {tc("simulateRespondent")}
            </Button>
          </div>
        </header>

        <div className="tp-study-desk relative flex-1 overflow-y-auto px-3 py-4 sm:p-6 lg:p-8">
          {guideMaterializing ? (
            <GuideGeneratingState
              title={spec.title !== tc("untitledStudy") ? spec.title : ""}
              goal={spec.goal}
              phase={busyPhaseLabel}
              elapsed={tc("phaseElapsed", { seconds: phaseElapsedSeconds })}
              slow={phaseElapsedSeconds >= 20 ? tc("phaseSlow") : ""}
            />
          ) : !campaignId && !spec.goal ? (
            <CanvasEmptyState
              title={tc("canvasEmptyTitle")}
              body={tc("canvasEmptyBody")}
            />
          ) : (
          <article className="tp-study-sheet mx-auto min-h-full max-w-[860px] px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
            {/* Auto-growing title: a long zh goal-turned-title must wrap onto a
                second line, never clip off the right edge (a single-line <input>
                truncated it). rows=1 + height sync keeps it flush. */}
            <div className="tp-study-emerge" style={{ animationDelay: "40ms" }}>
              <textarea
                value={spec.title}
                aria-label={tc("untitledStudy")}
                rows={1}
                onChange={(e) => setSpec((s) => ({ ...s, title: e.target.value }))}
                onBlur={(e) => {
                  const title = e.currentTarget.value.trim();
                  if (campaignId && title) {
                    void updateCampaignSettings(campaignId, { title }).catch(() => {
                      /* best-effort: the next blur retries */
                    });
                  }
                }}
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
                className="w-full resize-none overflow-hidden border-b border-transparent bg-transparent pb-2 font-display text-3xl leading-tight outline-none transition-colors focus:border-hairline sm:text-4xl lg:text-[2.65rem]"
              />
              {spec.goal && (
                <p className="mt-3 max-w-2xl text-base leading-[1.75] text-body sm:text-lg">
                  {spec.goal}
                </p>
              )}
            </div>

            {/* Research Task — the study's north star, a first-class editable
                object. Distilled by the pre-creation gate; editing any facet
                re-steers the whole draft (saveTaskField → refine). */}
            {spec.research_task &&
              (spec.research_task.decision ||
                spec.research_task.objective ||
                spec.research_task.audience) && (
                <div
                  className="tp-study-callout tp-study-emerge mt-8 p-5 sm:p-6"
                  style={{ animationDelay: "120ms" }}
                >
                  <p className="tp-study-section-label mb-4 text-accent">
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
                                className="group -mx-1.5 w-full rounded-input px-1.5 py-1 text-left leading-relaxed text-body transition-[color,background-color,border-color,transform] duration-150 hover:bg-paper/80 disabled:cursor-not-allowed tp-press tp-press-control motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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

            {spec.evaluation_plan && (() => {
              const d = diffMark("evaluation");
              return (
                <div
                  key={d.key}
                  className={`tp-study-emerge ${d.className}`}
                  style={{ animationDelay: "160ms" }}
                >
                  {d.badge}
                  <EvaluationBlueprint
                    plan={spec.evaluation_plan}
                    cases={spec.candidate_eval_cases}
                  />
                </div>
              );
            })()}

            {spec.target_persona && (() => {
              const d = diffMark("persona");
              return (
                <div
                  key={d.key}
                  className={`tp-study-section tp-study-section-lined tp-study-emerge mt-9 ${d.className}`}
                  style={{ animationDelay: "180ms" }}
                >
                  {d.badge}
                  <p className="tp-study-section-label mb-3">{tc("targetPersona")}</p>
                  <p className="max-w-2xl leading-[1.75] text-body">{spec.target_persona}</p>
                </div>
              );
            })()}

            {spec.hypotheses.length > 0 && (() => {
              const d = diffMark("hypotheses");
              return (
              <div
                key={d.key}
                className={`tp-study-section tp-study-emerge mt-9 ${d.className}`}
                style={{ animationDelay: "240ms" }}
              >
                {d.badge}
                <p className="tp-study-section-label mb-4">
                  {tc("hypotheses")}
                </p>
                <ul className="space-y-3.5">
                  {spec.hypotheses.map((h, i) => (
                    // H1/H2/H3 in a true aligned gutter. A wider 2.5rem track and
                    // tabular sans keep the "H" + digit from crowding (the serif
                    // face squeezed them together); sage accent for the marker.
                    <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-3 text-body">
                      <span className="pt-px text-xs font-semibold tabular-nums leading-relaxed text-accent">
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
              <div
                key={d.key}
                className={`tp-study-section tp-study-emerge mt-9 ${d.className}`}
                style={{ animationDelay: "300ms" }}
              >
                {d.badge}
                <p className="tp-study-section-label mb-4">{tc("audienceScreener")}</p>
                <div className="flex flex-wrap gap-2">
                  {spec.audience_screener.map((q, i) => (
                    <span
                      key={i}
                      className="rounded-pill border border-hairline bg-paper/70 px-3 py-1.5 text-xs leading-relaxed text-body"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>
              );
            })()}

            <div
              className="tp-study-section tp-study-section-lined tp-study-emerge mt-12"
              style={{ animationDelay: "360ms" }}
            >
              <p className="tp-study-section-label mb-4">{tc("questions")}</p>
              {spec.outline.length === 0 ? (
                <div className="border-y border-dashed border-hairline py-8 text-center text-muted">
                  {tc("outlinePlaceholder")}
                </div>
              ) : (
                <ol
                  key={`outline-${changed.has("outline") ? patchSeq : "s"}`}
                  className={`tp-study-question-list ${changed.has("outline") ? "tp-diff-flash tp-diff-rail" : ""}`}
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
                      className={`tp-study-question grid grid-cols-[2rem_1fr] gap-4 px-3 py-5 ${
                        changed.has("outline") ? "tp-guide-grow" : ""
                      }`}
                      style={changed.has("outline") ? { animationDelay: `${i * 45}ms` } : undefined}
                    >
                      <div className="pt-0.5 font-mono text-xs tabular-nums text-muted">
                        {String(q.order).padStart(2, "0")}
                      </div>
                      <div>
                        {(q.evidence_target || q.authority) && (
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {q.evidence_target && (
                              <span className="rounded-pill bg-accent-soft/65 px-2 py-0.5 font-mono text-[10px] text-accent">
                                {q.evidence_target}
                              </span>
                            )}
                            {q.authority && (
                              <span className="rounded-pill border border-hairline px-2 py-0.5 text-[10px] font-medium text-muted">
                                {tc(`authority_${q.authority}`)}
                              </span>
                            )}
                            <span className="ml-auto font-mono text-[10px] text-muted">
                              {tc("questionPriority", {
                                value: questionPriority(q).toFixed(1),
                              })}
                            </span>
                          </div>
                        )}
                        <p className="leading-[1.7] text-ink">{q.question}</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted">{tc("goalPrefix")}{q.goal}</p>
                        {(q.ask_when || q.stop_when) && (
                          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            {q.ask_when && (
                              <div>
                                <dt className="font-semibold text-body">{tc("questionAskWhen")}</dt>
                                <dd className="mt-0.5 leading-relaxed text-muted">{q.ask_when}</dd>
                              </div>
                            )}
                            {q.stop_when && (
                              <div>
                                <dt className="font-semibold text-body">{tc("questionStopWhen")}</dt>
                                <dd className="mt-0.5 leading-relaxed text-muted">{q.stop_when}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {spec.success_criteria.length > 0 && (() => {
              const d = diffMark("criteria");
              return (
              <div
                key={d.key}
                className={`tp-study-section tp-study-emerge mt-10 ${d.className}`}
                style={{ animationDelay: "430ms" }}
              >
                {d.badge}
                <p className="tp-study-section-label mb-3">{tc("successCriteria")}</p>
                <ul className="space-y-2">
                  {spec.success_criteria.map((c, i) => (
                    <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 text-body">
                      <span className="pt-0.5 font-mono text-xs tabular-nums text-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              );
            })()}

            {/* Respondent experience — welcome/consent/end/reward/redirect.
                Collapsed by default and placed just above Launch: it's part
                of preparing to publish, not part of the outline itself. */}
            {campaignId && (
              <div
                className="tp-study-section tp-study-section-lined tp-study-emerge mt-12"
                style={{ animationDelay: "500ms" }}
              >
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="group flex w-full items-center justify-between text-left tp-press tp-press-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-expanded={settingsOpen}
                >
                  <span className="tp-study-section-label text-body">
                    {tc("respondentExperienceTitle")}
                  </span>
                  <span className="text-xs text-muted transition-colors group-hover:text-ink">
                    {settingsOpen
                      ? tc("respondentExperienceCollapse")
                      : tc("respondentExperienceExpand")}
                  </span>
                </button>
                {settingsOpen && (
                  <Card className="mt-3 p-5">
                    <p className="mb-5 text-sm text-muted">
                      {tc("respondentExperienceSubtitle")}
                    </p>
                    <WelcomeEndConfig spec={spec} onChange={handleSettingsChange} />
                  </Card>
                )}
              </div>
            )}

            {/* Launch — the delivery plan promoted from a footer afterthought
                to the closing moment of the manuscript. This is the product's
                soul (voice-native, agent-first), so it reads as *launching*:
                pick how the study reaches people, see honestly what each channel
                does, then publish. Anchored here because it's where the
                researcher finishes reading the guide and decides to ship. */}
            <LaunchPanel
              channels={spec.channels}
              onToggleChannel={(ch) =>
                setSpec((s) => ({
                  ...s,
                  channels: s.channels.includes(ch)
                    ? s.channels.filter((c) => c !== ch)
                    : [...s.channels, ch],
                }))
              }
              channelLabels={CHANNEL_LABELS}
              onPublish={handlePublish}
              publishing={publishing}
              canPublish={!!campaignId && readinessOpen === 0}
              openReadiness={readinessOpen}
              copy={{
                title: tc("launchTitle"),
                subtitle: tc("launchSubtitle"),
                consequenceLink: tc("deliveryConsequenceLink"),
                consequenceDispatch: tc("deliveryConsequenceDispatch"),
                publishGetLink: tc("publishGetLink"),
                publishAndDispatch: tc("publishStudy"),
                dispatchSubline: tc("publishThenDispatch"),
                openHint: (n) => tc("readinessOpenHint", { remaining: n }),
              }}
            />
          </article>
          )}
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

/**
 * The in-progress manuscript. It deliberately uses stable ruled shapes rather
 * than a shimmer: each region arrives once, while one quiet cursor breathes to
 * indicate that drafting is still active. The outline mirrors the final
 * document, so the handoff from generation to content preserves spatial memory.
 */
function GuideGeneratingState({
  title,
  goal,
  phase,
  elapsed,
  slow,
}: {
  title: string;
  goal: string;
  phase: string;
  elapsed: string;
  slow: string;
}) {
  return (
    <div className="tp-study-sheet mx-auto min-h-full max-w-[860px] px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
      <div role="status" aria-live="polite" className="mb-10 flex items-start justify-between gap-6">
        <div>
          <p className="tp-study-section-label text-accent">{phase}</p>
          {slow && <p className="mt-2 max-w-lg text-xs leading-relaxed text-muted">{slow}</p>}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted">{elapsed}</span>
      </div>

      <div aria-hidden className="max-w-2xl">
        {title ? (
          <p className="max-w-xl font-display text-3xl leading-tight text-ink sm:text-4xl">
            {title}
          </p>
        ) : (
          <div
            className="tp-study-sketch-line h-9 w-[74%]"
            style={{ animationDelay: "40ms" }}
          />
        )}
        {goal ? (
          <p className="mt-4 max-w-xl text-base leading-[1.75] text-body">{goal}</p>
        ) : (
          <div className="mt-5 space-y-2.5">
            <div
              className="tp-study-sketch-line h-2.5 w-full"
              style={{ animationDelay: "100ms" }}
            />
            <div
              className="tp-study-sketch-line h-2.5 w-[84%]"
              style={{ animationDelay: "140ms" }}
            />
          </div>
        )}

        <div
          className="tp-study-callout tp-study-sketch-in mt-9 p-5"
          style={{ animationDelay: "180ms" }}
        >
          <div className="mb-5 flex items-center gap-2">
            <span className="tp-study-writing-cursor h-3.5 w-0.5 bg-accent" />
            <span className="h-2 w-24 rounded-pill bg-accent/25" />
          </div>
          <div className="space-y-4">
            {[92, 76, 84].map((width, index) => (
              <div key={width} className="grid grid-cols-[4rem_1fr] items-center gap-4">
                <span className="h-2 w-10 rounded-pill bg-ink/10" />
                <span
                  className="tp-study-sketch-line h-2.5"
                  style={{
                    width: `${width}%`,
                    animationDelay: `${240 + index * 55}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {[0, 1, 2].map((section) => (
          <div
            key={section}
            className={`tp-study-sketch-in mt-10 ${section === 2 ? "border-t border-hairline pt-7" : ""}`}
            style={{ animationDelay: `${420 + section * 110}ms` }}
          >
            <div className="mb-5 h-2 w-20 rounded-pill bg-ink/10" />
            <div className="space-y-3">
              {[96, 88, 72].slice(0, section === 2 ? 3 : 2).map((width, index) => (
                <div
                  key={`${width}-${index}`}
                  className="grid grid-cols-[2rem_1fr] items-center gap-4 border-b border-hairline/70 pb-3"
                >
                  <span className="h-2 w-4 rounded-pill bg-ink/10" />
                  <span className="tp-study-sketch-line h-2.5" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The canvas before any study exists. Filled bars would read as loading, so the
 * unwritten state uses a real paper surface with a single insertion caret and
 * faint rules. It promises a document without pretending work has begun.
 */
function CanvasEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="tp-study-sheet mx-auto flex min-h-full max-w-[860px] items-center px-6 py-14 sm:px-10 lg:px-14">
      <div className="mx-auto w-full max-w-md text-center">
        <div aria-hidden className="mx-auto mb-8 w-44 text-left opacity-70">
          <span className="mb-4 block h-7 w-px bg-accent" />
          <div className="space-y-3">
            <div className="h-px w-2/3 bg-ink/20" />
            <div className="h-px w-full bg-hairline" />
            <div className="h-px w-[92%] bg-hairline" />
            <div className="h-px w-4/5 bg-hairline" />
          </div>
        </div>
        <p className="font-display text-xl leading-snug text-ink">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

// Which channels are actually *dispatched* to a recipient after publish
// (email/phone place real sends) vs. link channels served by a shareable live
// session (web text / web voice). This drives the honest per-channel copy — we
// never imply publishing dispatches a link channel, nor that a dispatch channel
// goes out on the publish click itself (dispatch is a real, separate step).
const DISPATCH_CHANNELS = new Set<string>([CHANNELS.phoneOutbound, CHANNELS.email]);

type LaunchCopy = {
  title: string;
  subtitle: string;
  consequenceLink: string;
  consequenceDispatch: string;
  publishGetLink: string;
  publishAndDispatch: string;
  dispatchSubline: string;
  openHint: (n: number) => string;
};

/**
 * The launch moment. The delivery plan — how this study reaches people — used
 * to be a footer afterthought; here it's the closing act of the manuscript,
 * paired with the publish action. Each channel states honestly what selecting
 * it means (a shareable live link, or eligible-to-dispatch-after-publish). The
 * publish CTA adapts to the selection but never overpromises: it says "get
 * link" for link-only studies and "publish" (with a dispatch-is-next subline)
 * when a dispatchable channel is on — it never claims to send calls on click.
 */
function LaunchPanel({
  channels,
  onToggleChannel,
  channelLabels,
  onPublish,
  publishing,
  canPublish,
  openReadiness,
  copy,
}: {
  channels: string[];
  onToggleChannel: (ch: (typeof ALL_CHANNELS)[number]) => void;
  channelLabels: Record<(typeof ALL_CHANNELS)[number], string>;
  onPublish: () => void;
  publishing: boolean;
  canPublish: boolean;
  openReadiness: number;
  copy: LaunchCopy;
}) {
  const hasDispatch = channels.some((c) => DISPATCH_CHANNELS.has(c));

  return (
    <div
      className="tp-study-section tp-study-section-lined tp-study-emerge mt-14"
      style={{ animationDelay: "570ms" }}
    >
      <p className="tp-study-section-label mb-1 text-accent">
        {copy.title}
      </p>
      <p className="text-sm leading-relaxed text-muted">{copy.subtitle}</p>

      {/* Channels as a plan, each with its honest consequence line. */}
      <ul className="mt-5 divide-y divide-hairline overflow-hidden rounded-button border border-hairline bg-paper-elevated">
        {ALL_CHANNELS.map((ch) => {
          const on = channels.includes(ch);
          const consequence = DISPATCH_CHANNELS.has(ch)
            ? copy.consequenceDispatch
            : copy.consequenceLink;
          return (
            <li key={ch}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggleChannel(ch)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-[color,background-color,transform] duration-150 tp-press tp-press-row motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                  on
                    ? "bg-accent-soft/80"
                    : "bg-paper-elevated hover:bg-paper-sunken"
                }`}
              >
                {/* Checkbox affordance — a clear on/off, not a bare toggle. */}
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] transition-colors ${
                    on ? "border-accent bg-accent text-paper" : "border-hairline text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${on ? "text-ink" : "text-body"}`}>
                    {channelLabels[ch]}
                  </span>
                  <span className="block text-xs text-muted">{consequence}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Publish — the confident launch. Copy is channel-aware but honest:
          link-only → "get link"; dispatchable on → "publish" + a subline that
          the send happens in the next (dispatch) step. */}
      <div className="mt-5 flex flex-col gap-2">
        {openReadiness > 0 && canPublish && (
          <p className="text-xs text-muted">{copy.openHint(openReadiness)}</p>
        )}
        <Button
          className="w-full"
          loading={publishing}
          disabled={!canPublish}
          onClick={onPublish}
        >
          {hasDispatch ? copy.publishAndDispatch : copy.publishGetLink}
        </Button>
        {hasDispatch && (
          <p className="text-center text-xs text-muted">{copy.dispatchSubline}</p>
        )}
      </div>
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
  const firstSentenceEnd = t.search(/[。！？.!?]/u);
  if (firstSentenceEnd >= 7 && firstSentenceEnd < 60) {
    return t.slice(0, firstSentenceEnd + 1);
  }
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

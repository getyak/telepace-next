"use client";

import { type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ChatFeed, ChatComposer, type ChatMessage } from "@telepace/ui";
import { ALL_CHANNELS, CHANNELS } from "@telepace/config";
import {
  deriveDecisionClarify,
  deriveAudienceClarify,
  type ClarifyCopy,
} from "@/lib/clarify";
import {
  createCampaign,
  getCampaign,
  refineOutlineStream,
  simulateInterview,
  startCampaign,
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

type Spec = {
  title: string;
  goal: string;
  background: string;
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
  const [spec, setSpec] = useState<Spec>(INITIAL_SPEC);
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
  const prevSpecRef = useRef<Spec>(INITIAL_SPEC);

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
    if (moved.size > 0) {
      setChanged(moved);
      setChangeCount(moved.size);
      // Bump the sequence so consecutive edits to the same block still remount
      // and replay their highlight.
      setPatchSeq((n) => n + 1);
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
        const derivedTitle = deriveTitle(text);
        const created = await createCampaign({
          title: derivedTitle,
          goal: text,
        });
        setCampaignId(created.campaign_id);
        setSpec((s) => ({ ...s, title: derivedTitle, goal: text }));
        const fetched = await loadSpecWithRetry(created.campaign_id);
        if (fetched) {
          setSpec((s) => {
            const next = mergeServerSpec(s, fetched, derivedTitle);
            applySpecWithDiff(next);
            return next;
          });
          // The seed landed — now offer the domain-aware first follow-up as
          // chips, so the researcher can steer without composing a sentence.
          const decision = deriveDecisionClarify(text, clarifyCopy);
          patchMessage(agentId, {
            text: decision ? tc("clarifyLeadDecision") : describeSeed(fetched, seedCopy),
            pending: false,
            clarify: decision ?? undefined,
          });
        } else {
          const decision = deriveDecisionClarify(text, clarifyCopy);
          patchMessage(agentId, {
            text: decision ? tc("clarifyLeadDecision") : tc("draftedFallback"),
            pending: false,
            clarify: decision ?? undefined,
          });
        }
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

  // A clarify chip resolved to reply text. We strip the chips off the prompt
  // bubble (so it can't be answered twice), then send it — and, when the first
  // (multi-select decision) prompt is answered, chain the second-beat audience
  // clarification so the conversation keeps its guided momentum.
  function handleClarifySelect(text: string, promptId: string) {
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
      {/* Left: chat pane */}
      <section className="col-span-5 border-r border-hairline flex flex-col bg-paper">
        <header className="px-6 h-14 flex items-center justify-between border-b border-hairline">
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

      {/* Right: canvas pane */}
      <section className="col-span-7 flex flex-col overflow-hidden">
        <header className="px-8 h-14 flex items-center justify-between border-b border-hairline">
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
                <span className="tp-ping-once h-1.5 w-1.5 rounded-full bg-accent" />
                {tc("changesTracked", { count: changeCount })}
              </span>
            )}
            {/* The visual badge + diff-flash are silent to assistive tech: the
                guide updates asynchronously (SSE) without moving focus. This
                polite live region gives SR users the equivalent notification
                (WCAG 4.1.3). Keyed so an identical count still re-announces. */}
            <span key={`live-${changeCount}-${Array.from(changed).join()}`} className="sr-only" role="status" aria-live="polite">
              {changeCount > 0 ? tc("guideUpdated", { count: changeCount }) : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              loading={simLoading}
              disabled={!campaignId || spec.outline.length === 0}
              onClick={() => handleSimulate()}
            >
              {tc("simulateRespondent")}
            </Button>
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
          <div className="max-w-2xl mx-auto">
            <input
              value={spec.title}
              onChange={(e) => setSpec((s) => ({ ...s, title: e.target.value }))}
              className="font-display text-4xl bg-transparent w-full outline-none border-b border-transparent focus:border-hairline pb-2"
            />
            {spec.goal && (
              <p className="text-body mt-3 text-lg leading-relaxed max-w-xl">{spec.goal}</p>
            )}

            {spec.target_persona && (() => {
              const d = diffMark("persona");
              return (
                <div
                  key={d.key}
                  className={`mt-6 rounded-card border border-hairline bg-paper p-4 ${d.className}`}
                >
                  {d.badge}
                  <p className="overline mb-1">{tc("targetPersona")}</p>
                  <p className="text-body">{spec.target_persona}</p>
                </div>
              );
            })()}

            {spec.hypotheses.length > 0 && (() => {
              const d = diffMark("hypotheses");
              return (
              <div key={d.key} className={`mt-6 ${d.className}`}>
                {d.badge}
                <p className="overline mb-2">{tc("hypotheses")}</p>
                <ul className="space-y-1.5">
                  {spec.hypotheses.map((h, i) => (
                    <li key={i} className="flex gap-3 text-body">
                      <span className="font-mono text-xs text-muted pt-0.5">H{i + 1}</span>
                      <span>{h}</span>
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
                <p className="overline mb-2">{tc("audienceScreener")}</p>
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
              <p className="overline mb-4">{tc("questions")}</p>
              {spec.outline.length === 0 ? (
                <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
                  {tc("outlinePlaceholder")}
                </div>
              ) : (
                <ol
                  key={`outline-${changed.has("outline") ? patchSeq : "s"}`}
                  className={`space-y-3 ${changed.has("outline") ? "tp-diff-flash tp-diff-rail rounded-card" : ""}`}
                >
                  {changed.has("outline") && <li className="sr-only">{tc("blockUpdated")}</li>}
                  {spec.outline.map((q, i) => (
                    <li
                      key={q.order}
                      // New/changed questions ease down into place under the
                      // conversation — the document reads as *growing*, not
                      // snapping in. Staggered so a fresh batch cascades.
                      className={`rounded-card border border-hairline bg-paper p-4 ${
                        changed.has("outline") ? "tp-guide-grow" : ""
                      }`}
                      style={changed.has("outline") ? { animationDelay: `${i * 45}ms` } : undefined}
                    >
                      <div className="flex gap-4">
                        <div className="font-mono text-sm text-muted w-6 pt-0.5">
                          {String(q.order).padStart(2, "0")}
                        </div>
                        <div className="flex-1">
                          <p className="text-ink">{q.question}</p>
                          <p className="text-xs text-muted mt-1">{tc("goalPrefix")}{q.goal}</p>
                        </div>
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
                <p className="overline mb-2">{tc("successCriteria")}</p>
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
              <p className="overline mb-4">{tc("delivery")}</p>
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
          className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-paper shadow-2xl"
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
                <div className="rounded-card border border-hairline bg-paper-elevated p-4 text-sm text-muted">
                  {simError}
                </div>
              )}
              {simLoading && !sim && (
                <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
                  {tc("simDrafting")}
                </div>
              )}
              {sim?.persona_summary && (
                <div className="rounded-card border border-hairline bg-paper-elevated p-4">
                  <p className="overline mb-1">{tc("personaSummary")}</p>
                  <p className="text-body">{sim.persona_summary}</p>
                </div>
              )}
              {sim?.turns.map((t, i) => (
                <div key={i} className="rounded-card border border-hairline bg-paper p-4">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs text-muted pt-0.5 w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs text-muted">{t.question}</p>
                      <p className="text-ink leading-relaxed">{t.answer}</p>
                    </div>
                  </div>
                </div>
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

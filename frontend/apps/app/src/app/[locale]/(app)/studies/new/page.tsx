"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ChatFeed, ChatComposer, type ChatMessage } from "@telepace/ui";
import { ALL_CHANNELS, CHANNELS } from "@telepace/config";
import {
  createCampaign,
  getCampaign,
  refineOutlineStream,
  simulateInterview,
  startCampaign,
  type SimulateResponse,
} from "@/lib/api";
import { friendlyMessage, type ErrorsCopyTable } from "@/lib/errors";
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

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "sys-1",
    role: "system",
    text: "Tell me what you'd like to learn. I'll draft the interview for you.",
  },
];

// Shown while the conversation is empty — one click seeds a real study.
const SUGGESTIONS = [
  "Why did trial users churn before upgrading last quarter?",
  "How do freelancers decide which invoicing tool to pay for?",
  "First reactions to our new onboarding flow",
];

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
  const t = useTranslations("errors");
  const errorsCopy = t.raw("") as ErrorsCopyTable;
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
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
  const abortRef = useRef<AbortController | null>(null);

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
        setSimError("AI returned a response we couldn't parse. Try again.");
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
          setSpec((s) => mergeServerSpec(s, fetched, derivedTitle));
          patchMessage(agentId, { text: describeSeed(fetched), pending: false });
        } else {
          patchMessage(agentId, {
            text: "I've drafted a starting outline on the right. Anything to change?",
            pending: false,
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
              setSpec((s) => mergeServerSpec(s, patch as ServerSpec));
            },
            onDone: (summary) => {
              if (summary) {
                patchMessage(agentId, { text: summary, pending: false });
              } else {
                patchMessage(agentId, { pending: false });
              }
            },
            onError: (message) => {
              setLastFailed(text);
              patchMessage(agentId, {
                role: "system",
                text: `Something went wrong: ${message}`,
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
                    ? { ...m, pending: false, text: m.text ? `${m.text} …(stopped)` : "" }
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
          text: `Publish failed — ${copy.title}: ${copy.description}`,
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
          <p className="overline">Design chat</p>
          {busy && campaignId && (
            <button
              onClick={handleStop}
              className="text-xs text-muted hover:text-ink transition-colors"
            >
              ■ Stop
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-6">
          <ChatFeed messages={messages} />
          {messages.length === 1 && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted">Try one of these:</p>
              <div className="flex flex-col items-start gap-2">
                {SUGGESTIONS.map((s) => (
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
            <p className="text-xs text-muted">That message didn't go through.</p>
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}
        <ChatComposer
          onSend={handleSend}
          disabled={busy}
          placeholder="Describe what you want to learn…"
        />
      </section>

      {/* Right: canvas pane */}
      <section className="col-span-7 flex flex-col overflow-hidden">
        <header className="px-8 h-14 flex items-center justify-between border-b border-hairline">
          <div className="flex items-center gap-3">
            <p className="overline">Discussion guide</p>
            <span className="text-xs text-muted">
              ~{spec.estimated_minutes} min · {spec.target_completions} completions
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
              Simulate respondent
            </Button>
            <Button
              size="sm"
              loading={publishing}
              disabled={!campaignId || spec.outline.length === 0}
              onClick={handlePublish}
            >
              Publish study
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

            {spec.target_persona && (
              <div className="mt-6 rounded-card border border-hairline bg-paper p-4">
                <p className="overline mb-1">Target persona</p>
                <p className="text-body">{spec.target_persona}</p>
              </div>
            )}

            {spec.hypotheses.length > 0 && (
              <div className="mt-6">
                <p className="overline mb-2">Hypotheses</p>
                <ul className="space-y-1.5">
                  {spec.hypotheses.map((h, i) => (
                    <li key={i} className="flex gap-3 text-body">
                      <span className="font-mono text-xs text-muted pt-0.5">H{i + 1}</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {spec.audience_screener.length > 0 && (
              <div className="mt-6">
                <p className="overline mb-2">Audience screener</p>
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
            )}

            <div className="mt-10">
              <p className="overline mb-4">Questions</p>
              {spec.outline.length === 0 ? (
                <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
                  Your outline appears here as we design it together.
                </div>
              ) : (
                <ol className="space-y-3">
                  {spec.outline.map((q) => (
                    <li
                      key={q.order}
                      className="rounded-card border border-hairline bg-paper p-4"
                    >
                      <div className="flex gap-4">
                        <div className="font-mono text-sm text-muted w-6 pt-0.5">
                          {String(q.order).padStart(2, "0")}
                        </div>
                        <div className="flex-1">
                          <p className="text-ink">{q.question}</p>
                          <p className="text-xs text-muted mt-1">Goal: {q.goal}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {spec.success_criteria.length > 0 && (
              <div className="mt-10">
                <p className="overline mb-2">Success criteria</p>
                <ul className="space-y-1.5">
                  {spec.success_criteria.map((c, i) => (
                    <li key={i} className="flex gap-3 text-body">
                      <span className="font-mono text-xs text-muted pt-0.5">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-10">
              <p className="overline mb-4">Delivery</p>
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
          aria-label="Simulated respondent"
        >
          <div className="h-14 px-6 flex items-center justify-between border-b border-hairline">
            <div className="flex items-center gap-3">
              <p className="overline">AI simulated respondent</p>
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
                Another persona
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSimOpen(false)}
              >
                Close
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
                  AI is drafting a respondent…
                </div>
              )}
              {sim?.persona_summary && (
                <div className="rounded-card border border-hairline bg-paper-elevated p-4">
                  <p className="overline mb-1">Persona summary</p>
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
                  No turns returned. Try another persona.
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

function describeSeed(spec: ServerSpec): string {
  const nQ = spec.outline?.items?.length ?? 0;
  const nH = spec.hypotheses?.length ?? 0;
  const persona = spec.target_persona ? "target persona" : "";
  const parts = [
    nQ > 0 ? `${nQ} questions` : "",
    nH > 0 ? `${nH} hypotheses` : "",
    persona,
  ].filter(Boolean);
  if (parts.length === 0) {
    return "I've drafted a starting outline. Anything to refine?";
  }
  return `Drafted ${parts.join(", ")}. Tell me what to sharpen.`;
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

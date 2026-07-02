"use client";

import { useState } from "react";
import { Button, ChatFeed, ChatComposer, type ChatMessage } from "@telepace/ui";
import { createCampaign, refineOutlineStream } from "@/lib/api";

type OutlineItem = { order: number; question: string; goal: string };

type Spec = {
  title: string;
  goal: string;
  outline: OutlineItem[];
  channels: string[];
  target_completions: number;
  estimated_minutes: number;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "sys-1",
    role: "system",
    text: "Tell me what you'd like to learn. I'll draft the interview for you.",
  },
];

const INITIAL_SPEC: Spec = {
  title: "New study",
  goal: "",
  outline: [],
  channels: ["web_text"],
  target_completions: 10,
  estimated_minutes: 15,
};

export default function NewStudyPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [spec, setSpec] = useState<Spec>(INITIAL_SPEC);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSend(text: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "respondent", text }]);
    setBusy(true);
    try {
      if (!campaignId) {
        const created = await createCampaign({
          title: spec.title === "New study" ? deriveTitle(text) : spec.title,
          goal: text,
        });
        setCampaignId(created.campaign_id);
        setSpec((s) => ({ ...s, title: deriveTitle(text), goal: text }));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "interviewer",
            text: "I've drafted a starting outline on the right. Anything to change?",
          },
        ]);
        // Seed outline (client-side placeholder — real spec comes from Designer via SpecUpdated events)
        setSpec((s) => ({
          ...s,
          outline: DEFAULT_OUTLINE,
        }));
      } else {
        // Create a placeholder interviewer message we mutate in-place as deltas arrive.
        const streamingId = crypto.randomUUID();
        setMessages((prev) => [
          ...prev,
          { id: streamingId, role: "interviewer", text: "" },
        ]);
        const appendDelta = (delta: string) => {
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.id === streamingId) {
              // Strip anything past <spec_patch> from the visible bubble.
              const combined = (last.text ?? "") + delta;
              const cleaned = combined.replace(/<spec_patch>[\s\S]*?(<\/spec_patch>|$)/g, "");
              next[next.length - 1] = { ...last, text: cleaned };
            }
            return next;
          });
        };
        await refineOutlineStream(campaignId, text, {
          onDelta: appendDelta,
          onPatch: (patch) => {
            const outline = (patch as { outline?: { items?: OutlineItem[] } })?.outline;
            if (outline?.items) {
              setSpec((s) => ({ ...s, outline: outline.items! }));
            }
          },
          onDone: (summary) => {
            if (summary) {
              setMessages((prev) => {
                const next = prev.slice();
                const last = next[next.length - 1];
                if (last && last.id === streamingId) {
                  next[next.length - 1] = { ...last, text: summary };
                }
                return next;
              });
            }
          },
          onError: (message) => {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                text: `Error: ${message}`,
              },
            ]);
          },
        });
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `Error: ${(err as Error).message}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen grid grid-cols-12">
      {/* Left: chat pane */}
      <section className="col-span-5 border-r border-hairline flex flex-col bg-paper">
        <header className="px-6 h-14 flex items-center border-b border-hairline">
          <p className="overline">Design chat</p>
        </header>
        <div className="flex-1 overflow-y-auto px-6">
          <ChatFeed messages={messages} />
        </div>
        <ChatComposer onSend={handleSend} disabled={busy} placeholder="Describe what you want to learn…" />
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
            <Button variant="ghost" size="sm">
              Preview
            </Button>
            <Button size="sm" disabled={!campaignId || spec.outline.length === 0}>
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

            <div className="mt-10">
              <p className="overline mb-4">Delivery</p>
              <div className="flex flex-wrap gap-2">
                {["web_text", "web_voice", "phone_outbound", "email"].map((ch) => (
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
    </div>
  );
}

function deriveTitle(text: string) {
  const t = text.trim();
  const cut = t.slice(0, 60);
  return cut.length < t.length ? `${cut}…` : cut;
}

const DEFAULT_OUTLINE: OutlineItem[] = [
  { order: 1, question: "Tell me a bit about your role and what you're working on.", goal: "context" },
  { order: 2, question: "Walk me through the last time you tried to solve this problem.", goal: "current behavior" },
  { order: 3, question: "What went well? What was frustrating?", goal: "satisfaction" },
  { order: 4, question: "If a magic wand solved it, what would 'solved' look like?", goal: "ideal state" },
  { order: 5, question: "What have you already tried that didn't work?", goal: "prior attempts" },
];

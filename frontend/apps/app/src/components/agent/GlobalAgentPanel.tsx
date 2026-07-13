"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChatComposer, ChatFeed, cn, type ChatMessage } from "@telepace/ui";

import { agentChatStream, type AgentEvent, type AgentTurn } from "@/lib/agentChat";
import { useRouter } from "@/i18n/navigation";
import { campaignIdFromResult, toolMessageKey } from "./toolLabels";
import {
  CampaignListCard,
  campaignsFromResult,
  type CampaignSummary,
} from "./CampaignListCard";

/**
 * A tool-activity row rendered inline in the feed: shows the running/done/error
 * state of one tool call, and — when the tool yields a campaign_id — a clickable
 * affordance to open that study.
 */
type ToolCard = {
  id: string;
  name: string;
  phase: "running" | "done" | "error";
  campaignId: string | null;
  message?: string;
};

type Entry =
  | { kind: "msg"; msg: ChatMessage }
  | { kind: "tool"; card: ToolCard }
  | { kind: "campaigns"; id: string; campaigns: CampaignSummary[] };

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function ToolActivityCard({ card }: { card: ToolCard }) {
  const t = useTranslations("app.agent");
  const router = useRouter();
  const key = toolMessageKey(card.name);
  const verb =
    card.phase === "error"
      ? t("tool.error", { tool: t(`tool.${key}.running` as Parameters<typeof t>[0]) })
      : card.phase === "done"
        ? t(`tool.${key}.done` as Parameters<typeof t>[0])
        : t(`tool.${key}.running` as Parameters<typeof t>[0]);

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-card border px-3 py-2 text-sm tp-chip-in",
        card.phase === "error"
          ? "border-danger/30 bg-paper-sunken text-danger"
          : "border-hairline bg-paper-sunken text-body",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          card.phase === "running"
            ? "bg-accent tp-ping-once"
            : card.phase === "error"
              ? "bg-danger"
              : "bg-accent",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{verb}</span>
      {card.phase === "done" && card.campaignId && (
        <button
          type="button"
          onClick={() => router.push(`/studies/${card.campaignId}`)}
          className="shrink-0 rounded-input px-2 py-0.5 text-xs font-medium text-accent transition-[color,background-color] duration-150 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {t("viewStudy")}
        </button>
      )}
    </div>
  );
}

/**
 * The shared conversational-agent surface. Talks to POST /agent/chat, streams
 * the orchestrator's events, and renders assistant prose + tool-activity cards.
 * Used by the global sidebar dock and (in phase 5) the cross-study copilot.
 */
export function GlobalAgentPanel({ className }: { className?: string }) {
  const t = useTranslations("app.agent");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const historyRef = React.useRef<AgentTurn[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  const patchAssistant = React.useCallback((id: string, text: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === "msg" && e.msg.id === id
          ? { kind: "msg", msg: { ...e.msg, text, pending: false } }
          : e,
      ),
    );
  }, []);

  const submit = React.useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const userTurn: AgentTurn = { role: "user", content: text };
      historyRef.current = [...historyRef.current, userTurn];

      const assistantId = nextId("a");
      setEntries((prev) => [
        ...prev,
        { kind: "msg", msg: { id: nextId("u"), role: "respondent", text } },
        { kind: "msg", msg: { id: assistantId, role: "interviewer", text: "", pending: true } },
      ]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let finalText = "";

      const onEvent = (event: AgentEvent) => {
        switch (event.type) {
          case "text":
            finalText = event.text;
            patchAssistant(assistantId, event.text);
            break;
          case "tool_call":
            setEntries((prev) => [
              ...prev,
              {
                kind: "tool",
                card: {
                  id: nextId("tc"),
                  name: event.name,
                  phase: "running",
                  campaignId: null,
                },
              },
            ]);
            break;
          case "tool_result": {
            // list_campaigns returns structured rows — render them as real study
            // cards (status + progress + deep link) instead of waiting for the
            // LLM to prose them into a markdown wall. Other tools keep their
            // running→done activity chip.
            const campaigns =
              event.name === "list_campaigns" ? campaignsFromResult(event.result) : null;
            setEntries((prev) => {
              const marked = markLastTool(prev, event.name, {
                phase: "done",
                campaignId: campaignIdFromResult(event.result),
              });
              if (campaigns && campaigns.length > 0) {
                return [
                  ...marked,
                  { kind: "campaigns", id: nextId("cl"), campaigns },
                ];
              }
              return marked;
            });
            break;
          }
          case "tool_error":
            setEntries((prev) =>
              markLastTool(prev, event.name, { phase: "error", message: event.message }),
            );
            break;
          case "done":
            finalText = event.text || finalText;
            patchAssistant(assistantId, finalText || t("emptyReply"));
            break;
          case "error":
            patchAssistant(assistantId, t("streamError", { message: event.message }));
            break;
        }
      };

      try {
        await agentChatStream(historyRef.current, { onEvent, signal: controller.signal });
        if (finalText) {
          historyRef.current = [
            ...historyRef.current,
            { role: "assistant", content: finalText },
          ];
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          patchAssistant(assistantId, t("streamError", { message: String(err) }));
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, patchAssistant, t],
  );

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <div className="flex flex-col gap-2 py-4">
            <p className="text-xs text-muted">{t("greeting")}</p>
            <div className="flex flex-col items-start gap-2">
              {[t("suggestion1"), t("suggestion2"), t("suggestion3")].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  disabled={busy}
                  className="rounded-pill border border-hairline bg-paper-elevated px-3.5 py-1.5 text-left text-sm text-body transition-[color,background-color,border-color,transform] duration-150 hover:border-ink hover:text-ink transform-gpu active:scale-[0.97] active:duration-75 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((e) =>
              e.kind === "tool" ? (
                <ToolActivityCard key={e.card.id} card={e.card} />
              ) : e.kind === "campaigns" ? (
                <CampaignListCard key={e.id} campaigns={e.campaigns} />
              ) : (
                <ChatFeed key={e.msg.id} typingLabel={t("thinking")} messages={[e.msg]} />
              ),
            )}
          </div>
        )}
      </div>

      {busy && (
        <div className="flex justify-end px-4 pb-1">
          <button
            type="button"
            onClick={stop}
            className="text-xs text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            ■ {t("stop")}
          </button>
        </div>
      )}

      <ChatComposer
        onSend={submit}
        disabled={busy}
        placeholder={t("placeholder")}
        sendLabel={t("send")}
      />
    </div>
  );
}

/** Update the most recent running tool card matching `name`. */
function markLastTool(
  entries: Entry[],
  name: string,
  patch: Partial<Pick<ToolCard, "phase" | "campaignId" | "message">>,
): Entry[] {
  const next = entries.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    const e = next[i];
    if (e.kind === "tool" && e.card.name === name && e.card.phase === "running") {
      next[i] = { kind: "tool", card: { ...e.card, ...patch } };
      break;
    }
  }
  return next;
}

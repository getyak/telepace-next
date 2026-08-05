"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChatComposer, cn, type ChatMessage } from "@telepace/ui";

import {
  createAgentRun,
  getAgentRun,
  resolveAgentConfirmation,
  watchAgentRun,
  type AgentTurn,
  type SequencedAgentEvent,
} from "@/lib/agentChat";
import { useRouter } from "@/i18n/navigation";
import { campaignIdFromResult, toolMessageKey } from "./toolLabels";
import { AgentMessage } from "./AgentMessage";
import {
  CampaignListCard,
  campaignsFromResult,
  type CampaignSummary,
} from "./CampaignListCard";

type ToolCard = {
  id: string;
  toolUseId?: string;
  name: string;
  phase: "running" | "done" | "error";
  campaignId: string | null;
  message?: string;
};

type PlanItem = {
  step: string;
  status: "pending" | "in_progress" | "completed";
};

type ConfirmationCard = {
  id: string;
  confirmationId: string;
  name: string;
  args: Record<string, unknown>;
  state: "pending" | "approving" | "denying" | "approved" | "denied" | "error";
};

type Entry =
  | { kind: "msg"; msg: ChatMessage }
  | { kind: "tool"; card: ToolCard }
  | { kind: "campaigns"; id: string; campaigns: CampaignSummary[] }
  | { kind: "plan"; id: string; items: PlanItem[] }
  | { kind: "verification"; id: string; name: string; ok: boolean; detail?: string }
  | { kind: "confirmation"; card: ConfirmationCard };

type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "reconnecting"
  | "background"
  | "completed"
  | "incomplete"
  | "failed";

const ACTIVE_RUN_KEY = "telepace.active-agent-run";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function turnsToEntries(turns: AgentTurn[]): Entry[] {
  return turns.map((turn) => ({
    kind: "msg",
    msg: {
      id: nextId(turn.role === "user" ? "u" : "a"),
      role: turn.role === "user" ? "respondent" : "interviewer",
      text: turn.content,
    },
  }));
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
          card.phase === "running" ? "bg-accent tp-ping-once" : "bg-accent",
          card.phase === "error" && "bg-danger",
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

function PlanCard({ items }: { items: PlanItem[] }) {
  const t = useTranslations("app.agent");
  return (
    <section className="rounded-card border border-hairline bg-paper-elevated px-3 py-2.5">
      <p className="mb-2 text-xs font-medium text-ink">{t("planTitle")}</p>
      <ol className="space-y-1.5" aria-label={t("planTitle")}>
        {items.map((item, index) => (
          <li key={`${index}-${item.step}`} className="flex gap-2 text-xs text-body">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                item.status === "completed" && "border-accent bg-accent text-white",
                item.status === "in_progress" && "border-accent text-accent",
                item.status === "pending" && "border-hairline text-muted",
              )}
            >
              {item.status === "completed" ? "✓" : index + 1}
            </span>
            <span className={item.status === "pending" ? "text-muted" : undefined}>
              {item.step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VerificationCard({
  name,
  ok,
  detail,
}: {
  name: string;
  ok: boolean;
  detail?: string;
}) {
  const t = useTranslations("app.agent");
  return (
    <div
      className={cn(
        "rounded-card border px-3 py-2 text-xs",
        ok
          ? "border-hairline bg-paper-sunken text-body"
          : "border-danger/30 bg-paper-sunken text-danger",
      )}
    >
      <span className="font-medium">
        {ok ? t("verificationPassed") : t("verificationFailed")}
      </span>
      <span className="ml-1 text-muted">{name}</span>
      {detail && <p className="mt-1 text-muted">{detail}</p>}
    </div>
  );
}

function ConfirmationCardView({
  card,
  onDecision,
}: {
  card: ConfirmationCard;
  onDecision: (card: ConfirmationCard, approved: boolean) => void;
}) {
  const t = useTranslations("app.agent");
  const actionable = card.state === "pending" || card.state === "error";
  return (
    <section
      className="rounded-card border border-accent/40 bg-accent-soft px-3 py-3"
      aria-label={t("confirmationTitle")}
    >
      <p className="text-sm font-medium text-ink">{t("confirmationTitle")}</p>
      <p className="mt-1 text-xs text-body">
        {t("confirmationDescription", { tool: card.name })}
      </p>
      <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-input bg-paper-elevated p-2 text-[11px] text-muted">
        {JSON.stringify(card.args, null, 2)}
      </pre>
      {actionable ? (
        <div className="mt-3">
          {card.state === "error" && (
            <p className="mb-2 text-xs text-danger" role="alert">
              {t("confirmation.error")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDecision(card, true)}
              className="rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("approve")}
            </button>
            <button
              type="button"
              onClick={() => onDecision(card, false)}
              className="rounded-input border border-hairline bg-paper-elevated px-3 py-1.5 text-xs font-medium text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("deny")}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-body" role="status">
          {t(`confirmation.${card.state}` as Parameters<typeof t>[0])}
        </p>
      )}
    </section>
  );
}

function RunStatusBar({
  phase,
  runId,
  onResume,
}: {
  phase: RunPhase;
  runId: string | null;
  onResume: () => void;
}) {
  const t = useTranslations("app.agent");
  if (!runId || phase === "idle") return null;
  return (
    <div
      className="flex items-center gap-2 border-b border-hairline bg-paper-sunken px-4 py-2 text-xs text-muted"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ["starting", "running", "reconnecting"].includes(phase)
            ? "bg-accent tp-ping-once"
            : phase === "failed" || phase === "incomplete"
              ? "bg-danger"
              : "bg-muted",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{t(`run.${phase}`)}</span>
      {phase === "background" && (
        <button
          type="button"
          onClick={onResume}
          className="font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t("resumeWatching")}
        </button>
      )}
    </div>
  );
}

export function GlobalAgentPanel({
  className,
  scopeStudyIds,
}: {
  className?: string;
  scopeStudyIds?: string[];
}) {
  const t = useTranslations("app.agent");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [runId, setRunId] = React.useState<string | null>(null);
  const historyRef = React.useRef<AgentTurn[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);
  const cursorRef = React.useRef(0);
  const assistantIdRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);
  const busy = ["starting", "running", "reconnecting", "background"].includes(phase);

  const patchAssistant = React.useCallback((text: string) => {
    const id = assistantIdRef.current;
    if (!id) return;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.kind === "msg" && entry.msg.id === id
          ? { kind: "msg", msg: { ...entry.msg, text, pending: false } }
          : entry,
      ),
    );
  }, []);

  const consumeEvent = React.useCallback(
    (event: SequencedAgentEvent) => {
      cursorRef.current = Math.max(cursorRef.current, event.seq);
      switch (event.type) {
        case "text":
          patchAssistant(event.text);
          break;
        case "tool_call":
          setEntries((prev) => [
            ...prev,
            {
              kind: "tool",
              card: {
                id: nextId("tc"),
                toolUseId: event.tool_use_id,
                name: event.name,
                phase: "running",
                campaignId: null,
              },
            },
          ]);
          break;
        case "tool_result": {
          const campaigns =
            event.name === "list_campaigns" ? campaignsFromResult(event.result) : null;
          setEntries((prev) => {
            const marked = markLastTool(prev, event.name, event.tool_use_id, {
              phase: "done",
              campaignId: campaignIdFromResult(event.result),
            });
            return campaigns && campaigns.length > 0
              ? [...marked, { kind: "campaigns", id: nextId("cl"), campaigns }]
              : marked;
          });
          break;
        }
        case "tool_error":
          setEntries((prev) =>
            markLastTool(prev, event.name, event.tool_use_id, {
              phase: "error",
              message: event.message,
            }),
          );
          break;
        case "plan_update":
          setEntries((prev) => upsertPlan(prev, event.items));
          break;
        case "verification":
          setEntries((prev) => [
            ...prev,
            {
              kind: "verification",
              id: nextId("verify"),
              name: event.name,
              ok: event.verified,
              detail: event.error ?? event.verifier,
            },
          ]);
          break;
        case "confirm_request":
          setEntries((prev) => [
            ...prev,
            {
              kind: "confirmation",
              card: {
                id: nextId("confirm"),
                confirmationId: event.confirmation_id,
                name: event.name,
                args: event.args,
                state: "pending",
              },
            },
          ]);
          break;
        case "confirmation_result":
          setEntries((prev) =>
            patchConfirmation(
              prev,
              event.confirmation_id,
              event.approved ? "approved" : "denied",
            ),
          );
          break;
        case "done":
          patchAssistant(
            event.reason === "turn_budget_exhausted"
              ? t("budgetIncomplete")
              : (event.text || t("emptyReply")),
          );
          setPhase(event.status === "incomplete" ? "incomplete" : "completed");
          localStorage.removeItem(ACTIVE_RUN_KEY);
          if (event.text) {
            historyRef.current = [
              ...historyRef.current,
              { role: "assistant", content: event.text },
            ];
          }
          break;
        case "error":
          patchAssistant(t("streamError", { message: event.message }));
          setPhase("failed");
          localStorage.removeItem(ACTIVE_RUN_KEY);
          break;
        case "usage":
        case "compaction":
          break;
      }
    },
    [patchAssistant, t],
  );

  const watch = React.useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase(cursorRef.current > 0 ? "reconnecting" : "running");

      try {
        while (!controller.signal.aborted) {
          cursorRef.current = await watchAgentRun(id, cursorRef.current, {
            signal: controller.signal,
            onEvent: consumeEvent,
          });
          if (controller.signal.aborted) return;
          const status = await getAgentRun(id);
          if (status.status !== "running") {
            setPhase(status.status);
            if (status.status !== "completed") localStorage.removeItem(ACTIVE_RUN_KEY);
            return;
          }
          setPhase("reconnecting");
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch {
        if (!controller.signal.aborted && mountedRef.current) {
          setPhase("reconnecting");
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (!controller.signal.aborted && mountedRef.current) void watch(id);
        }
      }
    },
    [consumeEvent],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    const savedRunId = localStorage.getItem(ACTIVE_RUN_KEY);
    if (savedRunId) {
      setRunId(savedRunId);
      setPhase("reconnecting");
      void getAgentRun(savedRunId)
        .then((run) => {
          if (!mountedRef.current) return;
          historyRef.current = run.messages;
          const restored = turnsToEntries(run.messages);
          const assistantId = nextId("a");
          assistantIdRef.current = assistantId;
          setEntries([
            ...restored,
            {
              kind: "msg",
              msg: { id: assistantId, role: "interviewer", text: "", pending: true },
            },
          ]);
          cursorRef.current = 0;
          void watch(savedRunId);
        })
        .catch(() => {
          localStorage.removeItem(ACTIVE_RUN_KEY);
          setRunId(null);
          setPhase("idle");
        });
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [watch]);

  const submit = React.useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const scopedText =
        scopeStudyIds !== undefined
          ? `[Only use these selected study IDs unless the user explicitly changes scope: ${scopeStudyIds.join(", ") || "(none selected)"}]\n${text}`
          : text;
      const userTurn: AgentTurn = { role: "user", content: scopedText };
      historyRef.current = [...historyRef.current, userTurn];
      const assistantId = nextId("a");
      assistantIdRef.current = assistantId;
      setEntries((prev) => [
        ...prev,
        { kind: "msg", msg: { id: nextId("u"), role: "respondent", text } },
        {
          kind: "msg",
          msg: { id: assistantId, role: "interviewer", text: "", pending: true },
        },
      ]);
      setPhase("starting");

      try {
        const run = await createAgentRun(historyRef.current);
        setRunId(run.run_id);
        cursorRef.current = 0;
        localStorage.setItem(ACTIVE_RUN_KEY, run.run_id);
        void watch(run.run_id);
      } catch (error) {
        patchAssistant(t("streamError", { message: String(error) }));
        setPhase("failed");
      }
    },
    [busy, patchAssistant, scopeStudyIds, t, watch],
  );

  const decide = React.useCallback(
    async (card: ConfirmationCard, approved: boolean) => {
      if (!runId || (card.state !== "pending" && card.state !== "error")) return;
      setEntries((prev) =>
        patchConfirmation(prev, card.confirmationId, approved ? "approving" : "denying"),
      );
      try {
        await resolveAgentConfirmation(runId, card.confirmationId, approved);
      } catch {
        setEntries((prev) => patchConfirmation(prev, card.confirmationId, "error"));
      }
    },
    [runId],
  );

  const continueInBackground = React.useCallback(() => {
    abortRef.current?.abort();
    setPhase("background");
  }, []);

  const resumeWatching = React.useCallback(() => {
    if (runId) void watch(runId);
  }, [runId, watch]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <RunStatusBar phase={phase} runId={runId} onResume={resumeWatching} />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <div className="flex flex-col gap-2 py-4">
            <p className="text-xs text-muted">{t("greeting")}</p>
            <div className="flex flex-col items-start gap-2">
              {[t("suggestion1"), t("suggestion2"), t("suggestion3")].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  disabled={busy}
                  className="rounded-pill border border-hairline bg-paper-elevated px-3.5 py-1.5 text-left text-sm text-body transition-[color,background-color,border-color,transform] duration-150 hover:border-ink hover:text-ink tp-press tp-press-control motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((entry) => {
              switch (entry.kind) {
                case "tool":
                  return <ToolActivityCard key={entry.card.id} card={entry.card} />;
                case "campaigns":
                  return <CampaignListCard key={entry.id} campaigns={entry.campaigns} />;
                case "plan":
                  return <PlanCard key={entry.id} items={entry.items} />;
                case "verification":
                  return (
                    <VerificationCard
                      key={entry.id}
                      name={entry.name}
                      ok={entry.ok}
                      detail={entry.detail}
                    />
                  );
                case "confirmation":
                  return (
                    <ConfirmationCardView
                      key={entry.card.id}
                      card={entry.card}
                      onDecision={decide}
                    />
                  );
                case "msg":
                  return (
                    <AgentMessage
                      key={entry.msg.id}
                      message={entry.msg}
                      typingLabel={t("thinking")}
                    />
                  );
              }
            })}
          </div>
        )}
      </div>

      {["starting", "running", "reconnecting"].includes(phase) && (
        <div className="flex justify-end px-4 pb-1">
          <button
            type="button"
            onClick={continueInBackground}
            className="text-xs text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {t("continueInBackground")}
          </button>
        </div>
      )}

      <ChatComposer
        onSend={submit}
        disabled={busy}
        placeholder={busy ? t("runningPlaceholder") : t("placeholder")}
        sendLabel={t("send")}
      />
    </div>
  );
}

function markLastTool(
  entries: Entry[],
  name: string,
  toolUseId: string | undefined,
  patch: Partial<Pick<ToolCard, "phase" | "campaignId" | "message">>,
): Entry[] {
  const next = entries.slice();
  for (let index = next.length - 1; index >= 0; index--) {
    const entry = next[index];
    if (
      entry.kind === "tool" &&
      entry.card.name === name &&
      entry.card.phase === "running" &&
      (!toolUseId || !entry.card.toolUseId || entry.card.toolUseId === toolUseId)
    ) {
      next[index] = { kind: "tool", card: { ...entry.card, ...patch } };
      break;
    }
  }
  return next;
}

function upsertPlan(entries: Entry[], items: PlanItem[]): Entry[] {
  const index = entries.findIndex((entry) => entry.kind === "plan");
  if (index < 0) return [...entries, { kind: "plan", id: nextId("plan"), items }];
  const next = entries.slice();
  const current = next[index];
  if (current.kind === "plan") next[index] = { ...current, items };
  return next;
}

function patchConfirmation(
  entries: Entry[],
  confirmationId: string,
  state: ConfirmationCard["state"],
): Entry[] {
  return entries.map((entry) =>
    entry.kind === "confirmation" && entry.card.confirmationId === confirmationId
      ? { kind: "confirmation", card: { ...entry.card, state } }
      : entry,
  );
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  ChatComposer,
  ChatFeed,
  cn,
  type ChatMessage,
} from "@telepace/ui";
import type { Citation, EvidenceGraph, Insight } from "@/types/evidence";
import { buildMockEvidenceGraph } from "@/lib/mock-evidence";
import { CitedAnswer } from "./CitedAnswer";
import { SuggestedQuestions } from "./SuggestedQuestions";

/** A mock agent answer, richer than a plain ChatMessage. */
type AgentAnswer = {
  id: string;
  answer: string;
  reasoning: string;
  /** Ordered sources — index i corresponds to marker [i+1]. */
  sources: Citation[];
};

type Entry =
  | { kind: "user"; id: string; text: string }
  | { kind: "agent"; id: string; answer: AgentAnswer }
  | { kind: "pending"; id: string };

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Build a deterministic mock answer by drawing on the study's evidence
 * graph. Not real retrieval — it rotates through insights so repeated
 * questions surface different supporting evidence.
 */
function buildMockAnswer(
  graph: EvidenceGraph,
  turn: number,
): AgentAnswer {
  const insights = graph.insights;
  const primary: Insight | undefined =
    insights[turn % Math.max(insights.length, 1)];

  const sources: Citation[] =
    primary?.supporting_evidence?.slice(0, 3) ?? graph.citations.slice(0, 2);

  const markers = sources.map((_, i) => `[${i + 1}]`).join(" ");

  const answer = primary
    ? `${primary.body} ${markers}`.trim()
    : "There isn't enough evidence in this study to answer that yet.";

  const reasoning = primary
    ? `Matched the question to insight "${primary.title}" (confidence ${Math.round(
        primary.confidence * 100,
      )}%), then grounded the answer in ${sources.length} citation${
        sources.length === 1 ? "" : "s"
      } across ${primary.claims.length} supporting claim${
        primary.claims.length === 1 ? "" : "s"
      }.`
    : "No matching insight was found, so no citations were attached.";

  return { id: nextId("agent"), answer, reasoning, sources };
}

function ReasoningBlock({ text }: { text: string }) {
  const t = useTranslations("app.research");
  const [open, setOpen] = React.useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded text-xs font-medium text-accent hover:underline focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {open ? t("hideReasoning") : t("showReasoning")}
      </button>
      {open && (
        <div className="mt-2 rounded-card border border-hairline bg-paper-sunken px-3 py-2 text-sm text-muted">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("reasoning")}
          </p>
          {text}
        </div>
      )}
    </div>
  );
}

function AgentAnswerCard({ answer }: { answer: AgentAnswer }) {
  const t = useTranslations("app.research");
  const hasSources = answer.sources.length > 0;

  return (
    <div className="flex w-full justify-start">
      <Card className="max-w-[85%] px-4 py-3 text-[15px] leading-[1.5] text-ink">
        <CitedAnswer text={answer.answer} citations={answer.sources} />

        <ReasoningBlock text={answer.reasoning} />

        <div className="mt-3 border-t border-hairline pt-2">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {hasSources
              ? t("citedSources", { count: answer.sources.length })
              : t("noEvidence")}
          </p>
          {hasSources && (
            <ol className="flex flex-col gap-1.5">
              {answer.sources.map((c, i) => (
                <li key={c.id} className="flex gap-2 text-sm text-muted">
                  <span className="shrink-0 text-accent">[{i + 1}]</span>
                  <span>
                    <span className="italic">“{c.quote_text}”</span>
                    <span className="ml-1 text-xs text-muted/70">
                      — {c.respondent_id}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Per-study Research Agent chat panel. Answers are mocked from the study's
 * evidence graph after a short delay.
 */
export function ResearchChat({
  studyId,
  className,
}: {
  studyId: string;
  className?: string;
}) {
  const t = useTranslations("app.research");
  const graph = React.useMemo(() => buildMockEvidenceGraph(studyId), [studyId]);

  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [pending, setPending] = React.useState(false);
  const turnRef = React.useRef(0);

  const submit = React.useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      const pendingId = nextId("pending");
      setEntries((prev) => [
        ...prev,
        { kind: "user", id: nextId("user"), text: question },
        { kind: "pending", id: pendingId },
      ]);
      setPending(true);

      const turn = turnRef.current;
      turnRef.current += 1;

      window.setTimeout(() => {
        const answer = buildMockAnswer(graph, turn);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === pendingId ? { kind: "agent", id: answer.id, answer } : e,
          ),
        );
        setPending(false);
      }, 1000);
    },
    [graph, pending],
  );

  const userAndPending = (e: Entry): ChatMessage | null => {
    if (e.kind === "user") return { id: e.id, role: "respondent", text: e.text };
    if (e.kind === "pending")
      return { id: e.id, role: "interviewer", text: "", pending: true };
    return null;
  };

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader>
        <h2 className="font-serif text-xl text-ink">{t("title")}</h2>
      </CardHeader>

      <div className="flex-1 overflow-y-auto px-4">
        {entries.length === 0 ? (
          <div className="py-6">
            <SuggestedQuestions onSelect={submit} disabled={pending} />
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-4">
            {entries.map((e) => {
              if (e.kind === "agent") {
                return <AgentAnswerCard key={e.id} answer={e.answer} />;
              }
              const msg = userAndPending(e);
              return msg ? (
                <ChatFeed key={e.id} typingLabel={t("thinking")} messages={[msg]} />
              ) : null;
            })}
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div className="px-4 pb-1">
          <SuggestedQuestions onSelect={submit} disabled={pending} />
        </div>
      )}

      <ChatComposer
        onSend={submit}
        placeholder={t("placeholder")}
        sendLabel={t("send")}
        disabled={pending}
      />
    </Card>
  );
}

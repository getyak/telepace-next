"use client";

/**
 * Slide-over transcript panel for a single open citation.
 *
 * Resolves the open citation (from `useCitationPanel`) against the evidence
 * graph to find its respondent and full interview, then renders every turn
 * with the cited turn highlighted in context. Built on the shared `Dialog`
 * so focus-trap, Esc-to-close, and backdrop dismissal come for free.
 */

import { useTranslations } from "next-intl";

import { Badge, Dialog, cn } from "@telepace/ui";
import type { Citation, Interview, Respondent } from "@/types/evidence";
import { useEvidence } from "@/lib/evidence-store";
import { useCitationPanel } from "./CitationContext";

function findInterview(
  respondents: Respondent[],
  interviewId: string,
): Interview | undefined {
  for (const respondent of respondents) {
    const match = respondent.interviews.find((iv) => iv.id === interviewId);
    if (match) return match;
  }
  return undefined;
}

export function TranscriptPanel() {
  const t = useTranslations("app.evidence");
  const { graph } = useEvidence();
  const { openCitationId, closeCitation } = useCitationPanel();

  const citation: Citation | undefined = graph?.citations.find(
    (c) => c.id === openCitationId,
  );
  const respondent = graph?.respondents.find(
    (r) => r.id === citation?.respondent_id,
  );
  const interview =
    graph && citation
      ? findInterview(graph.respondents, citation.interview_id)
      : undefined;

  const open = openCitationId !== null;

  return (
    <Dialog
      open={open}
      onClose={closeCitation}
      title={t("transcript")}
      className="max-w-2xl"
    >
      {!citation || !interview ? (
        <p className="text-body">{t("noCitations")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {respondent && (
            <section className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide text-muted">
                {t("respondent")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{respondent.id}</span>
                {Object.entries(respondent.segments).map(([key, val]) => (
                  <Badge key={key} variant="neutral">
                    {val}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-muted">
              {t("highlightedQuote")}
            </span>
            <blockquote className="border-l-2 border-accent bg-accent-soft px-4 py-3 font-display text-lg text-ink">
              {citation.quote_text}
            </blockquote>
          </section>

          <section className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-wide text-muted">
              {t("context")}
            </span>
            <ol className="flex flex-col gap-3">
              {interview.turns.map((turn) => {
                const isCited = turn.id === citation.turn_id;
                return (
                  <li
                    key={turn.id}
                    className={cn(
                      "rounded-card border p-3 text-sm",
                      isCited
                        ? "border-accent bg-accent-soft text-ink"
                        : "border-hairline bg-paper-sunken text-body",
                    )}
                    aria-current={isCited ? "true" : undefined}
                  >
                    <span className="mb-1 block text-xs uppercase tracking-wide text-muted">
                      {t("turn", { number: turn.order })} · {turn.role}
                    </span>
                    <p>{turn.text}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </Dialog>
  );
}

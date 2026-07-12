"use client";

/**
 * Inline, clickable citation marker rendered like a footnote reference: [1].
 *
 * Clicking opens the TranscriptPanel for the referenced citation via
 * `useCitationPanel`. The visible number is the citation's 1-based position
 * in the evidence graph, resolved from `useEvidence`; an explicit `index`
 * prop overrides that lookup when the caller already knows the number.
 */

import { useTranslations } from "next-intl";

import { cn } from "@telepace/ui";
import { useEvidence } from "@/lib/evidence-store";
import { useCitationPanel } from "./CitationContext";

type CitationLinkProps = {
  citationId: string;
  /** 1-based marker number; falls back to graph position when omitted. */
  index?: number;
  className?: string;
};

export function CitationLink({ citationId, index, className }: CitationLinkProps) {
  const t = useTranslations("app.evidence");
  const { graph } = useEvidence();
  const { openCitation } = useCitationPanel();

  let resolvedIndex = index ?? null;
  if (resolvedIndex === null && graph) {
    const pos = graph.citations.findIndex((c) => c.id === citationId);
    if (pos >= 0) resolvedIndex = pos + 1;
  }

  const label = resolvedIndex ?? "?";

  return (
    <button
      type="button"
      onClick={() => openCitation(citationId)}
      aria-label={`${t("viewSource")} ${label}`}
      className={cn(
        "relative -top-1 mx-0.5 inline-flex min-w-[1.25rem] items-center justify-center",
        "rounded px-1 align-super text-[0.65rem] font-medium leading-none",
        "text-accent transition-colors hover:bg-accent-soft hover:text-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
    >
      [{label}]
    </button>
  );
}

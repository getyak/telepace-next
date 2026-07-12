"use client";

/**
 * Narrative report view.
 *
 * Renders an EvidenceGraph as a chapter-based, citation-backed document:
 * executive summary, key findings, detailed per-theme analysis, and
 * recommendations synthesized from concern-type insights. Citations are
 * numbered globally and rendered as inline [N] markers.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Badge, Card } from "@telepace/ui";
import type { Citation, EvidenceGraph, Insight } from "@/types/evidence";

// ---------------------------------------------------------------------------
// Chapter model
// ---------------------------------------------------------------------------

export type ReportChapter = {
  id: string;
  title: string;
};

/**
 * Stable, ordered chapter anchors shared with the table of contents so both
 * views derive the same list from one source of truth.
 */
export function buildChapters(
  t: (key: string) => string,
  graph: EvidenceGraph,
): ReportChapter[] {
  const chapters: ReportChapter[] = [
    { id: "executive", title: t("executive") },
    { id: "key-findings", title: t("keyFindings") },
  ];
  for (const theme of graph.themes) {
    chapters.push({ id: `theme-${theme.id}`, title: theme.label });
  }
  chapters.push({ id: "recommendations", title: t("recommendations") });
  if (graph.citations.length > 0) {
    chapters.push({ id: "appendix", title: t("appendix") });
  }
  return chapters;
}

// ---------------------------------------------------------------------------
// Citation numbering
// ---------------------------------------------------------------------------

/** Global citation index keyed by citation id, assigned in graph order. */
function buildCitationIndex(graph: EvidenceGraph): Map<string, number> {
  const index = new Map<string, number>();
  let n = 1;
  for (const theme of graph.themes) {
    for (const insight of theme.insights) {
      for (const cit of insight.supporting_evidence) {
        if (!index.has(cit.id)) index.set(cit.id, n++);
      }
    }
  }
  return index;
}

function confidencePct(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportView({ graph }: { graph: EvidenceGraph }) {
  const t = useTranslations("app.report");
  const citationIndex = useMemo(() => buildCitationIndex(graph), [graph]);

  const concernInsights = useMemo(
    () =>
      graph.themes
        .flatMap((theme) => theme.insights)
        .filter((insight) => insight.kind === "concern"),
    [graph],
  );

  const orderedCitations = useMemo(() => {
    const rows: Array<{ num: number; citation: Citation }> = [];
    for (const [id, num] of citationIndex.entries()) {
      const citation = graph.citations.find((c) => c.id === id);
      if (citation) rows.push({ num, citation });
    }
    return rows.sort((a, b) => a.num - b.num);
  }, [citationIndex, graph.citations]);

  return (
    <article className="max-w-[68ch]">
      {/* Executive summary */}
      <Chapter id="executive" title={t("executive")}>
        <ul className="space-y-3">
          {graph.themes.map((theme) => (
            <li key={theme.id} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="text-body leading-relaxed">
                <span className="text-ink">{theme.label}</span>
                {theme.insights[0]?.body ? ` — ${theme.insights[0].body}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Chapter>

      {/* Key findings */}
      <Chapter id="key-findings" title={t("keyFindings")}>
        <div className="space-y-4">
          {graph.insights.map((insight) => (
            <Card key={insight.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <p className="font-display text-lg leading-snug text-ink">
                  {insight.title}
                </p>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {t("confidence").replace(
                    "{value}",
                    `${confidencePct(insight.confidence)}%`,
                  )}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-body">
                {insight.body}
              </p>
            </Card>
          ))}
        </div>
      </Chapter>

      {/* Detailed analysis — one chapter per theme */}
      {graph.themes.map((theme) => (
        <Chapter key={theme.id} id={`theme-${theme.id}`} title={theme.label}>
          <div className="space-y-6">
            {theme.insights.map((insight) => (
              <div key={insight.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant={insight.kind === "concern" ? "warning" : "accent"}>
                    {insight.kind}
                  </Badge>
                  <span className="font-display text-base text-ink">
                    {insight.title}
                  </span>
                </div>
                <p className="text-body leading-relaxed">
                  {insight.body}{" "}
                  <CitationMarkers
                    insight={insight}
                    citationIndex={citationIndex}
                  />
                </p>
              </div>
            ))}
          </div>
        </Chapter>
      ))}

      {/* Recommendations */}
      <Chapter id="recommendations" title={t("recommendations")}>
        {concernInsights.length === 0 ? (
          <p className="text-body leading-relaxed">{t("noReportDescription")}</p>
        ) : (
          <ol className="space-y-4">
            {concernInsights.map((insight, i) => (
              <li key={insight.id} className="flex gap-4">
                <span className="mt-0.5 font-mono text-sm text-terracotta">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-ink">{insight.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-body">
                    {insight.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Chapter>

      {/* Appendix — citation list */}
      {orderedCitations.length > 0 && (
        <Chapter id="appendix" title={t("appendix")}>
          <ol className="space-y-3">
            {orderedCitations.map(({ num, citation }) => (
              <li key={citation.id} className="flex gap-3 text-sm">
                <span className="shrink-0 font-mono text-muted">[{num}]</span>
                <span className="leading-relaxed text-body">
                  &ldquo;{citation.quote_text}&rdquo;
                  <span className="ml-1 text-muted">— {citation.respondent_id}</span>
                </span>
              </li>
            ))}
          </ol>
        </Chapter>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Chapter({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-hairline py-10 first:border-t-0 first:pt-0"
    >
      <h2 className="mb-4 font-display text-2xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

function CitationMarkers({
  insight,
  citationIndex,
}: {
  insight: Insight;
  citationIndex: Map<string, number>;
}) {
  const nums = insight.supporting_evidence
    .map((cit) => citationIndex.get(cit.id))
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b);

  if (nums.length === 0) return null;

  return (
    <span className="whitespace-nowrap font-mono text-xs text-accent">
      {nums.map((n) => `[${n}]`).join("")}
    </span>
  );
}

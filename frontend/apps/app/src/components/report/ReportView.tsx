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
import { CitationLink } from "@/components/evidence/CitationLink";
import {
  buildReportCitationIndex,
  getOrderedReportCitations,
  getReportInsights,
} from "@/lib/reportModel";
import type { EvidenceGraph, Insight } from "@/types/evidence";

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
    { id: "methodology", title: t("methodology") },
    { id: "key-findings", title: t("keyFindings") },
  ];
  for (const theme of graph.themes) {
    chapters.push({ id: `theme-${theme.id}`, title: theme.label });
  }
  if (graph.insights.some((insight) => Boolean(insight.recommendation))) {
    chapters.push({ id: "recommendations", title: t("recommendations") });
  }
  if (graph.citations.length > 0) {
    chapters.push({ id: "appendix", title: t("appendix") });
  }
  return chapters;
}

function confidencePct(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportView({ graph }: { graph: EvidenceGraph }) {
  const t = useTranslations("app.report");
  const kindLabel: Record<Insight["kind"], string> = {
    theme: t("kindTheme"),
    verbatim: t("kindVerbatim"),
    persona: t("kindPersona"),
    metric: t("kindMetric"),
    concern: t("kindConcern"),
  };
  const citationIndex = useMemo(
    () => buildReportCitationIndex(graph),
    [graph],
  );

  const keyInsights = useMemo(
    () => getReportInsights(graph),
    [graph],
  );
  const recommendationInsights = useMemo(
    () => keyInsights.filter((insight) => Boolean(insight.recommendation)),
    [keyInsights],
  );
  const interviews = useMemo(
    () => graph.respondents.flatMap((respondent) => respondent.interviews),
    [graph.respondents],
  );
  const completedCount = interviews.filter(
    (interview) => interview.status === "completed",
  ).length;
  const participantLabels = useMemo(
    () =>
      new Map(
        graph.respondents.map((respondent, index) => [
          respondent.id,
          t("participant", { number: index + 1 }),
        ]),
      ),
    [graph.respondents, t],
  );

  const orderedCitations = useMemo(
    () => getOrderedReportCitations(graph, citationIndex),
    [citationIndex, graph],
  );

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

      <Chapter id="methodology" title={t("methodology")}>
        {graph.research_goal && (
          <div className="mb-5">
            <p className="overline mb-1">{t("researchGoal")}</p>
            <p className="leading-relaxed text-body">{graph.research_goal}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <MethodStat value={completedCount} label={t("completedInterviews")} />
          <MethodStat value={graph.respondents.length} label={t("participants")} />
          <MethodStat value={graph.citations.length} label={t("evidenceQuotes")} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-body">
          {t("methodologyDescription")}
        </p>
        {completedCount < 3 && (
          <p className="mt-3 border-l-2 border-warning pl-3 text-sm leading-relaxed text-body">
            {t("smallSampleWarning", { count: completedCount })}
          </p>
        )}
      </Chapter>

      {/* Key findings */}
      <Chapter id="key-findings" title={t("keyFindings")}>
        <div className="space-y-4">
          {keyInsights.map((insight) => (
            <Card
              key={insight.id}
              className="p-5 print:[break-inside:avoid]"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="font-display text-lg leading-snug text-ink">
                  {insight.title}
                </p>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {t("confidence", {
                    value: `${confidencePct(insight.confidence)}%`,
                  })}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-body">
                {insight.body}{" "}
                <CitationMarkers
                  insight={insight}
                  citationIndex={citationIndex}
                />
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
              <div key={insight.id} className="print:[break-inside:avoid]">
                {(theme.insights.length > 1 || insight.title !== theme.label) && (
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge
                      variant={insight.kind === "concern" ? "warning" : "accent"}
                    >
                      {kindLabel[insight.kind]}
                    </Badge>
                    <span className="font-display text-base text-ink">
                      {insight.title}
                    </span>
                  </div>
                )}
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
      {recommendationInsights.length > 0 && (
        <Chapter id="recommendations" title={t("recommendations")}>
          <ol className="space-y-4">
            {recommendationInsights.map((insight, i) => (
              <li
                key={insight.id}
                className="flex gap-4 print:[break-inside:avoid]"
              >
                <span className="mt-0.5 font-mono text-sm text-terracotta">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="leading-relaxed text-ink">
                    {insight.recommendation}{" "}
                    <CitationMarkers
                      insight={insight}
                      citationIndex={citationIndex}
                    />
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {t("addressesConcern", { concern: insight.title })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Chapter>
      )}

      {/* Appendix — citation list */}
      {orderedCitations.length > 0 && (
        <Chapter id="appendix" title={t("appendix")}>
          <ol className="space-y-3">
            {orderedCitations.map(({ num, citation }) => (
              <li
                key={citation.id}
                className="flex gap-3 text-sm print:[break-inside:avoid]"
              >
                <CitationLink citationId={citation.id} index={num} />
                <span className="leading-relaxed text-body">
                  &ldquo;{citation.quote_text}&rdquo;
                  <span className="ml-1 text-muted">
                    — {participantLabels.get(citation.respondent_id)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Chapter>
      )}
    </article>
  );
}

function MethodStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-card border border-hairline bg-paper-sunken p-3">
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="mt-1 text-xs leading-tight text-muted">{label}</p>
    </div>
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
      <h2 className="mb-4 font-display text-2xl text-ink print:[break-after:avoid-page]">
        {title}
      </h2>
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
    <span className="whitespace-nowrap">
      {nums.map((n) => {
        const citation = insight.supporting_evidence.find(
          (item) => citationIndex.get(item.id) === n,
        );
        return citation ? (
          <CitationLink key={citation.id} citationId={citation.id} index={n} />
        ) : null;
      })}
    </span>
  );
}

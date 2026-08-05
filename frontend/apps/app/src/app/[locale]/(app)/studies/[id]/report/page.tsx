"use client";

import { use, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@telepace/ui";
import { Link } from "@/i18n/navigation";
import { routes } from "@telepace/config";
import { EvidenceProvider, useEvidence } from "@/lib/evidence-store";
import { buildChapters, ReportView } from "@/components/report/ReportView";
import { ReportToc } from "@/components/report/ReportToc";
import { CitationProvider } from "@/components/evidence/CitationContext";
import { TranscriptPanel } from "@/components/evidence/TranscriptPanel";
import {
  buildReportCitationIndex,
  getOrderedReportCitations,
  getReportInsights,
} from "@/lib/reportModel";
import type { EvidenceGraph } from "@/types/evidence";

type Params = { id: string; locale: string };

export default function ReportPage({ params }: { params: Promise<Params> }) {
  const { id, locale } = use(params);
  return (
    <EvidenceProvider studyId={id}>
      <CitationProvider>
        <ReportPageInner studyId={id} locale={locale} />
        <TranscriptPanel />
      </CitationProvider>
    </EvidenceProvider>
  );
}

function ReportPageInner({
  studyId,
  locale,
}: {
  studyId: string;
  locale: string;
}) {
  const t = useTranslations("app.report");
  const td = useTranslations("app.studyDetail");
  const { graph, loading, error, reload } = useEvidence();

  const chapters = useMemo(
    () => (graph ? buildChapters(t, graph) : []),
    [graph, t],
  );

  const hasReport =
    graph !== null && (graph.themes.length > 0 || graph.insights.length > 0);
  const generatedTime =
    graph?.generated_at != null
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(graph.generated_at))
      : null;

  useEffect(() => {
    if (!graph) return;
    document.title = t("documentTitle", {
      study: graph.campaign_title || td("studyLabel"),
    });
  }, [graph, t, td]);

  function handleExportMarkdown() {
    if (!graph) return;
    const md = toMarkdown(graph, t, locale);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (graph.campaign_title || "telepace")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .trim()
      .slice(0, 80);
    a.download = `${safeTitle}-${t("title")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      data-report-page
      className="mx-auto max-w-content p-6 print:max-w-none print:p-0 md:p-10"
    >
      <div className="mb-6 print:hidden">
        <Link
          href={routes.app.studies.byId(studyId)}
          className="rounded-input text-sm text-muted transition-colors hover:text-ink active:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          ← {td("studyLabel")}
        </Link>
      </div>

      <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl text-ink">{t("title")}</h1>
          {graph?.campaign_title && (
            <p className="mt-2 text-base text-body">{graph.campaign_title}</p>
          )}
          {generatedTime && (
            <p className="mt-1 text-sm text-muted">
              {t("generatedAt", { time: generatedTime })}
            </p>
          )}
        </div>
        {hasReport && (
          <div className="flex shrink-0 gap-2 print:hidden">
            <Button variant="secondary" size="sm" onClick={handleExportMarkdown}>
              {t("exportMarkdown")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.print()}
              title={t("exportPdfDescription")}
            >
              {t("exportPdf")}
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <ReportSkeleton />
      ) : error ? (
        <EmptyState
          role="alert"
          title={t("loadError")}
          description={t("loadErrorDescription")}
          action={
            <Button size="sm" onClick={reload}>
              {t("retry")}
            </Button>
          }
        />
      ) : !hasReport ? (
        <EmptyState
          title={t("noReport")}
          description={t("noReportDescription")}
        />
      ) : (
        <div className="grid gap-10 md:grid-cols-12">
          <aside className="hidden print:hidden md:col-span-3 md:block">
            <ReportToc chapters={chapters} />
          </aside>
          <div className="print:col-span-12 md:col-span-9">
            <ReportView graph={graph!} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

function toMarkdown(
  graph: EvidenceGraph,
  t: (key: string, values?: Record<string, string | number>) => string,
  locale: string,
): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const completedCount = graph.respondents
    .flatMap((respondent) => respondent.interviews)
    .filter((interview) => interview.status === "completed").length;
  const participantNumbers = new Map(
    graph.respondents.map((respondent, index) => [respondent.id, index + 1]),
  );
  const citationNumbers = buildReportCitationIndex(graph);
  const orderedCitations = getOrderedReportCitations(graph, citationNumbers);
  const citationMarkers = (insight: EvidenceGraph["insights"][number]) => {
    const numbers = insight.supporting_evidence
      .map((citation) => citationNumbers.get(citation.id))
      .filter((number): number is number => number !== undefined)
      .filter((number, index, all) => all.indexOf(number) === index)
      .sort((a, b) => a - b);
    return numbers.length > 0
      ? ` ${numbers.map((number) => `[${number}]`).join("")}`
      : "";
  };

  push(
    `# ${graph.campaign_title ? `${graph.campaign_title} — ` : ""}${t("title")}`,
  );
  push();
  if (graph.generated_at) {
    push(
      `_${t("generatedAt", {
        time: new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(graph.generated_at)),
      })}_`,
    );
    push();
  }

  push(`## ${t("executive")}`);
  push();
  for (const theme of graph.themes) {
    const lead = theme.insights[0]?.body ? ` — ${theme.insights[0].body}` : "";
    push(`- **${theme.label}**${lead}`);
  }
  push();

  push(`## ${t("methodology")}`);
  push();
  if (graph.research_goal) {
    push(`**${t("researchGoal")}**: ${graph.research_goal}`);
    push();
  }
  push(
    `${t("completedInterviews")}: ${completedCount} · ${t("participants")}: ${graph.respondents.length} · ${t("evidenceQuotes")}: ${graph.citations.length}`,
  );
  push();
  push(t("methodologyDescription"));
  push();
  if (completedCount < 3) {
    push(`> ${t("smallSampleWarning", { count: completedCount })}`);
    push();
  }

  push(`## ${t("keyFindings")}`);
  push();
  for (const insight of getReportInsights(graph)) {
    const pct = Math.round(Math.min(1, Math.max(0, insight.confidence)) * 100);
    push(`### ${insight.title}`);
    push();
    push(`${insight.body}${citationMarkers(insight)}`);
    push();
    push(`_${t("confidence", { value: `${pct}%` })}_`);
    push();
  }

  push(`## ${t("detailedAnalysis")}`);
  push();
  for (const theme of graph.themes) {
    push(`### ${theme.label}`);
    push();
    for (const insight of theme.insights) {
      if (theme.insights.length > 1 || insight.title !== theme.label) {
        push(`**${insight.title}**`);
        push();
      }
      push(`${insight.body}${citationMarkers(insight)}`);
      push();
    }
  }

  const recommendations = graph.insights.filter((item) => item.recommendation);
  if (recommendations.length > 0) {
    push(`## ${t("recommendations")}`);
    push();
    recommendations.forEach((ins, i) => {
      push(
        `${i + 1}. ${ins.recommendation} _(${t("addressesConcern", {
          concern: ins.title,
        })})_`,
      );
    });
    push();
  }

  if (orderedCitations.length > 0) {
    push(`## ${t("appendix")}`);
    push();
    orderedCitations.forEach(({ citation: cit, num }) => {
      push(
        `${num}. "${cit.quote_text}" — ${t("participant", {
          number: participantNumbers.get(cit.respondent_id) ?? 1,
        })}`,
      );
    });
    push();
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function ReportSkeleton() {
  return (
    <div className="grid gap-10 md:grid-cols-12">
      <aside className="hidden space-y-3 md:col-span-3 md:block">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-36" />
      </aside>
      <div className="space-y-4 md:col-span-9">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-4/6" />
        <Skeleton className="mt-6 h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

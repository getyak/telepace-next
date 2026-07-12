"use client";

import { use, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@telepace/ui";
import { Link } from "@/i18n/navigation";
import { routes } from "@telepace/config";
import { EvidenceProvider, useEvidence } from "@/lib/evidence-store";
import { buildChapters, ReportView } from "@/components/report/ReportView";
import { ReportToc } from "@/components/report/ReportToc";
import type { EvidenceGraph } from "@/types/evidence";

type Params = { id: string; locale: string };

export default function ReportPage({ params }: { params: Promise<Params> }) {
  const { id } = use(params);
  return (
    <EvidenceProvider studyId={id}>
      <ReportPageInner studyId={id} />
    </EvidenceProvider>
  );
}

function ReportPageInner({ studyId }: { studyId: string }) {
  const t = useTranslations("app.report");
  const { graph, loading } = useEvidence();

  const chapters = useMemo(
    () => (graph ? buildChapters(t, graph) : []),
    [graph, t],
  );

  const hasReport =
    graph !== null && (graph.themes.length > 0 || graph.insights.length > 0);

  function handleExportMarkdown() {
    if (!graph) return;
    const md = toMarkdown(graph, t);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${studyId}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <div className="mb-6">
        <Link
          href={routes.app.studies.byId(studyId)}
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          ← {t("title")}
        </Link>
      </div>

      <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl text-ink">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted">
            {t("generatedAt").replace("{time}", new Date().toLocaleString())}
          </p>
        </div>
        {hasReport && (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportMarkdown}>
              {t("exportMarkdown")}
            </Button>
            <Button variant="ghost" size="sm" disabled title={t("exportPdf")}>
              {t("exportPdf")}
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <ReportSkeleton />
      ) : !hasReport ? (
        <EmptyState
          title={t("noReport")}
          description={t("noReportDescription")}
        />
      ) : (
        <div className="grid gap-10 md:grid-cols-12">
          <aside className="hidden md:col-span-3 md:block">
            <ReportToc chapters={chapters} />
          </aside>
          <div className="md:col-span-9">
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

function toMarkdown(graph: EvidenceGraph, t: (key: string) => string): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`# ${t("title")}`);
  push();
  push(`_${t("generatedAt").replace("{time}", new Date().toLocaleString())}_`);
  push();

  push(`## ${t("executive")}`);
  push();
  for (const theme of graph.themes) {
    const lead = theme.insights[0]?.body ? ` — ${theme.insights[0].body}` : "";
    push(`- **${theme.label}**${lead}`);
  }
  push();

  push(`## ${t("keyFindings")}`);
  push();
  for (const insight of graph.insights) {
    const pct = Math.round(Math.min(1, Math.max(0, insight.confidence)) * 100);
    push(`### ${insight.title}`);
    push();
    push(insight.body);
    push();
    push(`_${t("confidence").replace("{value}", `${pct}%`)}_`);
    push();
  }

  push(`## ${t("detailedAnalysis")}`);
  push();
  for (const theme of graph.themes) {
    push(`### ${theme.label}`);
    push();
    for (const insight of theme.insights) {
      push(`**${insight.title}**`);
      push();
      push(insight.body);
      push();
    }
  }

  const concerns = graph.themes
    .flatMap((th) => th.insights)
    .filter((ins) => ins.kind === "concern");
  if (concerns.length > 0) {
    push(`## ${t("recommendations")}`);
    push();
    concerns.forEach((ins, i) => {
      push(`${i + 1}. **${ins.title}** — ${ins.body}`);
    });
    push();
  }

  if (graph.citations.length > 0) {
    push(`## ${t("appendix")}`);
    push();
    graph.citations.forEach((cit, i) => {
      push(`${i + 1}. "${cit.quote_text}" — ${cit.respondent_id}`);
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

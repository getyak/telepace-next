"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dialog, EmptyState, Skeleton, toast } from "@telepace/ui";
import { routes } from "@telepace/config";
import { ResponseTable } from "@/components/responses";
import type { ResponseRow } from "@/types/evidence";

import {
  closeCampaign,
  getCampaign,
  getCampaignInsights,
  startCampaign,
  type CampaignDetail,
  type CampaignInsights,
  type InsightItem,
} from "@/lib/api";
import { friendlyMessage, type ErrorsCopyTable } from "@/lib/errors";

type Params = { id: string; locale: string };

const POLL_MS = 5000;

const statusVariant: Record<string, "accent" | "neutral" | "success"> = {
  live: "accent",
  ready: "success",
  draft: "neutral",
  closed: "neutral",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export default function StudyPage({ params }: { params: Promise<Params> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const justPublished = search.get("published") === "1";
  const t = useTranslations("errors");
  const errorsCopy = t.raw("") as ErrorsCopyTable;

  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [insights, setInsights] = useState<CampaignInsights | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const [d, i] = await Promise.all([getCampaign(id), getCampaignInsights(id)]);
    setDetail(d);
    setInsights(i);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    refresh().catch((err) => {
      if (!cancelled) setLoadError(friendlyMessage(err, errorsCopy).description);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Live studies keep themselves fresh: interviews land and insights appear
  // without a manual reload.
  const status = detail?.campaign.status;
  useEffect(() => {
    if (status !== "live") return;
    const t = window.setInterval(() => {
      refresh().catch(() => {
        /* transient poll failure — next tick retries */
      });
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [status, refresh]);

  async function handleCopy() {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.share_url);
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error({ title: "Couldn't copy", description: "Select the link and copy it manually." });
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await startCampaign(id);
      await refresh();
      toast.success({ title: "Study is live", description: "Share the link to start collecting interviews." });
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      toast.error({ title: copy.title, description: copy.description });
    } finally {
      setPublishing(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    try {
      await closeCampaign(id);
      setConfirmClose(false);
      await refresh();
      toast.success({ title: "Study closed", description: "The share link no longer accepts new interviews." });
    } catch (err) {
      const copy = friendlyMessage(err, errorsCopy);
      toast.error({ title: copy.title, description: copy.description });
    } finally {
      setClosing(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-content p-10">
        <Link href={routes.app.root} className="text-sm text-muted transition-colors hover:text-ink">
          ← All studies
        </Link>
        <div className="mt-16 text-center">
          <h1 className="font-display text-3xl">Couldn't load this study.</h1>
          <p className="mt-3 text-body">{loadError}</p>
          <Button className="mt-6" onClick={() => location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-content p-10">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-8 h-12 w-2/3" />
        <Skeleton className="mt-4 h-5 w-1/2" />
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
        </div>
      </div>
    );
  }

  const { campaign, share_url: shareUrl, progress } = detail;
  const spec = campaign.spec;
  const outline = spec.outline?.items ?? [];
  const target = spec.target_completions ?? 0;
  const inProgress = Math.max(0, progress.started - progress.completed - progress.abandoned);
  const isLive = campaign.status === "live";
  const canPublish = campaign.status === "draft" || campaign.status === "ready";
  const totalInsights = insights?.total ?? 0;

  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <div className="mb-6">
        <Link href={routes.app.root} className="text-sm text-muted transition-colors hover:text-ink">
          ← All studies
        </Link>
      </div>

      {justPublished && isLive && (
        <div className="mb-10 rounded-card border border-accent/20 bg-accent-soft p-6">
          <p className="overline mb-1 text-accent">Your study is live</p>
          <p className="text-body">
            Send this link to the people you want to hear from. Interviews and insights
            land on this page as they complete.
          </p>
        </div>
      )}

      <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <p className="overline">Study</p>
            <Badge variant={statusVariant[campaign.status] ?? "neutral"}>
              {isLive && <span className="tp-pulse-slow inline-block h-1.5 w-1.5 rounded-full bg-accent" />}
              {campaign.status}
            </Badge>
          </div>
          <h1 className="font-display text-4xl">{campaign.title}</h1>
          {spec.goal && <p className="mt-3 max-w-2xl text-body">{spec.goal}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {canPublish && (
            <Button size="sm" loading={publishing} onClick={handlePublish}>
              {publishing ? "Publishing…" : "Publish study"}
            </Button>
          )}
          {isLive && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmClose(true)}>
              Close study
            </Button>
          )}
        </div>
      </header>

      {(isLive || campaign.status === "ready") && (
        <section className="mb-10 rounded-card border border-hairline bg-paper-elevated p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <p className="overline mb-2">Share with respondents</p>
              <p className="truncate font-mono text-sm text-ink" title={shareUrl}>
                {shareUrl}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? "Copied ✓" : "Copy link"}
              </Button>
              <a href={shareUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm">
                  Preview ↗
                </Button>
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="mb-14 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Completed" value={`${progress.completed} / ${target}`} tone="accent" />
        <Metric label="In progress" value={String(inProgress)} />
        <Metric label="Median length" value={formatDuration(progress.avg_duration_seconds)} />
        <Metric label="Insights" value={String(totalInsights)} />
      </section>

      <InsightsSection insights={insights} isLive={isLive} completed={progress.completed} />

      <section className="grid gap-10 md:grid-cols-12">
        <div className="md:col-span-7">
          <p className="overline mb-4">Discussion guide</p>
          {outline.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline p-8 text-center text-muted">
              No questions yet — refine this study in the design chat.
            </div>
          ) : (
            <ol className="space-y-3">
              {outline.map((q) => (
                <li key={q.order} className="rounded-card border border-hairline bg-paper-elevated p-4">
                  <div className="flex gap-4">
                    <div className="w-6 pt-0.5 font-mono text-sm text-muted">
                      {String(q.order).padStart(2, "0")}
                    </div>
                    <div className="flex-1">
                      <p className="text-ink">{q.question}</p>
                      <p className="mt-1 text-xs text-muted">Goal: {q.goal}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="space-y-6 md:col-span-5">
          <div className="rounded-card border border-hairline bg-paper-elevated p-6">
            <p className="overline mb-3">Setup</p>
            <ul className="space-y-2 text-sm text-body">
              <li>
                · Target <span className="text-ink">{target} completions</span>
              </li>
              <li>
                · Estimated <span className="text-ink">~{spec.outline?.estimated_duration_minutes ?? 15} min</span> per interview
              </li>
              <li>
                · Channels{" "}
                <span className="text-ink">
                  {(spec.channels ?? []).map((c) => c.kind.replace("_", " ")).join(", ") || "web text"}
                </span>
              </li>
            </ul>
          </div>
          {spec.target_persona && (
            <div className="rounded-card border border-hairline bg-paper-elevated p-6">
              <p className="overline mb-3">Target persona</p>
              <p className="text-sm leading-relaxed text-body">{spec.target_persona}</p>
            </div>
          )}
          {(spec.hypotheses ?? []).length > 0 && (
            <div className="rounded-card border border-hairline bg-paper-elevated p-6">
              <p className="overline mb-3">Hypotheses</p>
              <ul className="space-y-2 text-sm text-body">
                {spec.hypotheses!.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="pt-0.5 font-mono text-xs text-muted">H{i + 1}</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>

      <ResponsesSection />

      <Dialog open={confirmClose} onClose={() => setConfirmClose(false)} title="Close this study?">
        <p className="text-sm leading-relaxed text-body">
          The share link stops accepting new interviews. Completed interviews and
          insights stay available.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)}>
            Keep it live
          </Button>
          <Button variant="danger" size="sm" loading={closing} onClick={handleClose}>
            {closing ? "Closing…" : "Close study"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-5">
      <p className="overline mb-2">{label}</p>
      <p className={`font-display text-3xl ${tone === "accent" ? "text-accent" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-2" title={`Confidence ${pct}%`}>
      <div className="h-1 w-16 overflow-hidden rounded-pill bg-paper-sunken">
        <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted">{pct}%</span>
    </div>
  );
}

function InsightsSection({
  insights,
  isLive,
  completed,
}: {
  insights: CampaignInsights | null;
  isLive: boolean;
  completed: number;
}) {
  const hasInsights = (insights?.total ?? 0) > 0;

  return (
    <section className="mb-14">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="overline">Insights</p>
        {hasInsights && insights?.generated_at && (
          <span className="text-xs text-muted">
            updated {new Date(insights.generated_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {!hasInsights ? (
        <div className="rounded-card border border-dashed border-hairline p-10 text-center">
          <p className="font-display text-xl text-ink">
            {completed > 0 ? "Analysis in progress…" : "Waiting for the first interview."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">
            {completed > 0
              ? "The Analyst agent is reading the transcript. Themes and verbatims land here in under a minute."
              : isLive
                ? "Share the link above — themes, verbatims and concerns appear here as interviews complete."
                : "Publish the study and share the link — insights appear as interviews complete."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            {insights!.themes.map((t) => (
              <ThemeCard key={t.id} item={t} />
            ))}
            {insights!.concerns.map((c) => (
              <ConcernCard key={c.id} item={c} />
            ))}
          </div>
          <div className="space-y-3">
            {insights!.verbatims.map((v) => (
              <VerbatimCard key={v.id} item={v} />
            ))}
            {insights!.personas.map((p) => (
              <PersonaCard key={p.id} item={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ThemeCard({ item }: { item: InsightItem }) {
  const summary = str(item.body.summary) ?? str(item.body.description);
  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge variant="accent">theme</Badge>
          <p className="mt-2 font-display text-lg leading-snug text-ink">{item.title}</p>
          {summary && <p className="mt-1.5 text-sm leading-relaxed text-body">{summary}</p>}
        </div>
        <ConfidenceBar value={item.confidence} />
      </div>
    </div>
  );
}

function ConcernCard({ item }: { item: InsightItem }) {
  const summary = str(item.body.summary) ?? str(item.body.description);
  return (
    <div className="rounded-card border border-terracotta/20 bg-paper-elevated p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge variant="warning">concern</Badge>
          <p className="mt-2 font-display text-lg leading-snug text-ink">{item.title}</p>
          {summary && <p className="mt-1.5 text-sm leading-relaxed text-body">{summary}</p>}
        </div>
        <ConfidenceBar value={item.confidence} />
      </div>
    </div>
  );
}

function VerbatimCard({ item }: { item: InsightItem }) {
  const quote = str(item.body.quote) ?? item.title;
  const speaker = str(item.body.speaker) ?? str(item.body.attribution);
  return (
    <figure className="rounded-card border border-hairline bg-paper-elevated p-5">
      <Badge variant="neutral">verbatim</Badge>
      <blockquote className="mt-2 border-l-2 border-accent pl-4 text-[15px] leading-relaxed text-ink">
        "{quote}"
      </blockquote>
      {speaker && <figcaption className="mt-2 pl-4 text-xs text-muted">— {speaker}</figcaption>}
    </figure>
  );
}

function PersonaCard({ item }: { item: InsightItem }) {
  const summary = str(item.body.summary) ?? str(item.body.description);
  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-5">
      <Badge variant="success">persona</Badge>
      <p className="mt-2 font-display text-lg leading-snug text-ink">{item.title}</p>
      {summary && <p className="mt-1.5 text-sm leading-relaxed text-body">{summary}</p>}
    </div>
  );
}

const MOCK_RESPONSES: ResponseRow[] = [
  {
    respondent_id: "resp-001",
    external_ref: "P-2847",
    source: "csv",
    channel: "web_text",
    duration_seconds: 847,
    quality_score: 0.92,
    segments: { age: "25-34", role: "UX Designer", frequency: "Daily" },
    bullet_summary:
      "Strongly values color accuracy for client work. Willing to pay premium for factory-calibrated displays. Currently uses Dell UltraSharp.",
    completed_at: "2026-07-07T14:23:00Z",
  },
  {
    respondent_id: "resp-002",
    external_ref: "P-3102",
    source: "link",
    channel: "web_voice",
    duration_seconds: 1234,
    quality_score: 0.78,
    segments: { age: "35-44", role: "Product Manager", frequency: "Weekly" },
    bullet_summary:
      "Prioritizes multi-monitor setups for dashboard workflows. Finds current market options too expensive for team-wide deployment.",
    completed_at: "2026-07-07T15:45:00Z",
  },
  {
    respondent_id: "resp-003",
    external_ref: "P-1590",
    source: "crm",
    channel: "phone_outbound",
    duration_seconds: 602,
    quality_score: 0.45,
    segments: { age: "18-24", role: "Student", frequency: "Rarely" },
    bullet_summary:
      "Budget-conscious buyer. Uses laptop screen for most tasks. Would consider external monitor only if under $200.",
    completed_at: "2026-07-06T09:12:00Z",
  },
  {
    respondent_id: "resp-004",
    source: "api",
    channel: "email",
    duration_seconds: 390,
    quality_score: 0.21,
    segments: { age: "45-54", role: "CTO" },
    bullet_summary:
      "Responses were vague and off-topic. Could not articulate specific display needs beyond general preference for larger screens.",
    exclusion_reason: "Low engagement — single-word answers",
    completed_at: "2026-07-05T18:30:00Z",
  },
  {
    respondent_id: "resp-005",
    external_ref: "P-4421",
    source: "csv",
    channel: "web_text",
    duration_seconds: 1580,
    quality_score: 0.88,
    segments: { age: "25-34", role: "Software Engineer", frequency: "Daily" },
    bullet_summary:
      "Heavy multitasker who uses tiling window managers. Wants ultrawide curved displays with high refresh rate for coding and gaming.",
    completed_at: "2026-07-08T11:05:00Z",
  },
  {
    respondent_id: "resp-006",
    external_ref: "P-5003",
    source: "link",
    channel: "sms",
    duration_seconds: 455,
    quality_score: 0.65,
    segments: { age: "55-64", role: "Freelance Writer", frequency: "Monthly" },
    bullet_summary:
      "Eye strain is the primary concern. Wants flicker-free, blue-light-filter displays. Not interested in high resolution beyond readability.",
    completed_at: "2026-07-08T16:40:00Z",
  },
];

function ResponsesSection() {
  const t = useTranslations("app.responses");

  if (MOCK_RESPONSES.length === 0) {
    return (
      <section className="mt-14">
        <p className="overline mb-4">{t("title")}</p>
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      </section>
    );
  }

  return (
    <section className="mt-14">
      <p className="overline mb-4">{t("title")}</p>
      <ResponseTable
        rows={MOCK_RESPONSES}
        t={(key, values) =>
          values ? t(key, values as Record<string, string>) : t(key)
        }
      />
    </section>
  );
}

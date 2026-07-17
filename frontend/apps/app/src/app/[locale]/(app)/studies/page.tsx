"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, ProgressBar, Skeleton, cn } from "@telepace/ui";
import { routes } from "@telepace/config";
import { StudiesIcon } from "@telepace/icons";

import { PageHeader } from "@/components/app/PageHeader";
import { useErrorsCopy } from "@/components/app/ErrorsCopyContext";
import {
  completionFraction,
  isLiveStatus,
  studyStatusVariant,
} from "@/components/agent/studyStatus";
import { getCampaigns, type CampaignListItem } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";

function useRelativeTime() {
  const t = useTranslations("app.studies");
  return (iso: string): string => {
    const then = new Date(iso).getTime();
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return t("relativeJustNow");
    if (mins < 60) return t("relativeMinutes", { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t("relativeHours", { count: hours });
    const days = Math.round(hours / 24);
    return t("relativeDays", { count: days });
  };
}

/**
 * Flag studies that share an identical title so a list littered with same-named
 * entries reads as "you have 3 of these", not as noise. Returns, per study id, a
 * {index, total} when its title is shared — index 1-based by creation order
 * (oldest first) — and nothing when the title is unique. Never hides or merges
 * rows: each study keeps its own id, progress, and link; this only labels them.
 */
function computeDuplicateTags(
  studies: CampaignListItem[],
): Map<string, { index: number; total: number }> {
  const byTitle = new Map<string, CampaignListItem[]>();
  for (const s of studies) {
    const key = s.title.trim().toLowerCase();
    const bucket = byTitle.get(key);
    if (bucket) bucket.push(s);
    else byTitle.set(key, [s]);
  }
  const tags = new Map<string, { index: number; total: number }>();
  for (const bucket of byTitle.values()) {
    if (bucket.length < 2) continue;
    // Oldest first, so "1 of N" is the original and later dupes count up.
    const ordered = [...bucket].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    ordered.forEach((s, i) => tags.set(s.id, { index: i + 1, total: ordered.length }));
  }
  return tags;
}

export default function StudiesPage() {
  const t = useTranslations("app.studies");
  const statusLabel: Record<string, string> = {
    live: t("statusLive"),
    ready: t("statusReady"),
    draft: t("statusDraft"),
    closed: t("statusClosed"),
  };
  const errorsCopy = useErrorsCopy();
  const relativeTime = useRelativeTime();
  const [studies, setStudies] = useState<CampaignListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const duplicateTags = useMemo(
    () => computeDuplicateTags(studies ?? []),
    [studies],
  );

  useEffect(() => {
    let cancelled = false;
    getCampaigns()
      .then((rows) => {
        if (!cancelled) setStudies(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyMessage(err, errorsCopy).description);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <Link href={routes.app.studies.new}>
            <Button>{t("newStudy")}</Button>
          </Link>
        }
      />

      {error ? (
        <EmptyState
          icon={<StudiesIcon size={24} />}
          title={t("errorTitle")}
          description={error}
          action={<Button onClick={() => location.reload()}>{t("retry")}</Button>}
        />
      ) : studies === null ? (
        <div className="space-y-3">
          <Skeleton className="h-[84px] w-full" />
          <Skeleton className="h-[84px] w-full" />
          <Skeleton className="h-[84px] w-full" />
        </div>
      ) : studies.length === 0 ? (
        <EmptyState
          icon={<StudiesIcon size={24} />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Link href={routes.app.studies.new}>
              <Button>{t("newStudyShort")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Overview band — three quiet counts that anchor a long list, the way
              the resume theme's sidebar profile block grounds the page. Pure
              client-side aggregation over the loaded rows; serif numerals + an
              overline label keep it in the editorial voice, not a dashboard. */}
          <StudiesOverview studies={studies} />

          <Card className="divide-y divide-hairline overflow-hidden">
            {studies.map((s) => {
              const live = isLiveStatus(s.status);
              const closed = s.status === "closed";
              const inFlight = Math.max(0, s.progress.started - s.progress.completed);
              const dup = duplicateTags.get(s.id);
              return (
                <Link
                  key={s.id}
                  href={routes.app.studies.byId(s.id)}
                  // Apple: acknowledge the touch the instant the pointer goes down —
                  // hover tints on approach, `active` presses a shade deeper the
                  // moment it's held, and the press settles ~3× faster than it
                  // releases so the row feels answered, not laggy.
                  className="tp-press tp-press-row flex items-center gap-4 px-6 py-4 transition-[color,background-color,transform] duration-200 hover:bg-paper active:bg-paper-sunken"
                >
                  {/* Title + meta take the room; a long title truncates rather
                      than pushing the progress column off the row. */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate font-display text-lg leading-snug",
                        closed && "text-muted",
                      )}
                    >
                      {s.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted">
                      <span className="truncate">
                        {t("questionsUpdated", {
                          count: s.question_count,
                          time: relativeTime(s.updated_at),
                        })}
                      </span>
                      {dup && (
                        <span className="shrink-0 rounded-pill bg-paper-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {t("duplicateTag", { index: dup.index, total: dup.total })}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Progress column — a fixed-width block so every row's bar
                      aligns into one vertical rhythm (the resume skill-bar idea,
                      in sage). The bar is the primary signal; the count trails. */}
                  <div className="hidden w-40 shrink-0 sm:block">
                    <ProgressBar
                      value={completionFraction(s.progress.completed, s.target_completions)}
                      tone={live ? "accent" : "muted"}
                      label={t("completedCount", {
                        completed: s.progress.completed,
                        target: s.target_completions,
                      })}
                    />
                    <p className="mt-1.5 text-xs text-body">
                      <span className="font-mono">
                        {s.progress.completed}
                        <span className="text-muted">/{s.target_completions}</span>
                      </span>
                      {inFlight > 0 && (
                        <span className="text-muted">
                          {" "}
                          · {t("inProgressCount", { count: inFlight })}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Status — the live pulse dot is the one bit of motion here,
                      reserved for studies actually collecting right now. */}
                  <div className="w-20 shrink-0 text-right">
                    <Badge
                      variant={studyStatusVariant[s.status] ?? "neutral"}
                      className={closed ? "opacity-70" : undefined}
                    >
                      {live && (
                        <span className="tp-pulse-slow inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                      {statusLabel[s.status] ?? s.status}
                    </Badge>
                  </div>

                  <span aria-hidden className="shrink-0 text-muted">
                    &rarr;
                  </span>
                </Link>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

function StudiesOverview({ studies }: { studies: CampaignListItem[] }) {
  const t = useTranslations("app.studies");
  const total = studies.length;
  const live = studies.filter((s) => isLiveStatus(s.status)).length;
  const completed = studies.reduce((sum, s) => sum + s.progress.completed, 0);

  return (
    <dl className="mb-6 flex flex-wrap gap-x-10 gap-y-4 border-b border-hairline pb-6">
      <OverviewStat label={t("overviewTotal")} value={total} />
      <OverviewStat label={t("overviewLive")} value={live} live={live > 0} />
      <OverviewStat label={t("overviewCompleted")} value={completed} />
    </dl>
  );
}

function OverviewStat({
  label,
  value,
  live,
}: {
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <div>
      <dt className="overline mb-1 flex items-center gap-1.5">
        {live && (
          <span className="tp-pulse-slow inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        )}
        {label}
      </dt>
      <dd className="font-display text-3xl leading-none text-ink">{value}</dd>
    </div>
  );
}

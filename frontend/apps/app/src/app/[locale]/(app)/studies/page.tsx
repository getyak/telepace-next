"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Skeleton } from "@telepace/ui";
import { routes } from "@telepace/config";
import { StudiesIcon } from "@telepace/icons";

import { PageHeader } from "@/components/app/PageHeader";
import { getCampaigns, type CampaignListItem } from "@/lib/api";
import { friendlyMessage, type ErrorsCopyTable } from "@/lib/errors";

const statusVariant: Record<string, "accent" | "neutral" | "success" | "warning"> = {
  live: "accent",
  ready: "success",
  draft: "neutral",
  closed: "neutral",
};

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

export default function StudiesPage() {
  const tErrors = useTranslations("errors");
  const t = useTranslations("app.studies");
  const errorsCopy = tErrors.raw("") as ErrorsCopyTable;
  const relativeTime = useRelativeTime();
  const [studies, setStudies] = useState<CampaignListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Skeleton className="h-[72px] w-full" />
          <Skeleton className="h-[72px] w-full" />
          <Skeleton className="h-[72px] w-full" />
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
        <div className="divide-y divide-hairline rounded-card border border-hairline bg-paper-elevated">
          {studies.map((s) => (
            <Link
              key={s.id}
              href={routes.app.studies.byId(s.id)}
              className="grid grid-cols-12 items-center gap-2 px-6 py-5 transition-colors hover:bg-paper"
            >
              <div className="col-span-12 sm:col-span-6">
                <p className="font-display text-lg leading-snug">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("questionsUpdated", { count: s.question_count, time: relativeTime(s.updated_at) })}
                </p>
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Badge variant={statusVariant[s.status] ?? "neutral"}>{s.status}</Badge>
              </div>
              <div className="col-span-6 text-sm text-body sm:col-span-3">
                {t("completedCount", { completed: s.progress.completed, target: s.target_completions })}
                {s.progress.started > s.progress.completed && (
                  <span className="text-muted"> · {t("inProgressCount", { count: s.progress.started - s.progress.completed })}</span>
                )}
              </div>
              <div className="col-span-2 text-right text-muted sm:col-span-1">&rarr;</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

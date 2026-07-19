"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, EmptyState, icons, toast } from "@telepace/ui";

export type ThemeDef = {
  id: string;
  titleKey: string;
  confidence: number;
  quoteCount: number;
  tagKey: string;
  tagStyle: string;
  quoteKeys: string[];
};

/**
 * The interactive insights board. The three header actions used to be inert
 * decoration — Filter, Push to Notion, and Dismiss did nothing, a silent
 * failure. Now:
 *   - Dismiss removes the card (with an Undo toast — nothing is lost silently).
 *   - Filter narrows the visible themes by tag.
 *   - Push to Notion, with no integration wired up, gives an explicit
 *     "not connected" message instead of pretending to work.
 */
export function InsightsBoard({ themes }: { themes: ThemeDef[] }) {
  const t = useTranslations("app.insights");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Distinct tags present, for the filter control.
  const tags = useMemo(
    () => Array.from(new Set(themes.map((th) => th.tagKey))),
    [themes],
  );

  const visible = useMemo(
    () =>
      themes.filter(
        (th) => !dismissed.has(th.id) && (tagFilter === null || th.tagKey === tagFilter),
      ),
    [themes, dismissed, tagFilter],
  );

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    toast.success({
      title: t("dismissedToast"),
      // Undo keeps the action reversible — a dismiss should never be a trap.
      action: {
        label: t("restore"),
        onClick: () =>
          setDismissed((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          }),
      },
    });
  }

  function cycleFilter() {
    // Cycle: All → tag[0] → tag[1] → … → All. A lightweight control that keeps
    // the header uncluttered while making the filter genuinely functional.
    if (tags.length === 0) return;
    setTagFilter((cur) => {
      if (cur === null) return tags[0];
      const i = tags.indexOf(cur);
      return i < 0 || i === tags.length - 1 ? null : tags[i + 1];
    });
  }

  function pushToNotion() {
    // No Notion integration is configured, so be honest rather than silent.
    toast.error({
      title: t("pushToNotion"),
      description: t("notionNotConnected"),
    });
  }

  const filterLabel =
    tagFilter === null ? t("filterAll") : t("filterByTag", { tag: t(tagFilter) });

  return (
    <>
      <div className="mb-8 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={cycleFilter}>
          {filterLabel}
        </Button>
        <Button size="sm" onClick={pushToNotion}>
          {t("pushToNotion")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<icons.InsightsIcon size={28} />}
          title={t("emptyTitle")}
          description={
            dismissed.size > 0 ? t("dismissedEmpty") : t("emptyDescription")
          }
        />
      ) : (
        <div className="grid gap-6">
          {visible.map((theme) => (
            <Card key={theme.id} className="p-8">
              <div className="mb-6 flex items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className={`inline-block rounded-pill border px-2.5 py-0.5 text-xs ${theme.tagStyle}`}
                    >
                      {t(theme.tagKey)}
                    </span>
                    <span className="text-xs text-muted">
                      {t("confidenceLabel", {
                        value: theme.confidence.toFixed(2),
                        count: theme.quoteCount,
                      })}
                    </span>
                  </div>
                  <h2 className="font-display text-3xl leading-tight">
                    {t(theme.titleKey)}
                  </h2>
                </div>
                <div>
                  <Button variant="ghost" size="sm" onClick={() => dismiss(theme.id)}>
                    {t("dismiss")}
                  </Button>
                </div>
              </div>
              <div className="space-y-3 border-l-2 border-accent pl-6">
                {theme.quoteKeys.map((qk, i) => (
                  <blockquote key={i} className="text-body italic leading-relaxed">
                    {`“${t(qk)}”`}
                  </blockquote>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

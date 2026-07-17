"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, Button, EmptyState, icons, toast } from "@telepace/ui";

export type InboxItemDef = {
  id: string;
  kind: string;
  studyKey: string;
  bodyKey: string;
  timeKey: string;
  urgent?: boolean;
};

const kindVariant: Record<string, "danger" | "accent" | "neutral"> = {
  escalation: "danger",
  insight: "accent",
  progress: "neutral",
  system: "neutral",
};

const kindLabelKey: Record<string, string> = {
  escalation: "kindEscalation",
  insight: "kindInsight",
  progress: "kindProgress",
  system: "kindSystem",
};

/**
 * Interactive inbox. The two header actions used to be inert buttons on a
 * server component (a silent failure — they looked clickable but did nothing).
 * Now "Mark all read" dims every item and offers Undo, and "Filter" cycles the
 * visible items by kind. Read/empty states are real.
 */
export function InboxBoard({ items }: { items: InboxItemDef[] }) {
  const t = useTranslations("app.inbox");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const kinds = useMemo(
    () => Array.from(new Set(items.map((i) => i.kind))),
    [items],
  );

  const visible = useMemo(
    () => items.filter((i) => kindFilter === null || i.kind === kindFilter),
    [items, kindFilter],
  );

  function markAllRead() {
    const prev = readIds;
    setReadIds(new Set(items.map((i) => i.id)));
    toast.success({
      title: t("markedReadToast"),
      action: { label: t("undo"), onClick: () => setReadIds(prev) },
    });
  }

  function cycleFilter() {
    if (kinds.length === 0) return;
    setKindFilter((cur) => {
      if (cur === null) return kinds[0];
      const i = kinds.indexOf(cur);
      return i < 0 || i === kinds.length - 1 ? null : kinds[i + 1];
    });
  }

  const filterLabel =
    kindFilter === null
      ? t("filterAll")
      : t("filterBy", { kind: t(kindLabelKey[kindFilter] ?? kindFilter) });

  const allRead = items.length > 0 && readIds.size === items.length;

  return (
    <>
      <div className="mb-6 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={markAllRead}>
          {t("markAllRead")}
        </Button>
        <Button variant="secondary" size="sm" onClick={cycleFilter}>
          {filterLabel}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<icons.InboxIcon size={28} />}
          title={t("noneForFilter")}
          description=""
        />
      ) : allRead && kindFilter === null ? (
        <EmptyState
          icon={<icons.InboxIcon size={28} />}
          title={t("allReadEmpty")}
          description=""
        />
      ) : (
        <Card className="divide-y divide-hairline overflow-hidden">
          {visible.map((it) => {
            const read = readIds.has(it.id);
            return (
              <article
                key={it.id}
                className={`grid grid-cols-12 items-start gap-4 px-6 py-5 ${read ? "opacity-55" : ""}`}
              >
                <div className="col-span-3 sm:col-span-2">
                  <Badge variant={kindVariant[it.kind] ?? "neutral"}>
                    {t(kindLabelKey[it.kind] ?? it.kind)}
                  </Badge>
                </div>
                <div className="col-span-6 sm:col-span-8">
                  <p className="mb-1 text-xs text-muted">{t(it.studyKey)}</p>
                  <p className={it.urgent && !read ? "font-medium text-ink" : "text-body"}>
                    {t(it.bodyKey)}
                  </p>
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2 text-right text-sm text-muted sm:col-span-2">
                  {read && (
                    <span className="rounded-pill bg-paper-sunken px-1.5 py-0.5 text-[10px] text-muted">
                      {t("readBadge")}
                    </span>
                  )}
                  {t(it.timeKey)}
                </div>
              </article>
            );
          })}
        </Card>
      )}
    </>
  );
}

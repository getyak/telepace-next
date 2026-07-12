"use client";

import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";
import type { HistoryEntry } from "./useHistory";

interface VersionHistoryProps<T> {
  history: Array<HistoryEntry<T>>;
  currentIndex: number;
  onRestore: (index: number) => void;
}

function formatRelative(timestamp: number, now: number): string {
  const diff = Math.max(0, now - timestamp);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}

export function VersionHistory<T>({
  history,
  currentIndex,
  onRestore,
}: VersionHistoryProps<T>) {
  const t = useTranslations("app.versions");
  const now = Date.now();

  return (
    <aside className="w-64 shrink-0 border-l border-hairline pl-4">
      <h2 className="font-display text-lg text-ink mb-4">{t("title")}</h2>

      {history.length <= 1 ? (
        <p className="text-sm text-muted">{t("noHistory")}</p>
      ) : (
        <ol className="space-y-1">
          {history.map((entry, index) => {
            const isCurrent = index === currentIndex;
            const label = entry.label ?? t("changes", { count: index });
            return (
              <li key={`${entry.timestamp}-${index}`}>
                <button
                  type="button"
                  onClick={() => onRestore(index)}
                  disabled={isCurrent}
                  title={isCurrent ? t("current") : t("restore")}
                  className={cn(
                    "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                    isCurrent
                      ? "bg-accent/10 text-accent cursor-default"
                      : "text-body hover:bg-ink/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{label}</span>
                    <span className="font-mono text-xs text-muted shrink-0">
                      {formatRelative(entry.timestamp, now)}
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="text-xs text-accent">
                      {t("current")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

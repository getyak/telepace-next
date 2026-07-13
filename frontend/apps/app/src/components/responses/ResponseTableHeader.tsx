"use client";

import { Button, Input, cn } from "@telepace/ui";
import { useTranslations } from "next-intl";

type ResponseTableHeaderProps = {
  search: string;
  onSearchChange: (value: string) => void;
  channelFilter: string | null;
  onChannelFilter: (value: string | null) => void;
  sourceFilter: string | null;
  onSourceFilter: (value: string | null) => void;
  availableChannels: string[];
  availableSources: string[];
  onExport: () => void;
  totalCount: number;
  filteredCount: number;
};

export function ResponseTableHeader({
  search,
  onSearchChange,
  channelFilter,
  onChannelFilter,
  sourceFilter,
  onSourceFilter,
  availableChannels,
  availableSources,
  onExport,
  totalCount,
  filteredCount,
}: ResponseTableHeaderProps) {
  const t = useTranslations("app.responses");

  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 max-w-xs text-sm"
        />
        <select
          value={channelFilter ?? ""}
          onChange={(e) => onChannelFilter(e.target.value || null)}
          className={cn(
            "h-8 rounded-input border border-hairline bg-transparent px-2 text-sm text-body",
            "focus-visible:border-ink focus-visible:outline-none",
          )}
        >
          <option value="">{t("allChannels")}</option>
          {availableChannels.map((ch) => (
            <option key={ch} value={ch}>
              {ch.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter ?? ""}
          onChange={(e) => onSourceFilter(e.target.value || null)}
          className={cn(
            "h-8 rounded-input border border-hairline bg-transparent px-2 text-sm text-body",
            "focus-visible:border-ink focus-visible:outline-none",
          )}
        >
          <option value="">{t("allSources")}</option>
          {availableSources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">
          {t("countLabel", { filtered: filteredCount, total: totalCount })}
        </span>
        <Button variant="secondary" size="sm" onClick={onExport}>
          {t("exportCsv")}
        </Button>
      </div>
    </div>
  );
}

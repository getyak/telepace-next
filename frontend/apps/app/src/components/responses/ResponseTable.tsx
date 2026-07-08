"use client";

import { useMemo, useState } from "react";
import { Badge, cn } from "@telepace/ui";
import type { ResponseRow } from "@/types/evidence";
import { ResponseTableHeader } from "./ResponseTableHeader";
import { exportResponsesCsv } from "./export-csv";

type SortKey =
  | "respondent"
  | "channel"
  | "duration"
  | "quality"
  | "completed_at";

type ResponseTableProps = {
  rows: ResponseRow[];
  className?: string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

function formatDuration(seconds: number | undefined): string {
  if (seconds == null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function qualityColor(score: number): string {
  if (score >= 0.7) return "text-accent";
  if (score >= 0.3) return "text-warning";
  return "text-terracotta";
}

function displayName(row: ResponseRow): string {
  return row.external_ref ?? row.respondent_id.slice(0, 8);
}

function matchesSearch(row: ResponseRow, query: string): boolean {
  const q = query.toLowerCase();
  if (displayName(row).toLowerCase().includes(q)) return true;
  if (row.bullet_summary.toLowerCase().includes(q)) return true;
  for (const v of Object.values(row.segments)) {
    if (v.toLowerCase().includes(q)) return true;
  }
  return false;
}

function compareFn(key: SortKey, dir: "asc" | "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return (a: ResponseRow, b: ResponseRow): number => {
    switch (key) {
      case "respondent":
        return mul * displayName(a).localeCompare(displayName(b));
      case "channel":
        return mul * a.channel.localeCompare(b.channel);
      case "duration":
        return mul * ((a.duration_seconds ?? 0) - (b.duration_seconds ?? 0));
      case "quality":
        return mul * ((a.quality_score ?? 0) - (b.quality_score ?? 0));
      case "completed_at": {
        const da = a.completed_at ?? "";
        const db = b.completed_at ?? "";
        return mul * da.localeCompare(db);
      }
      default:
        return 0;
    }
  };
}

export function ResponseTable({ rows, className, t }: ResponseTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("completed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const availableChannels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channel))).sort(),
    [rows],
  );
  const availableSources = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let result = rows;
    if (search) result = result.filter((r) => matchesSearch(r, search));
    if (channelFilter) result = result.filter((r) => r.channel === channelFilter);
    if (sourceFilter) result = result.filter((r) => r.source === sourceFilter);
    return [...result].sort(compareFn(sortKey, sortDir));
  }, [rows, search, channelFilter, sourceFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleExport() {
    exportResponsesCsv(filtered, "responses.csv");
  }

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const columns: { key: SortKey | null; label: string }[] = [
    { key: "respondent", label: t("colRespondent") },
    { key: "channel", label: t("colChannel") },
    { key: "duration", label: t("colDuration") },
    { key: "quality", label: t("colQuality") },
    { key: null, label: t("colSegments") },
    { key: null, label: t("colSummary") },
    { key: null, label: t("colExclusion") },
  ];

  return (
    <div className={cn("rounded-card border border-hairline bg-paper-elevated", className)}>
      <ResponseTableHeader
        search={search}
        onSearchChange={setSearch}
        channelFilter={channelFilter}
        onChannelFilter={setChannelFilter}
        sourceFilter={sourceFilter}
        onSourceFilter={setSourceFilter}
        availableChannels={availableChannels}
        availableSources={availableSources}
        onExport={handleExport}
        totalCount={rows.length}
        filteredCount={filtered.length}
        t={t}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-t border-hairline">
              {columns.map((col) => (
                <th
                  key={col.label}
                  className={cn(
                    "overline px-4 py-2.5 text-left font-normal",
                    col.key && "cursor-pointer select-none hover:text-ink",
                  )}
                  onClick={col.key ? () => handleSort(col.key!) : undefined}
                >
                  {col.label}
                  {col.key && sortArrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filtered.map((row) => (
              <tr
                key={row.respondent_id}
                className="transition-colors hover:bg-paper"
              >
                <td className="px-4 py-3 text-sm font-medium text-ink">
                  {displayName(row)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="neutral">
                    {row.channel.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-body">
                  {formatDuration(row.duration_seconds)}
                </td>
                <td className="px-4 py-3">
                  {row.quality_score != null ? (
                    <span className={cn("font-mono text-sm", qualityColor(row.quality_score))}>
                      {row.quality_score.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">--</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(row.segments).map(([k, v]) => (
                      <Badge key={k} variant="neutral" className="text-[11px]">
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="max-w-xs px-4 py-3 text-sm text-body">
                  <p className="line-clamp-2">{row.bullet_summary}</p>
                </td>
                <td className="px-4 py-3 text-sm">
                  {row.exclusion_reason ? (
                    <span className="italic text-terracotta">
                      {row.exclusion_reason}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

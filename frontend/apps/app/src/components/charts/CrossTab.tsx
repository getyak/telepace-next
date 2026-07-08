"use client";

import { cn } from "@telepace/ui";

import type { CrossTabRow } from "@/types/evidence";

type CrossTabProps = {
  title?: string;
  segmentLabel: string;
  bucketLabels: string[];
  rows: CrossTabRow[];
  baseNPerBucket: number[];
  className?: string;
};

export function CrossTab({
  title,
  segmentLabel,
  bucketLabels,
  rows,
  baseNPerBucket,
  className,
}: CrossTabProps) {
  return (
    <div className={cn("w-full", className)}>
      {title && (
        <p className="overline mb-4">{title}</p>
      )}
      <div className="overflow-x-auto rounded-card border border-hairline bg-paper-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="divide-x divide-hairline border-b border-hairline">
              <th className="overline px-4 py-3 text-left font-normal">
                {segmentLabel}
              </th>
              {bucketLabels.map((label) => (
                <th
                  key={label}
                  className="overline px-4 py-3 text-right font-normal"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((row) => (
              <tr key={row.metric} className="divide-x divide-hairline">
                <td className="px-4 py-3 text-ink">{row.metric}</td>
                {row.values.map((val, i) => (
                  <td key={i} className="px-4 py-3 text-right">
                    <span className="font-display text-ink">{val}%</span>
                    <span className="ml-1.5 text-xs text-muted">
                      ({row.counts[i]})
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="divide-x divide-hairline bg-paper-sunken/50">
              <td className="px-4 py-2 text-xs text-muted">N</td>
              {baseNPerBucket.map((n, i) => (
                <td key={i} className="px-4 py-2 text-right font-mono text-xs text-muted">
                  {n}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

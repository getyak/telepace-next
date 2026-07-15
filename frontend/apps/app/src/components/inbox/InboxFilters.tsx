"use client";

import { cn } from "@telepace/ui";

export type InboxKind = "escalation" | "insight" | "progress" | "system";
export type FilterValue = "all" | InboxKind;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "escalation", label: "Escalation" },
  { value: "insight", label: "Insight" },
  { value: "progress", label: "Progress" },
  { value: "system", label: "System" },
];

type InboxFiltersProps = {
  active: FilterValue;
  onChange: (value: FilterValue) => void;
  counts: Record<FilterValue, number>;
};

export function InboxFilters({ active, onChange, counts }: InboxFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter inbox items">
      {FILTERS.map((f) => {
        const isActive = active === f.value;
        return (
          <button
            key={f.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(f.value)}
            className={cn(
              "tp-press tp-press-control inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-sm " +
                "transition-[color,background-color,border-color,transform] " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
              isActive
                ? "border-accent bg-accent text-paper"
                : "border-hairline bg-paper-elevated text-body hover:border-accent/40 hover:text-ink",
            )}
          >
            {f.label}
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-pill text-xs min-w-[1.25rem] h-5 px-1",
                isActive ? "bg-paper/20 text-paper" : "bg-paper-sunken text-muted",
              )}
            >
              {counts[f.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

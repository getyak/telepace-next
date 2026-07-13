import * as React from "react";
import { cn } from "../cn";

type ProgressTone = "accent" | "success" | "muted";

const toneFill: Record<ProgressTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  muted: "bg-muted",
};

/**
 * A thin, quiet progress bar — a sunken paper track with a filled bar. This is
 * the shared "how far along" primitive: study-completion fractions on the list
 * page and agent chat cards, target progress on the detail metrics, confidence
 * scores on insights. One visual language for progress everywhere.
 *
 * Presentational only: the caller passes an already-computed `value` in [0, 1]
 * (clamped again here defensively). Announced to assistive tech via
 * role="progressbar" + aria-valuenow; pass `label` for the accessible name.
 */
export const ProgressBar = React.forwardRef<
  HTMLDivElement,
  {
    /** Fraction filled, 0–1. Clamped defensively. */
    value: number;
    tone?: ProgressTone;
    /** Accessible name, e.g. "Completed 3 of 10". */
    label?: string;
    className?: string;
  }
>(({ value, tone = "accent", label, className }, ref) => {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-1 overflow-hidden rounded-pill bg-paper-sunken", className)}
    >
      <div
        className={cn(
          "h-full rounded-pill transition-[width] duration-500 motion-reduce:transition-none",
          toneFill[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
});
ProgressBar.displayName = "ProgressBar";

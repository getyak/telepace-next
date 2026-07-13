/**
 * Shared study-status vocabulary — one source of truth for how a campaign's
 * status maps to a badge variant, whether it reads as "live" (gets the pulse
 * dot), and how a completed/target pair becomes a progress fraction.
 *
 * Both the studies list page and the agent chat's structured campaign cards
 * render the same statuses; keeping this here stops the two surfaces from
 * drifting apart. Labels stay OUT of this module — callers inject localized
 * strings via next-intl, so this stays i18n-free and trivially testable.
 */

import type { BadgeVariant } from "@telepace/ui";

/** The campaign lifecycle states the projector emits. */
export type StudyStatus = "live" | "ready" | "draft" | "closed";

/**
 * Status → badge variant. `live` reads as the accent (sage) "in progress",
 * `ready` as success, `draft`/`closed` stay quiet neutral — closed is
 * additionally dimmed at the call site to read as "archived".
 */
export const studyStatusVariant: Record<string, BadgeVariant> = {
  live: "accent",
  ready: "success",
  draft: "neutral",
  closed: "neutral",
};

/** A study is "live" when it's actively collecting — earns the pulse dot. */
export function isLiveStatus(status: string): boolean {
  return status === "live";
}

/**
 * Fraction of the completion target reached, clamped to [0, 1]. A zero or
 * missing target yields 0 (no divide-by-zero, no bar wider than its track).
 */
export function completionFraction(completed: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(1, Math.max(0, completed / target));
}

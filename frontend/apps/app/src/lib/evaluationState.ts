import type { EvaluationState } from "@/lib/api";

/**
 * Keep event-versioned reviewer state monotonic when polling and mutations
 * finish out of order.
 */
export function newestEvaluationState(
  current: EvaluationState | null,
  incoming: EvaluationState,
): EvaluationState {
  return current && current.version > incoming.version ? current : incoming;
}

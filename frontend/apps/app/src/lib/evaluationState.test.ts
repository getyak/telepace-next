import { describe, expect, it } from "vitest";

import type { EvaluationState } from "@/lib/api";
import { newestEvaluationState } from "@/lib/evaluationState";

function state(version: number): EvaluationState {
  return { version } as EvaluationState;
}

describe("newestEvaluationState", () => {
  it("accepts the first loaded state", () => {
    expect(newestEvaluationState(null, state(3)).version).toBe(3);
  });

  it("accepts an equal or newer event version", () => {
    expect(newestEvaluationState(state(3), state(3)).version).toBe(3);
    expect(newestEvaluationState(state(3), state(4)).version).toBe(4);
  });

  it("rejects a stale poll that finishes after a reviewer mutation", () => {
    expect(newestEvaluationState(state(4), state(3)).version).toBe(4);
  });
});

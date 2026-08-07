import { describe, expect, it } from "vitest";

import { parseCalibrationLines } from "./evaluationCalibration";

describe("parseCalibrationLines", () => {
  it("parses development and holdout decisions with rationale", () => {
    const result = parseCalibrationLines(
      [
        "pair-1 | refund | development | artifact://a1 | artifact://b1 | a | b | policy exception",
        "pair-2 | refund | holdout | artifact://a2 | artifact://b2 | b | b | preserved boundary",
      ].join("\n"),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      pair_id: "pair-1",
      split: "development",
      judge_verdict: "a",
      expert_verdict: "b",
    });
    expect(result[1].split).toBe("holdout");
  });

  it("rejects duplicates, invalid splits, and incomplete rows", () => {
    expect(() =>
      parseCalibrationLines(
        [
          "pair-1 | refund | development | a | b | a | a",
          "pair-1 | refund | holdout | a | b | b | b",
        ].join("\n"),
      ),
    ).toThrow(/duplicate pair id/);
    expect(() =>
      parseCalibrationLines("pair-1 | refund | tuning | a | b | a | a"),
    ).toThrow(/split must be/);
    expect(() => parseCalibrationLines("pair-1 | refund")).toThrow(
      /expected at least 7/,
    );
  });
});

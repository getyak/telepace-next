import type { CalibrationExampleInput } from "./api";

const VERDICTS = new Set(["a", "b", "tie", "pass", "fail"]);
const SPLITS = new Set(["development", "holdout"]);

/**
 * Parse one auditable blinded comparison per line:
 * pair | slice | split | A ref | B ref | judge | expert | rationale
 */
export function parseCalibrationLines(raw: string): CalibrationExampleInput[] {
  const examples: CalibrationExampleInput[] = [];
  const pairIds = new Set<string>();
  for (const [index, source] of raw.split(/\r?\n/).entries()) {
    const line = source.trim();
    if (!line) continue;
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 7) {
      throw new Error(`line ${index + 1}: expected at least 7 pipe-separated fields`);
    }
    const [
      pairId,
      slice,
      split,
      candidateARef,
      candidateBRef,
      judgeVerdict,
      expertVerdict,
      ...rationaleParts
    ] = parts;
    if (!pairId || !slice || !candidateARef || !candidateBRef) {
      throw new Error(`line ${index + 1}: pair, slice, and both artifact refs are required`);
    }
    if (pairIds.has(pairId)) {
      throw new Error(`line ${index + 1}: duplicate pair id '${pairId}'`);
    }
    if (!SPLITS.has(split)) {
      throw new Error(`line ${index + 1}: split must be development or holdout`);
    }
    if (!VERDICTS.has(judgeVerdict) || !VERDICTS.has(expertVerdict)) {
      throw new Error(`line ${index + 1}: verdict must be a, b, tie, pass, or fail`);
    }
    pairIds.add(pairId);
    examples.push({
      pair_id: pairId,
      slice,
      split: split as CalibrationExampleInput["split"],
      candidate_a_ref: candidateARef,
      candidate_b_ref: candidateBRef,
      judge_verdict: judgeVerdict as CalibrationExampleInput["judge_verdict"],
      expert_verdict: expertVerdict as CalibrationExampleInput["expert_verdict"],
      rationale: rationaleParts.join(" | "),
    });
  }
  if (examples.length === 0) {
    throw new Error("at least one blinded comparison is required");
  }
  return examples;
}

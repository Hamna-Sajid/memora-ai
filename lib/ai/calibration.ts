import type { MatchResult } from "@/lib/ai/types";

export type CalibrationOutcome =
  | "correct-match"
  | "correct-rejection"
  | "missed-known"
  | "wrong-confident-match";

export type CalibrationDecision = {
  expectedLabel: string | null;
  matchedLabel: string | null;
  score: number;
  confident: boolean;
  outcome: CalibrationOutcome;
};

export function analyzeCalibrationMatch(
  expectedLabel: string | null,
  match: MatchResult | null,
  threshold: number,
): CalibrationDecision {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError("Calibration threshold must be between 0 and 1.");
  }

  const normalizedExpected = expectedLabel?.trim() || null;
  const score = match?.score ?? 0;
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new TypeError("Calibration match score must be between 0 and 1.");
  }

  const matchedLabel = match?.item.label ?? null;
  const confident = Boolean(match) && score >= threshold;
  let outcome: CalibrationOutcome;

  if (normalizedExpected === null) {
    outcome = confident ? "wrong-confident-match" : "correct-rejection";
  } else if (!confident) {
    outcome = "missed-known";
  } else if (
    matchedLabel?.localeCompare(normalizedExpected, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    outcome = "correct-match";
  } else {
    outcome = "wrong-confident-match";
  }

  return {
    expectedLabel: normalizedExpected,
    matchedLabel,
    score,
    confident,
    outcome,
  };
}

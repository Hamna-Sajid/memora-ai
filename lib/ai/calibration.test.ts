import { describe, expect, it } from "vitest";

import { analyzeCalibrationMatch } from "@/lib/ai/calibration";
import type { MatchResult } from "@/lib/ai/types";

const match: MatchResult = {
  item: {
    id: "item-1",
    label: "Suduri",
    type: "med",
    noteText: "A familiar item.",
    audioUrl: "https://example.test/audio.webm",
    language: "en",
  },
  score: 0.9,
};

describe("analyzeCalibrationMatch", () => {
  it("marks a confident expected item as correct", () => {
    expect(analyzeCalibrationMatch("suduri", match, 0.8).outcome).toBe(
      "correct-match",
    );
  });

  it("marks an unknown below threshold as a correct rejection", () => {
    expect(
      analyzeCalibrationMatch(null, { ...match, score: 0.79 }, 0.8).outcome,
    ).toBe("correct-rejection");
  });

  it("flags a confident unknown match as unsafe", () => {
    expect(analyzeCalibrationMatch(null, match, 0.8).outcome).toBe(
      "wrong-confident-match",
    );
  });

  it("marks an expected item below threshold as missed", () => {
    expect(
      analyzeCalibrationMatch("Suduri", { ...match, score: 0.79 }, 0.8)
        .outcome,
    ).toBe("missed-known");
  });

  it("marks the wrong confident label as unsafe", () => {
    expect(analyzeCalibrationMatch("Glasses", match, 0.8).outcome).toBe(
      "wrong-confident-match",
    );
  });

  it("rejects invalid scores and thresholds", () => {
    expect(() => analyzeCalibrationMatch(null, match, 1.1)).toThrow(RangeError);
    expect(() =>
      analyzeCalibrationMatch(null, { ...match, score: Number.NaN }, 0.8),
    ).toThrow(TypeError);
  });
});

import { describe, expect, it } from "vitest";

import {
  isConfirmedBy,
  requiresConfirmation,
} from "@/lib/ai/confirmation";
import type { RecallItem, RecallResult } from "@/lib/ai/types";

const snakers: RecallItem = {
  id: "snakers-id",
  label: "Snakers",
  type: "object",
  noteText: "These are Snakers chips.",
  audioUrl: "https://example.test/snakers.webm",
  language: "en",
};

function recognised(
  score: number,
  item: RecallItem = snakers,
): RecallResult {
  return { notSure: false, item, score };
}

const rejected: RecallResult = {
  notSure: true,
  score: 0.76,
  reason: "below-threshold",
};

describe("borderline recognition confirmation", () => {
  it("requires another look for a borderline Snakers result", () => {
    expect(requiresConfirmation(recognised(0.77))).toBe(true);
    expect(requiresConfirmation(recognised(0.7999))).toBe(true);
  });

  it("accepts a strong Snakers result without another look", () => {
    expect(requiresConfirmation(recognised(0.8))).toBe(false);
  });

  it("does not apply the Snakers confirmation band to other items", () => {
    expect(
      requiresConfirmation(
        recognised(0.75, { ...snakers, id: "suduri-id", label: "Suduri" }),
      ),
    ).toBe(false);
    expect(requiresConfirmation(rejected)).toBe(false);
  });

  it("confirms only when both looks recognise the same item", () => {
    const first = recognised(0.78);

    expect(isConfirmedBy(first, recognised(0.79))).toBe(true);
    expect(isConfirmedBy(first, rejected)).toBe(false);
    expect(
      isConfirmedBy(
        first,
        recognised(0.8, { ...snakers, id: "different-item" }),
      ),
    ).toBe(false);
  });
});

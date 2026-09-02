import { describe, expect, it, vi } from "vitest";

import { PROVISIONAL_CONFIDENCE_THRESHOLD, recall } from "@/lib/ai/recall";
import type {
  MatchItem,
  MatchResult,
  RecallItem,
} from "@/lib/ai/types";

const photo = new Blob(["image bytes"], { type: "image/jpeg" });
const embedding = new Array(512).fill(0).map((_, index) => index / 512);

const item: RecallItem = {
  id: "item-1",
  label: "Suduri cough syrup",
  type: "med",
  noteText: "This is your cough syrup.",
  audioUrl: "https://example.test/audio/item-1.webm",
  language: "en",
};

function match(score: number, matchedItem = item): MatchResult {
  return { item: matchedItem, score };
}

function dependencies(result: MatchResult | null) {
  return {
    embed: vi.fn().mockResolvedValue(embedding),
    matchItem: vi.fn().mockResolvedValue(result) as MatchItem,
  };
}

describe("recall", () => {
  it("returns a confident match above the provisional threshold", async () => {
    const { embed, matchItem } = dependencies(match(0.91));

    const result = await recall(photo, matchItem, { embed });

    expect(result).toEqual({ notSure: false, item, score: 0.91 });
    expect(embed).toHaveBeenCalledWith(photo);
    expect(matchItem).toHaveBeenCalledWith(embedding);
  });

  it("treats a score exactly at the threshold as confident", async () => {
    const { embed, matchItem } = dependencies(
      match(PROVISIONAL_CONFIDENCE_THRESHOLD),
    );

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: false,
      item,
      score: PROVISIONAL_CONFIDENCE_THRESHOLD,
    });
  });

  it("returns not sure below the threshold without exposing the item", async () => {
    const { embed, matchItem } = dependencies(match(0.79));

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0.79,
      reason: "below-threshold",
    });
  });

  it("supports a stricter injected threshold", async () => {
    const { embed, matchItem } = dependencies(match(0.85));

    await expect(
      recall(photo, matchItem, { embed, threshold: 0.9 }),
    ).resolves.toEqual({
      notSure: true,
      score: 0.85,
      reason: "below-threshold",
    });
  });

  it("returns not sure when the matcher finds nothing", async () => {
    const { embed, matchItem } = dependencies(null);

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "no-match",
    });
  });

  it("fails closed when embedding throws", async () => {
    const embed = vi.fn().mockRejectedValue(new Error("model unavailable"));
    const matchItem = vi.fn() as MatchItem;

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "embedding-error",
    });
    expect(matchItem).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong vector length", new Array(511).fill(1)],
    ["non-finite vector", new Array(512).fill(Number.NaN)],
  ])("fails closed for an invalid %s", async (_label, invalidEmbedding) => {
    const embed = vi.fn().mockResolvedValue(invalidEmbedding);
    const matchItem = vi.fn() as MatchItem;

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "embedding-error",
    });
    expect(matchItem).not.toHaveBeenCalled();
  });

  it("fails closed when the matcher throws", async () => {
    const embed = vi.fn().mockResolvedValue(embedding);
    const matchItem = vi.fn().mockRejectedValue(new Error("database offline"));

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "matcher-error",
    });
  });

  it.each([
    ["NaN", Number.NaN],
    ["negative", -0.1],
    ["above one", 1.1],
  ])("fails closed for an invalid %s match score", async (_label, score) => {
    const { embed, matchItem } = dependencies(match(score));

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "invalid-match",
    });
  });

  it("fails closed for a malformed matched item", async () => {
    const malformedItem = { ...item, id: "" };
    const { embed, matchItem } = dependencies(match(0.95, malformedItem));

    await expect(recall(photo, matchItem, { embed })).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "invalid-match",
    });
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid threshold %s as a developer error",
    async (threshold) => {
      const { embed, matchItem } = dependencies(match(0.9));

      await expect(
        recall(photo, matchItem, { embed, threshold }),
      ).rejects.toThrow(RangeError);
      expect(embed).not.toHaveBeenCalled();
      expect(matchItem).not.toHaveBeenCalled();
    },
  );
});

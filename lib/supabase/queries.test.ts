import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireConfiguration: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  requireSupabaseConfiguration: mocks.requireConfiguration,
  supabase: {
    rpc: mocks.rpc,
  },
}));

import { matchItem, saveItem } from "@/lib/supabase/queries";
import { recallFromDatabase } from "@/lib/ai/database-recall";

const embedding = new Array(512).fill(0).map((_, index) => index / 512);

const databaseRow = {
  id: "item-1",
  label: "Suduri cough syrup",
  note_text: "This is your cough syrup.",
  audio_url: "https://example.test/audio/item-1.webm",
  type: "med",
  language: "en",
  score: 0.91,
};

beforeEach(() => {
  mocks.requireConfiguration.mockReset();
  mocks.rpc.mockReset();
});

describe("matchItem", () => {
  it("maps the database row to the recall contract", async () => {
    mocks.rpc.mockResolvedValue({ data: [databaseRow], error: null });

    await expect(matchItem(embedding)).resolves.toEqual({
      item: {
        id: "item-1",
        label: "Suduri cough syrup",
        noteText: "This is your cough syrup.",
        audioUrl: "https://example.test/audio/item-1.webm",
        type: "med",
        language: "en",
      },
      score: 0.91,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("match_item", {
      query_embedding: embedding,
    });
  });

  it.each([null, [], {}])("returns null for no result: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(matchItem(embedding)).resolves.toBeNull();
  });

  it("surfaces the database error for recall to fail closed", async () => {
    const databaseError = new Error("database unavailable");
    mocks.rpc.mockResolvedValue({ data: null, error: databaseError });

    await expect(matchItem(embedding)).rejects.toBe(databaseError);
  });

  it("reports missing Supabase configuration through the matcher", async () => {
    mocks.requireConfiguration.mockImplementationOnce(() => {
      throw new Error("Supabase is not configured.");
    });

    await expect(matchItem(embedding)).rejects.toThrow(
      "Supabase is not configured.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["short", new Array(511).fill(0)],
    ["non-finite", new Array(512).fill(Number.NaN)],
  ])("rejects a %s embedding before calling Supabase", async (_name, vector) => {
    await expect(matchItem(vector)).rejects.toThrow(
      "Expected 512 finite embedding values.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing id", { ...databaseRow, id: null }],
    ["invalid type", { ...databaseRow, type: "unknown" }],
    ["invalid language", { ...databaseRow, language: "fr" }],
    ["negative score", { ...databaseRow, score: -0.1 }],
    ["score above one", { ...databaseRow, score: 1.1 }],
    ["non-numeric score", { ...databaseRow, score: "0.91" }],
  ])("rejects a malformed database result: %s", async (_name, row) => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });

    await expect(matchItem(embedding)).rejects.toThrow(TypeError);
  });
});

describe("recallFromDatabase", () => {
  it("connects a browser embedding to the production matcher", async () => {
    mocks.rpc.mockResolvedValue({ data: [databaseRow], error: null });
    const embed = vi.fn().mockResolvedValue(embedding);

    await expect(
      recallFromDatabase(
        new Blob(["image bytes"], { type: "image/jpeg" }),
        { embed },
      ),
    ).resolves.toEqual({
      notSure: false,
      item: {
        id: "item-1",
        label: "Suduri cough syrup",
        noteText: "This is your cough syrup.",
        audioUrl: "https://example.test/audio/item-1.webm",
        type: "med",
        language: "en",
      },
      score: 0.91,
    });
    expect(embed).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("fails closed when Supabase returns a malformed row", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...databaseRow, score: "0.91" }],
      error: null,
    });

    await expect(
      recallFromDatabase(new Blob(["image bytes"]), {
        embed: vi.fn().mockResolvedValue(embedding),
      }),
    ).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "matcher-error",
    });
  });
});

describe("saveItem validation", () => {
  const validInput = {
    label: "Suduri cough syrup",
    type: "med" as const,
    note_raw: "Cough syrup",
    note_text: "This is your cough syrup.",
    audio_url: "https://example.test/audio/item-1.webm",
    language: "en" as const,
    vectors: [embedding],
    photo_urls: ["https://example.test/photos/item-1.jpeg"],
  };

  it("requires at least one enrollment embedding", async () => {
    await expect(
      saveItem({ ...validInput, vectors: [], photo_urls: [] }),
    ).rejects.toThrow("At least one enrollment embedding is required.");
  });

  it("requires one photo URL for every embedding", async () => {
    await expect(
      saveItem({ ...validInput, photo_urls: [] }),
    ).rejects.toThrow("Every enrollment embedding requires one photo URL.");
  });

  it("rejects an invalid enrollment embedding", async () => {
    await expect(
      saveItem({ ...validInput, vectors: [new Array(511).fill(0)] }),
    ).rejects.toThrow("Expected 512 finite embedding values.");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireConfiguration: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  requireSupabaseConfiguration: mocks.requireConfiguration,
  supabase: {
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
}));

import { matchItem, saveItem } from "@/lib/supabase/queries";
import { recallFromDatabase } from "@/lib/ai/database-recall";

const embedding = new Array(512).fill(0).map((_, index) => index / 512);
const patientId = "11111111-1111-4111-8111-111111111111";
const secondPatientId = "22222222-2222-4222-8222-222222222222";

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
  mocks.storageFrom.mockReset();
  mocks.createSignedUrl.mockReset();
  mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
});

describe("matchItem", () => {
  it("maps the database row to the recall contract", async () => {
    mocks.rpc.mockResolvedValue({ data: [databaseRow], error: null });

    await expect(matchItem(embedding, patientId)).resolves.toEqual({
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
      target_patient_id: patientId,
    });
  });

  it.each([null, [], {}])("returns null for no result: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(matchItem(embedding, patientId)).resolves.toBeNull();
  });

  it("surfaces the database error for recall to fail closed", async () => {
    const databaseError = new Error("database unavailable");
    mocks.rpc.mockResolvedValue({ data: null, error: databaseError });

    await expect(matchItem(embedding, patientId)).rejects.toBe(databaseError);
  });

  it("reports missing Supabase configuration through the matcher", async () => {
    mocks.requireConfiguration.mockImplementationOnce(() => {
      throw new Error("Supabase is not configured.");
    });

    await expect(matchItem(embedding, patientId)).rejects.toThrow(
      "Supabase is not configured.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a patient scope before calling the matcher", async () => {
    await expect(matchItem(embedding, "not-a-patient-id")).rejects.toThrow(
      "Patient id must be a valid UUID.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps identical recognition requests isolated by patient", async () => {
    mocks.rpc.mockImplementation(
      (_functionName: string, args: { target_patient_id: string }) =>
        Promise.resolve({
          data: [{
            ...databaseRow,
            id: args.target_patient_id === patientId ? "item-a" : "item-b",
            label: args.target_patient_id === patientId
              ? "Patient A prescription"
              : "Patient B prescription",
          }],
          error: null,
        }),
    );

    const [patientAResult, patientBResult] = await Promise.all([
      matchItem(embedding, patientId),
      matchItem(embedding, secondPatientId),
    ]);

    expect(patientAResult?.item.label).toBe("Patient A prescription");
    expect(patientBResult?.item.label).toBe("Patient B prescription");
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "match_item", {
      query_embedding: embedding,
      target_patient_id: patientId,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "match_item", {
      query_embedding: embedding,
      target_patient_id: secondPatientId,
    });
  });

  it("turns a private audio object path into a short-lived signed URL", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...databaseRow, audio_url: `${patientId}/note.webm` }],
      error: null,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/signed-audio" },
      error: null,
    });

    const result = await matchItem(embedding, patientId);

    expect(mocks.storageFrom).toHaveBeenCalledWith("audio");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      `${patientId}/note.webm`,
      3600,
    );
    expect(result?.item.audioUrl).toBe("https://example.test/signed-audio");
  });

  it.each([
    ["short", new Array(511).fill(0)],
    ["non-finite", new Array(512).fill(Number.NaN)],
  ])("rejects a %s embedding before calling Supabase", async (_name, vector) => {
    await expect(matchItem(vector, patientId)).rejects.toThrow(
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

    await expect(matchItem(embedding, patientId)).rejects.toThrow(TypeError);
  });
});

describe("recallFromDatabase", () => {
  it("connects a browser embedding to the production matcher", async () => {
    mocks.rpc.mockResolvedValue({ data: [databaseRow], error: null });
    const embed = vi.fn().mockResolvedValue(embedding);

    await expect(
      recallFromDatabase(
        new Blob(["image bytes"], { type: "image/jpeg" }),
        patientId,
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
      recallFromDatabase(
        new Blob(["image bytes"]),
        patientId,
        { embed: vi.fn().mockResolvedValue(embedding) },
      ),
    ).resolves.toEqual({
      notSure: true,
      score: 0,
      reason: "matcher-error",
    });
  });
});

describe("saveItem validation", () => {
  const validInput = {
    patient_id: patientId,
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

  it("requires a valid patient scope", async () => {
    await expect(
      saveItem({ ...validInput, patient_id: "global" }),
    ).rejects.toThrow("Patient id must be a valid UUID.");
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

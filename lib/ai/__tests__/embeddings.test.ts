import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractor: vi.fn(),
  pipeline: vi.fn(),
  env: {
    allowLocalModels: true,
    allowRemoteModels: true,
    localModelPath: "",
    useBrowserCache: true,
    useWasmCache: true,
  },
}));

vi.mock("@huggingface/transformers", () => ({
  env: mocks.env,
  pipeline: mocks.pipeline,
}));

type EmbeddingsModule = typeof import("@/lib/ai/embeddings");

async function importEmbeddings(): Promise<EmbeddingsModule> {
  return import("@/lib/ai/embeddings");
}

function validTensor(value = 1) {
  return { data: new Float32Array(512).fill(value) };
}

beforeEach(() => {
  vi.resetModules();
  mocks.extractor.mockReset();
  mocks.pipeline.mockReset();
  mocks.env.allowLocalModels = true;
  mocks.env.allowRemoteModels = true;
  mocks.env.localModelPath = "";
  mocks.env.useBrowserCache = true;
  mocks.env.useWasmCache = true;
  mocks.extractor.mockResolvedValue(validTensor());
  mocks.pipeline.mockResolvedValue(mocks.extractor);
});

describe("warmEmbeddingModel", () => {
  it("loads one local CLIP extractor for repeated and concurrent calls", async () => {
    const { CLIP_MODEL_ID, warmEmbeddingModel } = await importEmbeddings();

    await Promise.all([
      warmEmbeddingModel(),
      warmEmbeddingModel(),
      warmEmbeddingModel(),
    ]);
    await warmEmbeddingModel();

    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.pipeline).toHaveBeenCalledWith(
      "image-feature-extraction",
      CLIP_MODEL_ID,
      { device: "wasm", dtype: "q8" },
    );
    expect(mocks.env.allowLocalModels).toBe(true);
    expect(mocks.env.allowRemoteModels).toBe(false);
    expect(mocks.env.localModelPath).toBe("/models/");
    expect(mocks.env.useBrowserCache).toBe(false);
    expect(mocks.env.useWasmCache).toBe(false);
  });

  it("clears a failed loader so a later warm-up can retry", async () => {
    mocks.pipeline
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(mocks.extractor);

    const { warmEmbeddingModel } = await importEmbeddings();

    await expect(warmEmbeddingModel()).rejects.toMatchObject({
      code: "MODEL_LOAD_FAILED",
    });
    await expect(warmEmbeddingModel()).resolves.toBeUndefined();

    expect(mocks.pipeline).toHaveBeenCalledTimes(2);
  });
});

describe("embedImage", () => {
  it("returns a normalized 512-number embedding", async () => {
    const { embedImage } = await importEmbeddings();

    const result = await embedImage(
      new Blob(["image bytes"], { type: "image/jpeg" }),
    );
    const magnitude = Math.sqrt(
      result.reduce((sum, value) => sum + value * value, 0),
    );

    expect(result).toHaveLength(512);
    expect(magnitude).toBeCloseTo(1, 10);
    expect(mocks.extractor).toHaveBeenCalledTimes(1);
  });

  it("reuses the warmed extractor for embedding", async () => {
    const { embedImage, warmEmbeddingModel } = await importEmbeddings();

    await warmEmbeddingModel();
    await embedImage("data:image/jpeg;base64,AA==");
    await embedImage("https://example.test/image.jpg");

    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.extractor).toHaveBeenCalledTimes(2);
  });

  it("uses the source from an HTML image element", async () => {
    const { embedImage } = await importEmbeddings();
    const image = document.createElement("img");
    image.src = "data:image/jpeg;base64,AA==";

    await embedImage(image);

    expect(mocks.extractor).toHaveBeenCalledWith(
      "data:image/jpeg;base64,AA==",
    );
  });

  it.each([
    ["empty URL", ""],
    ["empty blob", new Blob([], { type: "image/jpeg" })],
    ["non-image blob", new Blob(["text"], { type: "text/plain" })],
  ])("rejects an invalid %s", async (_label, input) => {
    const { embedImage } = await importEmbeddings();

    await expect(embedImage(input)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong dimension", { data: new Float32Array(511).fill(1) }],
    ["non-finite value", { data: new Float32Array(512).fill(Number.NaN) }],
    ["zero magnitude", { data: new Float32Array(512) }],
  ])("rejects a model output with %s", async (_label, output) => {
    mocks.extractor.mockResolvedValue(output);
    const { embedImage } = await importEmbeddings();

    await expect(embedImage("data:image/jpeg;base64,AA==")).rejects.toMatchObject(
      { code: "INVALID_OUTPUT" },
    );
  });

  it("wraps model inference failures with a typed error", async () => {
    mocks.extractor.mockRejectedValue(new Error("decode failed"));
    const { embedImage } = await importEmbeddings();

    await expect(embedImage("data:image/jpeg;base64,AA==")).rejects.toMatchObject(
      { code: "INFERENCE_FAILED" },
    );
  });
});

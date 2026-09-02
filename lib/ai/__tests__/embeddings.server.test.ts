// @vitest-environment node

import { expect, it, vi } from "vitest";

const pipeline = vi.fn();

vi.mock("@huggingface/transformers", () => ({
  env: { allowLocalModels: true },
  pipeline,
}));

it("fails before loading the model outside a browser", async () => {
  const { warmEmbeddingModel } = await import("@/lib/ai/embeddings");

  await expect(warmEmbeddingModel()).rejects.toMatchObject({
    code: "BROWSER_ONLY",
  });
  expect(pipeline).not.toHaveBeenCalled();
});

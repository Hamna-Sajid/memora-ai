import "client-only";

import type {
  EmbeddingErrorCode,
  EmbeddingImageInput,
} from "@/lib/ai/types";
import { EMBEDDING_SIZE } from "@/lib/ai/types";

export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
export { EMBEDDING_SIZE } from "@/lib/ai/types";

type PipelineImageInput = Blob | string;

type EmbeddingTensor = {
  data: ArrayLike<number>;
};

type ImageFeatureExtractor = {
  (image: PipelineImageInput): Promise<EmbeddingTensor>;
};

let extractorPromise: Promise<ImageFeatureExtractor> | null = null;

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;

  constructor(code: EmbeddingErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "EmbeddingError";
    this.code = code;
  }
}

function assertBrowserEnvironment() {
  if (typeof window === "undefined") {
    throw new EmbeddingError(
      "BROWSER_ONLY",
      "Image embeddings can only be generated in a browser.",
    );
  }
}

function toPipelineInput(image: EmbeddingImageInput): PipelineImageInput {
  if (typeof image === "string") {
    const source = image.trim();
    if (!source) {
      throw new EmbeddingError(
        "INVALID_INPUT",
        "The image URL or data URL cannot be empty.",
      );
    }
    return source;
  }

  if (
    typeof HTMLImageElement !== "undefined" &&
    image instanceof HTMLImageElement
  ) {
    const source = image.currentSrc || image.src;
    if (!source) {
      throw new EmbeddingError(
        "INVALID_INPUT",
        "The image element does not have a source.",
      );
    }
    return source;
  }

  if (image instanceof Blob) {
    if (image.size === 0) {
      throw new EmbeddingError(
        "INVALID_INPUT",
        "The image file cannot be empty.",
      );
    }
    if (image.type && !image.type.startsWith("image/")) {
      throw new EmbeddingError(
        "INVALID_INPUT",
        `Expected an image file but received ${image.type}.`,
      );
    }
    return image;
  }

  throw new EmbeddingError("INVALID_INPUT", "Unsupported image input.");
}

function normalizeEmbedding(data: ArrayLike<number>): number[] {
  const vector = Array.from(data, Number);

  if (vector.length !== EMBEDDING_SIZE) {
    throw new EmbeddingError(
      "INVALID_OUTPUT",
      `The model returned ${vector.length} values; expected ${EMBEDDING_SIZE}.`,
    );
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new EmbeddingError(
      "INVALID_OUTPUT",
      "The model returned a non-finite embedding value.",
    );
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new EmbeddingError(
      "INVALID_OUTPUT",
      "The model returned an embedding with an invalid magnitude.",
    );
  }

  return vector.map((value) => value / magnitude);
}

async function createExtractor(): Promise<ImageFeatureExtractor> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = "/models/";
  env.useBrowserCache = false;
  env.useWasmCache = false;

  const extractor = await pipeline(
    "image-feature-extraction",
    CLIP_MODEL_ID,
    { device: "wasm", dtype: "q8" },
  );

  return extractor as unknown as ImageFeatureExtractor;
}

function getExtractor(): Promise<ImageFeatureExtractor> {
  assertBrowserEnvironment();

  if (!extractorPromise) {
    extractorPromise = createExtractor().catch((cause) => {
      extractorPromise = null;
      throw new EmbeddingError(
        "MODEL_LOAD_FAILED",
        "The recognition model could not be loaded.",
        cause,
      );
    });
  }

  return extractorPromise;
}

export async function warmEmbeddingModel(): Promise<void> {
  await getExtractor();
}

export async function embedImage(
  image: EmbeddingImageInput,
): Promise<number[]> {
  const pipelineInput = toPipelineInput(image);
  const extractor = await getExtractor();

  let output: EmbeddingTensor;
  try {
    output = await extractor(pipelineInput);
  } catch (cause) {
    throw new EmbeddingError(
      "INFERENCE_FAILED",
      "The image could not be processed by the recognition model.",
      cause,
    );
  }

  return normalizeEmbedding(output.data);
}

// Turns a photo into 512 numbers using CLIP, running in the browser (free, no tokens).

let extractorPromise: Promise<any> | null = null;

// Loads the CLIP model once. Call this early (e.g. on page load) to "warm" it.
export function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then(({ pipeline, env }) => {
      env.allowLocalModels = false; // always fetch the model from the web
      return pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32");
    });
  }
  return extractorPromise;
}

// Give it a photo Blob, get back 512 numbers.
export async function embedImage(blob: Blob): Promise<number[]> {
  const extractor = await getExtractor();
  const url = URL.createObjectURL(blob);
  try {
    const out = await extractor(url, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  } finally {
    URL.revokeObjectURL(url);
  }
}
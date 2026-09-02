import { access } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { env, pipeline, RawImage } from "@huggingface/transformers";

const DEFAULT_MODEL = "Xenova/clip-vit-base-patch32";
const EMBEDDING_SIZE = 512;

function printUsage() {
  console.log(`
Usage:
  node scripts/recognition-spike.mjs \\
    --enroll <image> <image> [image...] \\
    --positive <image> \\
    --unknown <image> [image...]

Options:
  --model <model-id>  Override the CLIP model.
  --help              Show this message.
`);
}

function parseArgs(argv) {
  const options = {
    enroll: [],
    positive: null,
    unknown: [],
    model: DEFAULT_MODEL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help") {
      printUsage();
      process.exit(0);
    }

    if (argument === "--model") {
      options.model = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--positive") {
      options.positive = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--enroll" || argument === "--unknown") {
      const key = argument.slice(2);
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        options[key].push(argv[index + 1]);
        index += 1;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.enroll.length < 3) {
    throw new Error("Provide at least three enrollment images with --enroll.");
  }
  if (!options.positive) {
    throw new Error("Provide exactly one held-out positive image with --positive.");
  }
  if (options.unknown.length < 1) {
    throw new Error("Provide at least one unknown image with --unknown.");
  }
  if (!options.model) {
    throw new Error("--model requires a model ID.");
  }

  return options;
}

async function resolveImage(input) {
  const absolutePath = path.resolve(input);
  await access(absolutePath);
  return absolutePath;
}

function normalize(vector) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Model returned an embedding with an invalid magnitude.");
  }

  return vector.map((value) => value / magnitude);
}

function validateEmbedding(vector, filename) {
  if (vector.length !== EMBEDDING_SIZE) {
    throw new Error(
      `${filename} produced ${vector.length} values; expected ${EMBEDDING_SIZE}.`,
    );
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`${filename} produced a non-finite embedding value.`);
  }
}

function cosineSimilarity(left, right) {
  if (left.length !== right.length) {
    throw new Error("Cannot compare embeddings with different dimensions.");
  }

  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function bestMatch(enrollment, query) {
  return enrollment
    .map(({ name, vector }) => ({
      enrollmentImage: name,
      score: cosineSimilarity(vector, query),
    }))
    .sort((left, right) => right.score - left.score)[0];
}

function formatMilliseconds(value) {
  return `${Math.round(value)} ms`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const enrollmentPaths = await Promise.all(options.enroll.map(resolveImage));
  const positivePath = await resolveImage(options.positive);
  const unknownPaths = await Promise.all(options.unknown.map(resolveImage));

  env.allowLocalModels = false;

  console.log(`Model: ${options.model}`);
  console.log(`Embedding size contract: ${EMBEDDING_SIZE}`);
  console.log("Loading model (the first run downloads and caches its files)...");

  const modelLoadStartedAt = performance.now();
  const extractor = await pipeline("image-feature-extraction", options.model);
  const modelLoadMilliseconds = performance.now() - modelLoadStartedAt;
  console.log(`Model ready in ${formatMilliseconds(modelLoadMilliseconds)}.`);

  async function embed(imagePath) {
    const startedAt = performance.now();
    const image = await RawImage.read(imagePath);
    const output = await extractor(image);
    const rawVector = Array.from(output.data, Number);
    validateEmbedding(rawVector, path.basename(imagePath));
    const vector = normalize(rawVector);

    return {
      name: path.basename(imagePath),
      vector,
      milliseconds: performance.now() - startedAt,
    };
  }

  const enrollment = [];
  for (const imagePath of enrollmentPaths) {
    enrollment.push(await embed(imagePath));
  }

  const positive = await embed(positivePath);
  const unknowns = [];
  for (const imagePath of unknownPaths) {
    unknowns.push(await embed(imagePath));
  }

  const positiveScores = enrollment.map(({ name, vector }) => ({
    query: positive.name,
    enrollmentImage: name,
    score: cosineSimilarity(vector, positive.vector),
  }));
  const unknownScores = unknowns.flatMap((unknown) =>
    enrollment.map(({ name, vector }) => ({
      query: unknown.name,
      enrollmentImage: name,
      score: cosineSimilarity(vector, unknown.vector),
    })),
  );

  console.log("\nPer-image cosine similarities:");
  console.table(
    [...positiveScores, ...unknownScores].map((result) => ({
      query: result.query,
      enrollment: result.enrollmentImage,
      score: result.score.toFixed(4),
    })),
  );

  const bestPositive = bestMatch(enrollment, positive.vector);
  const bestUnknowns = unknowns.map((unknown) => ({
    query: unknown.name,
    ...bestMatch(enrollment, unknown.vector),
  }));
  const strongestUnknown = bestUnknowns.sort(
    (left, right) => right.score - left.score,
  )[0];
  const separation = bestPositive.score - strongestUnknown.score;

  console.log("\nSummary:");
  console.table([
    {
      kind: "same object",
      query: positive.name,
      nearestEnrollment: bestPositive.enrollmentImage,
      score: bestPositive.score.toFixed(4),
    },
    ...bestUnknowns.map((result) => ({
      kind: "unknown object",
      query: result.query,
      nearestEnrollment: result.enrollmentImage,
      score: result.score.toFixed(4),
    })),
  ]);

  console.log(`Separation (positive - strongest unknown): ${separation.toFixed(4)}`);
  console.log(
    separation > 0
      ? "SPIKE RESULT: PASS - the held-out same object scored above the unknown object."
      : "SPIKE RESULT: FAIL - the unknown object scored at least as high as the held-out same object.",
  );

  console.log("\nTiming:");
  console.table([
    { operation: "model load", duration: formatMilliseconds(modelLoadMilliseconds) },
    ...enrollment.map((result) => ({
      operation: `embed ${result.name}`,
      duration: formatMilliseconds(result.milliseconds),
    })),
    {
      operation: `embed ${positive.name}`,
      duration: formatMilliseconds(positive.milliseconds),
    },
    ...unknowns.map((result) => ({
      operation: `embed ${result.name}`,
      duration: formatMilliseconds(result.milliseconds),
    })),
  ]);

  await extractor.dispose();
  process.exitCode = separation > 0 ? 0 : 2;
}

main().catch((error) => {
  console.error(`Recognition spike failed: ${error.message}`);
  process.exitCode = 1;
});

import "client-only";

import { EMBEDDING_SIZE, embedImage } from "@/lib/ai/embeddings";
import type {
  EmbeddingImageInput,
  MatchItem,
  MatchResult,
  RecallItem,
  RecallResult,
} from "@/lib/ai/types";
import {
  confidenceThresholdForType,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from "@/lib/ai/thresholds";

// Working cutoff from the first exact-search calibration batch. Keep provisional
// until several enrolled objects and visually similar unknowns are measured.
export const PROVISIONAL_CONFIDENCE_THRESHOLD = DEFAULT_CONFIDENCE_THRESHOLD;

type EmbedImage = (image: EmbeddingImageInput) => Promise<number[]>;

export type RecallOptions = {
  threshold?: number;
  embed?: EmbedImage;
};

function validateThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError("Recall threshold must be a finite number from 0 to 1.");
  }
}

function isValidEmbedding(embedding: readonly number[]) {
  return (
    embedding.length === EMBEDDING_SIZE &&
    embedding.every((value) => Number.isFinite(value))
  );
}

function isRecallItem(value: unknown): value is RecallItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<RecallItem>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.label === "string" &&
    item.label.length > 0 &&
    (item.type === "object" || item.type === "face" || item.type === "med") &&
    typeof item.noteText === "string" &&
    typeof item.audioUrl === "string" &&
    (item.language === "en" || item.language === "ur")
  );
}

function isValidMatch(match: MatchResult) {
  return (
    isRecallItem(match.item) &&
    Number.isFinite(match.score) &&
    match.score >= 0 &&
    match.score <= 1
  );
}

export async function recall(
  photo: EmbeddingImageInput,
  matchItem: MatchItem,
  options: RecallOptions = {},
): Promise<RecallResult> {
  const embed = options.embed ?? embedImage;
  if (options.threshold !== undefined) {
    validateThreshold(options.threshold);
  }

  let embedding: number[];
  try {
    embedding = await embed(photo);
  } catch {
    return {
      notSure: true,
      score: 0,
      reason: "embedding-error",
    };
  }

  if (!isValidEmbedding(embedding)) {
    return {
      notSure: true,
      score: 0,
      reason: "embedding-error",
    };
  }

  let match: MatchResult | null;
  try {
    match = await matchItem(embedding);
  } catch {
    return {
      notSure: true,
      score: 0,
      reason: "matcher-error",
    };
  }

  if (!match) {
    return {
      notSure: true,
      score: 0,
      reason: "no-match",
    };
  }

  if (!isValidMatch(match)) {
    return {
      notSure: true,
      score: 0,
      reason: "invalid-match",
    };
  }

  const threshold =
    options.threshold ?? confidenceThresholdForType(match.item.type);

  if (match.score < threshold) {
    return {
      notSure: true,
      score: match.score,
      reason: "below-threshold",
    };
  }

  return {
    notSure: false,
    item: match.item,
    score: match.score,
  };
}

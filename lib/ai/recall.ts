import "client-only";

import { EMBEDDING_SIZE, embedImage } from "@/lib/ai/embeddings";
import type {
  EmbeddingImageInput,
  MatchItem,
  MatchResult,
  RecallItem,
  RecallResult,
} from "@/lib/ai/types";

// Working cutoff from the first exact-search calibration batch. Keep provisional
// until several enrolled objects and visually similar unknowns are measured.
export const PROVISIONAL_CONFIDENCE_THRESHOLD = 0.7;

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
  const threshold = options.threshold ?? PROVISIONAL_CONFIDENCE_THRESHOLD;
  const embed = options.embed ?? embedImage;
  validateThreshold(threshold);

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

export type EmbeddingImageInput = Blob | string | HTMLImageElement;

export type EmbeddingErrorCode =
  | "BROWSER_ONLY"
  | "INVALID_INPUT"
  | "MODEL_LOAD_FAILED"
  | "INFERENCE_FAILED"
  | "INVALID_OUTPUT";

export type ItemType = "object" | "face" | "med";
export type ItemLanguage = "en" | "ur";

export type RecallItem = {
  id: string;
  label: string;
  type: ItemType;
  noteText: string;
  audioUrl: string;
  language: ItemLanguage;
};

export type MatchResult = {
  item: RecallItem;
  score: number;
};

export type MatchItem = (
  embedding: readonly number[],
) => Promise<MatchResult | null>;

export type NotSureReason =
  | "embedding-error"
  | "matcher-error"
  | "no-match"
  | "invalid-match"
  | "below-threshold";

export type RecallResult =
  | {
      notSure: false;
      item: RecallItem;
      score: number;
    }
  | {
      notSure: true;
      score: number;
      reason: NotSureReason;
    };

import type { ItemType } from "@/lib/ai/types";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

type RecognitionPolicy = {
  confidenceThreshold: number;
  confirmationCeiling?: number;
};

// Provisional type-level policies measured with held-out photos. Keep them
// isolated here until exceptional values need to be stored per database item.
const CALIBRATED_POLICIES: Partial<Record<ItemType, RecognitionPolicy>> = {
  object: { confidenceThreshold: 0.77, confirmationCeiling: 0.8 },
};

export function confidenceThresholdForType(type: ItemType): number {
  return (
    CALIBRATED_POLICIES[type]?.confidenceThreshold ??
    DEFAULT_CONFIDENCE_THRESHOLD
  );
}

export function confirmationCeilingForType(type: ItemType): number | null {
  return CALIBRATED_POLICIES[type]?.confirmationCeiling ?? null;
}

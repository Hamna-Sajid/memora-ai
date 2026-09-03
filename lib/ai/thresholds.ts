export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

// Provisional cutoffs measured with held-out photos. These overrides are
// intentionally isolated here until calibration values are stored per item.
const CALIBRATED_POLICIES = new Map<
  string,
  { confidenceThreshold: number; confirmationCeiling?: number }
>([
  ["snakers", { confidenceThreshold: 0.77, confirmationCeiling: 0.8 }],
]);

export function confidenceThresholdForLabel(label: string): number {
  return (
    CALIBRATED_POLICIES.get(label.trim().toLowerCase())
      ?.confidenceThreshold ??
    DEFAULT_CONFIDENCE_THRESHOLD
  );
}

export function confirmationCeilingForLabel(label: string): number | null {
  return (
    CALIBRATED_POLICIES.get(label.trim().toLowerCase())
      ?.confirmationCeiling ?? null
  );
}

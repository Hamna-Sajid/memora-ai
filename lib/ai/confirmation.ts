import { confirmationCeilingForLabel } from "@/lib/ai/thresholds";
import type { RecallResult } from "@/lib/ai/types";

export function requiresConfirmation(result: RecallResult): boolean {
  if (result.notSure) return false;

  const ceiling = confirmationCeilingForLabel(result.item.label);
  return ceiling !== null && result.score < ceiling;
}

export function isConfirmedBy(
  first: RecallResult,
  second: RecallResult,
): boolean {
  return (
    !first.notSure &&
    !second.notSure &&
    first.item.id === second.item.id
  );
}

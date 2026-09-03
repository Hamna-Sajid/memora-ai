import "client-only";

import { recall } from "@/lib/ai/recall";
import type {
  EmbeddingImageInput,
  RecallResult,
} from "@/lib/ai/types";
import type { RecallOptions } from "@/lib/ai/recall";
import { matchItem } from "@/lib/supabase/queries";

export function recallFromDatabase(
  photo: EmbeddingImageInput,
  options?: RecallOptions,
): Promise<RecallResult> {
  return recall(photo, matchItem, options);
}

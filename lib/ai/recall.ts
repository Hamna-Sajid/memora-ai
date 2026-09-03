// PLACE AT: lib/ai/recall.ts
// Takes one photo, finds the nearest saved item, decides confident vs "not sure".

import { embedImage } from "./embeddings";
import { matchItem } from "@/lib/supabase/queries";

// Member A tunes this number on Day 2 with real seed items. 0.80 is a safe start.
export const CONFIDENCE_THRESHOLD = 0.8;

export async function recall(blob: Blob) {
  const vector = await embedImage(blob); // 512 numbers
  const best = await matchItem(vector); // { item, score } or null
  if (!best || best.score < CONFIDENCE_THRESHOLD) {
    return { notSure: true, score: best?.score ?? 0 } as const;
  }
  return { notSure: false, item: best.item, score: best.score } as const;
}
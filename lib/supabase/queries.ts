import { EMBEDDING_SIZE } from "@/lib/ai/types";
import type {
  ItemLanguage,
  ItemType,
  MatchItem,
  MatchResult,
  RecallItem,
} from "@/lib/ai/types";
import { supabase } from "@/lib/supabase/client";

type StorageBucket = "photos" | "audio";

type SaveItemInput = {
  label: string;
  type: ItemType;
  note_raw: string;
  note_text: string;
  audio_url: string;
  language: ItemLanguage;
  vectors: readonly (readonly number[])[];
  photo_urls: readonly string[];
};

type DatabaseMatchRow = {
  id?: unknown;
  label?: unknown;
  note_text?: unknown;
  audio_url?: unknown;
  type?: unknown;
  language?: unknown;
  score?: unknown;
};

function isEmbedding(vector: readonly number[]) {
  return (
    vector.length === EMBEDDING_SIZE &&
    vector.every((value) => Number.isFinite(value))
  );
}

function requireEmbedding(vector: readonly number[]) {
  if (!isEmbedding(vector)) {
    throw new TypeError(
      `Expected ${EMBEDDING_SIZE} finite embedding values.`,
    );
  }
}

function requireNonEmptyText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Database match has an invalid ${field}.`);
  }
  return value;
}

function mapMatchRow(row: DatabaseMatchRow): MatchResult {
  const type = row.type;
  if (type !== "object" && type !== "face" && type !== "med") {
    throw new TypeError("Database match has an invalid type.");
  }

  const language = row.language;
  if (language !== "en" && language !== "ur") {
    throw new TypeError("Database match has an invalid language.");
  }

  const score = row.score;
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 1
  ) {
    throw new TypeError("Database match has an invalid similarity score.");
  }

  const item: RecallItem = {
    id: requireNonEmptyText(row.id, "id"),
    label: requireNonEmptyText(row.label, "label"),
    noteText: requireNonEmptyText(row.note_text, "note_text"),
    audioUrl: requireNonEmptyText(row.audio_url, "audio_url"),
    type,
    language,
  };

  return { item, score };
}

export async function uploadFile(
  bucket: StorageBucket,
  file: Blob,
  name: string,
) {
  if (file.size === 0) {
    throw new TypeError("Cannot upload an empty file.");
  }
  if (!name.trim()) {
    throw new TypeError("Upload name cannot be empty.");
  }

  const storage = supabase.storage.from(bucket);
  const { error } = await storage.upload(name, file, { upsert: false });
  if (error) throw error;
  return storage.getPublicUrl(name).data.publicUrl;
}

export async function saveItem(input: SaveItemInput) {
  if (input.vectors.length === 0) {
    throw new TypeError("At least one enrollment embedding is required.");
  }
  if (input.vectors.length !== input.photo_urls.length) {
    throw new TypeError("Every enrollment embedding requires one photo URL.");
  }
  input.vectors.forEach(requireEmbedding);

  const { data: item, error } = await supabase
    .from("items")
    .insert({
      label: input.label,
      type: input.type,
      note_raw: input.note_raw,
      note_text: input.note_text,
      audio_url: input.audio_url,
      language: input.language,
    })
    .select()
    .single();
  if (error) throw error;

  const rows = input.vectors.map((embedding, index) => ({
    item_id: item.id,
    embedding: Array.from(embedding),
    photo_url: input.photo_urls[index],
  }));
  const { error: embeddingsError } = await supabase
    .from("embeddings")
    .insert(rows);
  if (embeddingsError) throw embeddingsError;

  return item.id as string;
}

export const matchItem: MatchItem = async (embedding) => {
  requireEmbedding(embedding);

  const { data, error } = await supabase.rpc("match_item", {
    query_embedding: Array.from(embedding),
  });
  if (error) throw error;

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return mapMatchRow(data[0] as DatabaseMatchRow);
};

export async function saveConsent(caregiverName: string) {
  const { error } = await supabase
    .from("consent")
    .insert({ caregiver_name: caregiverName, voice_consent: true });
  if (error) throw error;
}

import { EMBEDDING_SIZE } from "@/lib/ai/types";
import type {
  ItemLanguage,
  ItemType,
  MatchResult,
  RecallItem,
} from "@/lib/ai/types";
import {
  requireSupabaseConfiguration,
  supabase,
} from "@/lib/supabase/client";

type StorageBucket = "photos" | "audio";

type SaveItemInput = {
  patient_id: string;
  label: string;
  type: ItemType;
  note_raw: string;
  note_text: string;
  audio_url: string;
  language: ItemLanguage;
  vectors: readonly (readonly number[])[];
  photo_urls: readonly string[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function requireUuid(value: string, field: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a valid UUID.`);
  }
}

async function signedMediaUrl(
  bucket: StorageBucket,
  storedValue: string,
): Promise<string> {
  let objectPath = storedValue;
  if (/^https?:\/\//i.test(storedValue)) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = storedValue.indexOf(marker);
    if (markerIndex < 0) return storedValue;
    objectPath = decodeURIComponent(storedValue.slice(markerIndex + marker.length));
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

async function mapMatchRow(row: DatabaseMatchRow): Promise<MatchResult> {
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

  const storedAudio = requireNonEmptyText(row.audio_url, "audio_url");
  const item: RecallItem = {
    id: requireNonEmptyText(row.id, "id"),
    label: requireNonEmptyText(row.label, "label"),
    noteText: requireNonEmptyText(row.note_text, "note_text"),
    audioUrl: await signedMediaUrl("audio", storedAudio),
    type,
    language,
  };

  return { item, score };
}

export async function uploadFile(
  bucket: StorageBucket,
  file: Blob,
  name: string,
  patientId: string,
) {
  if (file.size === 0) {
    throw new TypeError("Cannot upload an empty file.");
  }
  if (!name.trim()) {
    throw new TypeError("Upload name cannot be empty.");
  }
  requireUuid(patientId, "Patient id");
  requireSupabaseConfiguration();

  const storage = supabase.storage.from(bucket);
  const objectPath = `${patientId}/${name}`;
  const { error } = await storage.upload(objectPath, file, { upsert: false });
  if (error) throw error;
  return objectPath;
}

export async function saveItem(input: SaveItemInput) {
  requireUuid(input.patient_id, "Patient id");
  if (input.vectors.length === 0) {
    throw new TypeError("At least one enrollment embedding is required.");
  }
  if (input.vectors.length !== input.photo_urls.length) {
    throw new TypeError("Every enrollment embedding requires one photo URL.");
  }
  input.vectors.forEach(requireEmbedding);
  requireSupabaseConfiguration();

  const { data: item, error } = await supabase
    .from("items")
    .insert({
      patient_id: input.patient_id,
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

export async function matchItem(
  embedding: readonly number[],
  patientId: string,
): Promise<MatchResult | null> {
  requireEmbedding(embedding);
  requireUuid(patientId, "Patient id");
  requireSupabaseConfiguration();

  const { data, error } = await supabase.rpc("match_item", {
    query_embedding: Array.from(embedding),
    target_patient_id: patientId,
  });
  if (error) throw error;

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return mapMatchRow(data[0] as DatabaseMatchRow);
}

export async function saveConsent(
  caregiverName: string,
  patientId: string,
  caregiverId: string,
) {
  requireUuid(patientId, "Patient id");
  requireUuid(caregiverId, "Caregiver id");
  requireSupabaseConfiguration();
  const { error } = await supabase
    .from("consent")
    .insert({
      caregiver_name: caregiverName,
      caregiver_id: caregiverId,
      patient_id: patientId,
      voice_consent: true,
    });
  if (error) throw error;
}

export async function hasVoiceConsent(
  patientId: string,
  caregiverId: string,
) {
  requireUuid(patientId, "Patient id");
  requireUuid(caregiverId, "Caregiver id");
  requireSupabaseConfiguration();
  const { data, error } = await supabase
    .from("consent")
    .select("id")
    .eq("patient_id", patientId)
    .eq("caregiver_id", caregiverId)
    .eq("voice_consent", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

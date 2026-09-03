import { supabase } from './client';

// Upload a photo or audio blob, return its public link.
export async function uploadFile(bucket: 'photos' | 'audio', file: Blob, name: string) {
  const { error } = await supabase.storage.from(bucket).upload(name, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}

// Save one enrolled item + one embeddings row per photo. (Called by caregiver screen.)
export async function saveItem(input: {
  label: string;
  type: string;
  note_raw: string;
  note_text: string;
  audio_url: string;
  language: string;
  vectors: number[][];    // one 512-array per photo
  photo_urls: string[];   // uploaded photo links
}) {
  const { data: item, error } = await supabase
    .from('items')
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

  const rows = input.vectors.map((v, i) => ({
    item_id: item.id,
    embedding: v,
    photo_url: input.photo_urls[i] ?? null,
  }));
  const { error: e2 } = await supabase.from('embeddings').insert(rows);
  if (e2) throw e2;

  return item.id as string;
}

// Find the nearest saved item to a query photo's numbers. (Called by recall logic.)
export async function matchItem(vector: number[]) {
  const { data, error } = await supabase.rpc('match_item', { query_embedding: vector });
  if (error) throw error;
  const best = data?.[0];
  return best ? { item: best, score: best.score as number } : null;
}

export async function saveConsent(caregiverName: string) {
  const { error } = await supabase
    .from('consent')
    .insert({ caregiver_name: caregiverName, voice_consent: true });
  if (error) throw error;
}
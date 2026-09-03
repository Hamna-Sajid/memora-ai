   # Memora Ai
   Branches: main (B merges), feat/ai (A), feat/data (B), feat/ui (C).

   ## Data contract
   - Enroll collects: label, type ("object"|"face"|"med"), note, language ("en"|"ur"), several photos, one audio clip.
   - Flow: each photo -> embedImage() [A] -> 512 numbers; upload photos+audio via uploadFile() [B]; then saveItem() [B].
   - Recall: one photo -> embedImage() [A] -> matchItem() [B] -> if score >= CONFIDENCE_THRESHOLD [A] play audio_url, else "I'm not sure".
   - Embedding size = 512. DB column = vector(512).

   ## Member A recognition API

   `lib/ai/embeddings.ts` is browser-only and exports:

   - `warmEmbeddingModel(): Promise<void>` - call from a Client Component effect when the caregiver or patient screen loads.
   - `embedImage(image): Promise<number[]>` - accepts an image `Blob`, URL/data URL, or `HTMLImageElement` and returns 512 normalized finite numbers.
   - `EmbeddingError` - typed failure with a stable `code` for calm loading/retry UI.

   The model is loaded once per browser session. A failed initial download clears the cached promise so a later warm-up can retry.

   `lib/ai/recall.ts` exports `recall(photo, matchItem, options?)`. Until seed-data calibration is complete it uses a provisional confidence threshold of `0.80`. The matcher is injected, allowing unit tests and current UI work to use a fake implementation before Member B's Supabase query lands.

   A confident result has `{ notSure: false, item, score }`. Every failure or low-confidence path returns `{ notSure: true, score, reason }` and never exposes an item. Member B's adapter must return cosine similarity in the range `0..1`, where higher is better, and map database fields to the camel-case `RecallItem` contract in `lib/ai/types.ts`.

   ## Qwen-VL fallback

   `POST /api/describe` accepts `{ imageBase64 }` for a JPEG, PNG, or WebP data URL up to 1 MB. It calls the configured Qwen provider only after recognition returns `notSure`, and returns either `{ description, source: "qwen" }` or a safe fallback body. Requests are not cached and never expose upstream errors or configuration secrets.

   Required server-only variables are documented in `.env.example`. Local development uses Ollama with `qwen3-vl:2b-instruct` at `127.0.0.1:11434`; the route deliberately rejects non-loopback Ollama URLs. Alibaba remains available by setting `DESCRIPTION_PROVIDER=dashscope`, but the current Singapore workspace requires Qwen-VL model activation.

   ## Browser performance test

   Run `npm run models:prepare` before building, then build and run the app and open `http://localhost:3000/ai-test`. The preparation command copies the cached Q8/WASM CLIP files into ignored same-origin assets, avoiding a runtime dependency on direct Hugging Face access. The internal page measures CLIP model warm-up, first and repeated image embeddings, a lightweight UI-delay signal, vector dimensions, and normalization. On a phone, the file input requests the rear camera when the browser supports `capture="environment"`.

   The desktop baseline, phone procedure, and successful Infinix Hot 30 results are recorded in `docs/browser-performance-test.md`. WP-5 is complete; warm phone inference is about 5.6 seconds and remains responsive, with speed tracked as a WP-8 optimization risk.

   ## Supabase matcher integration

   `lib/supabase/queries.ts` exports a typed `matchItem()` adapter for `recall()`. It validates a 512-value finite embedding, calls Member B's `match_item` RPC, maps snake-case database fields into the `RecallItem` contract, and rejects malformed rows so recall fails closed. Patient UI should call `recallFromDatabase()` from `lib/ai/database-recall.ts`; the lower-level injected `recall()` remains available for isolated tests.

   Live verification requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the applied `supabase/schema.sql`, and existing public `photos` and `audio` buckets. The current schema/storage policies are suitable only for the team demo and require an authentication/RLS review before production use.

   ## Demo screens

   Member C's caregiver and patient screens are integrated at `/caregiver` and `/patient`. Both use the local browser model; the patient screen calls `recallFromDatabase()`, plays caregiver audio only for a confident typed result, and otherwise shows the safe not-sure/caregiver path with an optional `/api/describe` fallback. Missing Supabase settings no longer prevent the site from building or opening, but live enrollment and recognition still require the configuration listed above.

   `/ai-calibrate` is an internal WP-7 tool for processing held-out known or unknown photos and recording the nearest label, raw similarity score, and decision at the provisional threshold. Filenames and results remain in browser memory and are not uploaded or persisted.

   The demo schema deliberately uses exact pgvector search. Do not add the previous 100-list IVFFlat index to the small seed dataset: an approximate index created with too little data can return no candidate. Introduce and tune an approximate index only when the dataset is large enough to justify it.

   # Memora Ai
   Branches: main (B merges), feat/ai (A), feat/data (B), feat/ui (C).

   ## Data contract
   - Enroll collects: label, type ("object"|"face"|"med"), note, language ("en"|"ur"), several photos, one audio clip.
   - Flow: each photo -> embedImage() [A] -> 512 numbers; upload photos+audio via uploadFile() [B]; then saveItem() [B].
   - Recall: one photo -> embedImage() [A] -> matchItem() [B] -> if score >= CONFIDENCE_THRESHOLD [A] play audio_url, else "I'm not sure".
   - Embedding size = 512. DB column = vector(512).
   -- 1. turn on vector matching
   create extension if not exists vector;

   -- 2. one row per real-world thing (object / face / medicine)
   create table items (
     id         uuid primary key default gen_random_uuid(),
     type       text not null,              -- 'object' | 'face' | 'med'
     label      text not null,              -- e.g. "heart medicine"
     note_raw   text,                       -- what the caregiver typed/said
     note_text  text,                       -- the warmed version
     audio_url  text,                       -- link to the recorded voice clip
     language   text default 'en',          -- 'en' | 'ur'
     created_at timestamptz default now()
   );

   -- 3. several photos per item, each stored as 512 numbers
   create table embeddings (
     id        uuid primary key default gen_random_uuid(),
     item_id   uuid references items(id) on delete cascade,
     embedding vector(512) not null,
     photo_url text
   );

   -- 4. speeds up matching
   create index on embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

   -- 5. caregiver consent record
   create table consent (
     id             uuid primary key default gen_random_uuid(),
     caregiver_name text,
     voice_consent  boolean default false,
     signed_at      timestamptz default now()
   );

 -- matching function
 create or replace function match_item(query_embedding vector(512))
returns table (
  id uuid, label text, note_text text, audio_url text,
  type text, language text, score float
)
language sql stable as $$
  select i.id, i.label, i.note_text, i.audio_url, i.type, i.language,
         1 - (e.embedding <=> query_embedding) as score   -- 1 = perfect match
  from embeddings e
  join items i on i.id = e.item_id
  order by e.embedding <=> query_embedding                -- nearest first
  limit 1;
$$;  

   -- let the app read and upload to our two buckets
   create policy "public read photos audio"
     on storage.objects for select
     using ( bucket_id in ('photos','audio') );

   create policy "public upload photos audio"
     on storage.objects for insert
     with check ( bucket_id in ('photos','audio') );
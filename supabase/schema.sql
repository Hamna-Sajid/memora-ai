-- ============================================================================
-- Memora Ai 
-- ============================================================================
-- This file reproduces the FULL current database on a fresh Supabase project.
-- It is the flattened equivalent of the original base tables plus the three
-- migrations in supabase/migrations/ (caregiver_patient_auth, patient_management,
-- fix_pairing_code). Targets Supabase/Postgres: it relies on auth.users,
-- storage.objects/buckets, extensions.digest (pgcrypto) and the vector extension.

-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity & patient tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'ur')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.caregiver_patient_memberships (
  patient_id uuid not null references public.patients(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (patient_id, caregiver_id)
);

create table if not exists public.patient_devices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  label text not null default 'Patient device',
  paired_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.caregiver_invitations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('editor', 'viewer')),
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Core memory tables (patient-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  type       text not null,              -- 'object' | 'face' | 'med'
  label      text not null,
  note_raw   text,                       -- what the caregiver typed/said
  note_text  text,                       -- the warmed version
  audio_url  text,                       -- stored path to the recorded voice clip
  language   text default 'en',          -- 'en' | 'ur'
  created_at timestamptz default now()
);

create table if not exists public.embeddings (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid references public.items(id) on delete cascade,
  embedding vector(512) not null,        -- one photo as 512 numbers (CLIP)
  photo_url text
);

create table if not exists public.consent (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid references public.patients(id) on delete cascade,
  caregiver_id   uuid references auth.users(id),
  caregiver_name text,
  voice_consent  boolean default false,
  signed_at      timestamptz default now()
);

-- Exact pgvector search for the small demo dataset. Do NOT add an IVFFlat index
-- until the table is large enough to tune it against measured recall.
drop index if exists public.embeddings_embedding_idx;

-- ---------------------------------------------------------------------------
-- Storage buckets (private; access is controlled by the policies below)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('audio', 'audio', false)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists items_patient_id_idx
  on public.items(patient_id);
create index if not exists embeddings_item_id_idx
  on public.embeddings(item_id);
create index if not exists memberships_caregiver_id_idx
  on public.caregiver_patient_memberships(caregiver_id);
create index if not exists patient_devices_patient_id_idx
  on public.patient_devices(patient_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- New-caregiver profile trigger + backfill
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'Caregiver'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(email, 'Caregiver'), '@', 1)
  )
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Access-check helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_patient_caregiver(
  target_patient_id uuid,
  allowed_roles text[] default array['owner', 'editor', 'viewer']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.caregiver_patient_memberships membership
    where membership.patient_id = target_patient_id
      and membership.caregiver_id = auth.uid()
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function public.is_active_patient_device(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patient_devices device
    where device.patient_id = target_patient_id
      and device.auth_user_id = auth.uid()
      and device.revoked_at is null
  );
$$;

create or replace function public.has_patient_access(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_patient_caregiver(target_patient_id)
    or public.is_active_patient_device(target_patient_id);
$$;

create or replace function public.storage_patient_id(object_name text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Patient / caregiver / pairing operations (security definer)
-- ---------------------------------------------------------------------------
create or replace function public.create_patient(
  patient_name text,
  patient_language text default 'en'
)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  created_patient public.patients;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'A permanent caregiver account is required';
  end if;
  if nullif(trim(patient_name), '') is null then
    raise exception 'Patient name is required';
  end if;
  if patient_language not in ('en', 'ur') then
    raise exception 'Unsupported patient language';
  end if;

  insert into public.patients (display_name, preferred_language, created_by)
  values (trim(patient_name), patient_language, auth.uid())
  returning * into created_patient;

  insert into public.caregiver_patient_memberships (patient_id, caregiver_id, role)
  values (created_patient.id, auth.uid(), 'owner');

  return created_patient;
end;
$$;

create or replace function public.create_pairing_code(target_patient_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token uuid := gen_random_uuid();
  expiry timestamptz := now() + interval '10 minutes';
begin
  if not public.is_patient_caregiver(
    target_patient_id, array['owner', 'editor']::text[]
  ) then
    raise exception 'Caregiver access required';
  end if;

  delete from public.pairing_codes as pairing_code
  where pairing_code.expires_at < now()
    or pairing_code.claimed_at is not null;

  insert into public.pairing_codes (patient_id, token_hash, created_by, expires_at)
  values (
    target_patient_id,
    extensions.digest(raw_token::text, 'sha256'),
    auth.uid(),
    expiry
  );

  return query select raw_token::text, expiry;
end;
$$;

create or replace function public.claim_patient_device(
  pairing_token text,
  device_label text default 'Patient device'
)
returns table (patient_id uuid, patient_name text, patient_language text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code public.pairing_codes;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Pairing requires an anonymous patient-device session';
  end if;

  select * into code
  from public.pairing_codes
  where token_hash = extensions.digest(pairing_token, 'sha256')
    and claimed_at is null
    and expires_at > now()
  for update;

  if code.id is null then
    raise exception 'Pairing link is invalid or expired';
  end if;

  insert into public.patient_devices (patient_id, auth_user_id, label, revoked_at)
  values (
    code.patient_id,
    auth.uid(),
    coalesce(nullif(trim(device_label), ''), 'Patient device'),
    null
  )
  on conflict (auth_user_id) do update
    set patient_id = excluded.patient_id,
        label = excluded.label,
        paired_at = now(),
        revoked_at = null;

  update public.pairing_codes set claimed_at = now() where id = code.id;

  return query
  select patient.id, patient.display_name, patient.preferred_language
  from public.patients patient
  where patient.id = code.patient_id;
end;
$$;

create or replace function public.create_caregiver_invitation(
  target_patient_id uuid,
  caregiver_email text,
  caregiver_role text default 'editor'
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token uuid := gen_random_uuid();
  expiry timestamptz := now() + interval '24 hours';
  normalized_email text := lower(trim(caregiver_email));
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'A permanent caregiver account is required';
  end if;
  if not public.is_patient_caregiver(target_patient_id, array['owner']::text[]) then
    raise exception 'Only a patient owner can invite caregivers';
  end if;
  if normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid caregiver email';
  end if;
  if caregiver_role not in ('editor', 'viewer') then
    raise exception 'Invitation role must be editor or viewer';
  end if;

  delete from public.caregiver_invitations as invitation
  where invitation.expires_at < now()
    or invitation.accepted_at is not null;

  insert into public.caregiver_invitations (
    patient_id, invited_email, role, token_hash, created_by, expires_at
  ) values (
    target_patient_id,
    normalized_email,
    caregiver_role,
    extensions.digest(raw_token::text, 'sha256'),
    auth.uid(),
    expiry
  );

  return query select raw_token::text, expiry;
end;
$$;

create or replace function public.accept_caregiver_invitation(invitation_token text)
returns public.patients
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.caregiver_invitations;
  accepted_patient public.patients;
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'Sign in with the invited caregiver account';
  end if;

  select * into invitation
  from public.caregiver_invitations as candidate
  where candidate.token_hash = extensions.digest(invitation_token, 'sha256')
    and candidate.accepted_at is null
    and candidate.expires_at > now()
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if caller_email <> invitation.invited_email then
    raise exception 'Sign in using the email address this invitation was created for';
  end if;

  insert into public.caregiver_patient_memberships (patient_id, caregiver_id, role)
  values (invitation.patient_id, auth.uid(), invitation.role)
  on conflict (patient_id, caregiver_id) do nothing;

  update public.caregiver_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;

  select * into accepted_patient from public.patients where id = invitation.patient_id;
  return accepted_patient;
end;
$$;

create or replace function public.list_patient_caregivers(target_patient_id uuid)
returns table (caregiver_id uuid, display_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.caregiver_id, profile.display_name, membership.role
  from public.caregiver_patient_memberships as membership
  join public.profiles as profile on profile.id = membership.caregiver_id
  where membership.patient_id = target_patient_id
    and public.is_patient_caregiver(target_patient_id)
  order by membership.created_at;
$$;

create or replace function public.delete_patient(target_patient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_patient_caregiver(target_patient_id, array['owner']::text[]) then
    raise exception 'Only a patient owner can delete this profile';
  end if;
  delete from public.patients where id = target_patient_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recognition matcher (patient-scoped)
-- ---------------------------------------------------------------------------
drop function if exists public.match_item(vector);
create or replace function public.match_item(
  query_embedding vector(512),
  target_patient_id uuid
)
returns table (
  id uuid, label text, note_text text, audio_url text,
  type text, language text, score float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    item.id, item.label, item.note_text, item.audio_url,
    item.type, item.language,
    1 - (embedding.embedding <=> query_embedding) as score
  from public.embeddings embedding
  join public.items item on item.id = embedding.item_id
  where item.patient_id = target_patient_id
    and public.has_patient_access(target_patient_id)
  order by embedding.embedding <=> query_embedding
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.caregiver_patient_memberships enable row level security;
alter table public.patient_devices enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.caregiver_invitations enable row level security;
alter table public.items enable row level security;
alter table public.embeddings enable row level security;
alter table public.consent enable row level security;

-- caregiver_invitations is reached only through security-definer functions
revoke all on table public.caregiver_invitations from anon, authenticated;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles update own row" on public.profiles;
create policy "profiles update own row"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "patient access" on public.patients;
create policy "patient access"
  on public.patients for select to authenticated
  using (public.has_patient_access(id));

drop policy if exists "caregivers update patient" on public.patients;
create policy "caregivers update patient"
  on public.patients for update to authenticated
  using (public.is_patient_caregiver(id, array['owner', 'editor']::text[]))
  with check (public.is_patient_caregiver(id, array['owner', 'editor']::text[]));

drop policy if exists "membership access" on public.caregiver_patient_memberships;
create policy "membership access"
  on public.caregiver_patient_memberships for select to authenticated
  using (
    caregiver_id = auth.uid()
    or public.is_patient_caregiver(patient_id, array['owner']::text[])
  );

drop policy if exists "device access" on public.patient_devices;
create policy "device access"
  on public.patient_devices for select to authenticated
  using (auth_user_id = auth.uid() or public.is_patient_caregiver(patient_id));

drop policy if exists "caregivers revoke devices" on public.patient_devices;
create policy "caregivers revoke devices"
  on public.patient_devices for update to authenticated
  using (public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[]))
  with check (public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[]));

drop policy if exists "patient item read" on public.items;
create policy "patient item read"
  on public.items for select to authenticated
  using (public.has_patient_access(patient_id));

drop policy if exists "caregiver item insert" on public.items;
create policy "caregiver item insert"
  on public.items for insert to authenticated
  with check (public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[]));

drop policy if exists "caregiver item update" on public.items;
create policy "caregiver item update"
  on public.items for update to authenticated
  using (public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[]))
  with check (public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[]));

drop policy if exists "caregiver item delete" on public.items;
create policy "caregiver item delete"
  on public.items for delete to authenticated
  using (public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[]));

drop policy if exists "patient embedding read" on public.embeddings;
create policy "patient embedding read"
  on public.embeddings for select to authenticated
  using (
    exists (
      select 1 from public.items item
      where item.id = embeddings.item_id
        and public.has_patient_access(item.patient_id)
    )
  );

drop policy if exists "caregiver embedding insert" on public.embeddings;
create policy "caregiver embedding insert"
  on public.embeddings for insert to authenticated
  with check (
    exists (
      select 1 from public.items item
      where item.id = embeddings.item_id
        and public.is_patient_caregiver(item.patient_id, array['owner', 'editor']::text[])
    )
  );

drop policy if exists "caregiver embedding delete" on public.embeddings;
create policy "caregiver embedding delete"
  on public.embeddings for delete to authenticated
  using (
    exists (
      select 1 from public.items item
      where item.id = embeddings.item_id
        and public.is_patient_caregiver(item.patient_id, array['owner', 'editor']::text[])
    )
  );

drop policy if exists "caregiver consent access" on public.consent;
create policy "caregiver consent access"
  on public.consent for select to authenticated
  using (public.is_patient_caregiver(patient_id));

drop policy if exists "caregiver consent insert" on public.consent;
create policy "caregiver consent insert"
  on public.consent for insert to authenticated
  with check (
    caregiver_id = auth.uid()
    and public.is_patient_caregiver(patient_id, array['owner', 'editor']::text[])
  );

-- Storage object policies (files live under "<patient_id>/<filename>")
drop policy if exists "public read photos audio" on storage.objects;
drop policy if exists "public upload photos audio" on storage.objects;

drop policy if exists "authenticated caregiver upload" on storage.objects;
create policy "authenticated caregiver upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('photos', 'audio')
    and public.is_patient_caregiver(
      public.storage_patient_id(name), array['owner', 'editor']::text[]
    )
  );

drop policy if exists "patient media read" on storage.objects;
create policy "patient media read"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('photos', 'audio')
    and public.has_patient_access(public.storage_patient_id(name))
  );

drop policy if exists "caregiver media delete" on storage.objects;
create policy "caregiver media delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('photos', 'audio')
    and public.is_patient_caregiver(
      public.storage_patient_id(name), array['owner', 'editor']::text[]
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, update on public.profiles to authenticated;
grant select, update on public.patients to authenticated;
grant select on public.caregiver_patient_memberships to authenticated;
grant select, update on public.patient_devices to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, delete on public.embeddings to authenticated;
grant select, insert on public.consent to authenticated;

revoke all on function public.storage_patient_id(text) from public, anon;
revoke all on function public.create_patient(text, text) from public, anon;
revoke all on function public.create_pairing_code(uuid) from public, anon;
revoke all on function public.claim_patient_device(text, text) from public, anon;
revoke all on function public.match_item(vector, uuid) from public, anon;
revoke all on function public.is_patient_caregiver(uuid, text[]) from public, anon;
revoke all on function public.is_active_patient_device(uuid) from public, anon;
revoke all on function public.has_patient_access(uuid) from public, anon;
revoke all on function public.create_caregiver_invitation(uuid, text, text) from public, anon;
revoke all on function public.accept_caregiver_invitation(text) from public, anon;
revoke all on function public.list_patient_caregivers(uuid) from public, anon;
revoke all on function public.delete_patient(uuid) from public, anon;

grant execute on function public.storage_patient_id(text) to authenticated;
grant execute on function public.create_patient(text, text) to authenticated;
grant execute on function public.create_pairing_code(uuid) to authenticated;
grant execute on function public.claim_patient_device(text, text) to authenticated;
grant execute on function public.match_item(vector, uuid) to authenticated;
grant execute on function public.is_patient_caregiver(uuid, text[]) to authenticated;
grant execute on function public.is_active_patient_device(uuid) to authenticated;
grant execute on function public.has_patient_access(uuid) to authenticated;
grant execute on function public.create_caregiver_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_caregiver_invitation(text) to authenticated;
grant execute on function public.list_patient_caregivers(uuid) to authenticated;
grant execute on function public.delete_patient(uuid) to authenticated;

commit;

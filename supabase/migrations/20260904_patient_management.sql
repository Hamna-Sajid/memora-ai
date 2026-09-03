begin;

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

alter table public.caregiver_invitations enable row level security;
revoke all on table public.caregiver_invitations from anon, authenticated;

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
  if not public.is_patient_caregiver(
    target_patient_id,
    array['owner']::text[]
  ) then
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
    patient_id,
    invited_email,
    role,
    token_hash,
    created_by,
    expires_at
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

  insert into public.caregiver_patient_memberships (
    patient_id,
    caregiver_id,
    role
  ) values (
    invitation.patient_id,
    auth.uid(),
    invitation.role
  ) on conflict (patient_id, caregiver_id) do nothing;

  update public.caregiver_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;

  select * into accepted_patient
  from public.patients
  where id = invitation.patient_id;
  return accepted_patient;
end;
$$;

create or replace function public.list_patient_caregivers(target_patient_id uuid)
returns table (
  caregiver_id uuid,
  display_name text,
  role text
)
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
  if not public.is_patient_caregiver(
    target_patient_id,
    array['owner']::text[]
  ) then
    raise exception 'Only a patient owner can delete this profile';
  end if;
  delete from public.patients where id = target_patient_id;
  return found;
end;
$$;

update storage.buckets
set public = false
where id in ('photos', 'audio');

drop policy if exists "public read photos audio" on storage.objects;
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
      public.storage_patient_id(name),
      array['owner', 'editor']::text[]
    )
  );

revoke execute on function public.storage_patient_id(text) from public, anon;
revoke execute on function public.create_patient(text, text) from anon;
revoke execute on function public.create_pairing_code(uuid) from anon;
revoke execute on function public.claim_patient_device(text, text) from anon;
revoke execute on function public.match_item(vector, uuid) from anon;
revoke execute on function public.is_patient_caregiver(uuid, text[]) from anon;
revoke execute on function public.is_active_patient_device(uuid) from anon;
revoke execute on function public.has_patient_access(uuid) from anon;
revoke execute on function public.create_caregiver_invitation(uuid, text, text) from public, anon;
revoke execute on function public.accept_caregiver_invitation(text) from public, anon;
revoke execute on function public.list_patient_caregivers(uuid) from public, anon;
revoke execute on function public.delete_patient(uuid) from public, anon;
grant execute on function public.storage_patient_id(text) to authenticated;
grant execute on function public.create_caregiver_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_caregiver_invitation(text) to authenticated;
grant execute on function public.list_patient_caregivers(uuid) to authenticated;
grant execute on function public.delete_patient(uuid) to authenticated;

commit;

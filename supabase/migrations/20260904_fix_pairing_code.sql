begin;

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
    target_patient_id,
    array['owner', 'editor']::text[]
  ) then
    raise exception 'Caregiver access required';
  end if;

  delete from public.pairing_codes as pairing_code
  where pairing_code.expires_at < now()
    or pairing_code.claimed_at is not null;

  insert into public.pairing_codes (
    patient_id,
    token_hash,
    created_by,
    expires_at
  )
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
returns table (
  patient_id uuid,
  patient_name text,
  patient_language text
)
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

  insert into public.patient_devices (
    patient_id,
    auth_user_id,
    label,
    revoked_at
  )
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

  update public.pairing_codes
  set claimed_at = now()
  where id = code.id;

  return query
  select patient.id, patient.display_name, patient.preferred_language
  from public.patients patient
  where patient.id = code.patient_id;
end;
$$;

revoke all on function public.create_pairing_code(uuid) from public;
revoke all on function public.claim_patient_device(text, text) from public;
grant execute on function public.create_pairing_code(uuid) to authenticated;
grant execute on function public.claim_patient_device(text, text) to authenticated;

commit;

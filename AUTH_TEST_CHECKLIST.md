# Authentication and patient-isolation test checklist

## Automatically verified

- Caregiver pages require a permanent authenticated user.
- Patient pairing creates/reuses one anonymous restricted device session.
- React Strict Mode cannot start two pairing claims or leave pairing stuck.
- Every enrollment item is saved with an explicit patient UUID.
- Photo and audio object paths begin with the patient UUID.
- Recognition and calibration always call `match_item` with the active patient UUID.
- Identical recognition inputs for two patients remain separate requests.
- Database matching filters by `items.patient_id` and checks patient access.
- Patient, item, embedding, consent, membership, and device tables have RLS enabled.
- Anonymous unauthenticated table reads return no rows.
- Existing voice consent is restored when a caregiver reloads or changes patients.
- Draft photos, audio, label, note, type, and language are reset when changing patients.

## Manual two-device isolation test

1. Sign in as one caregiver and create Patient A and Patient B.
2. For Patient A, enroll one distinctive object or medicine with an A-specific note.
3. Change to Patient B and enroll a different object or medicine with a B-specific note.
4. Pair Patient A to Device/Browser A.
5. Pair Patient B to Device/Browser B.
6. On Device A, show both objects. Only Patient A's item may be recognized; Patient B's item must produce the not-sure response.
7. On Device B, show both objects. Only Patient B's item may be recognized; Patient A's item must produce the not-sure response.
8. Reload both devices. Each must remain paired to its original patient.
9. Generate a pairing link and try opening it in the signed-in caregiver browser. It must refuse caregiver-to-patient conversion.
10. Reopen an already claimed pairing link. It must report that the link is invalid or expired.

## Added in the management hardening pass

- Private `photos` and `audio` buckets with one-hour signed audio URLs.
- Caregiver controls to list and revoke paired patient devices.
- Patient-profile deletion with explicit confirmation and storage cleanup.
- Email-bound, single-use caregiver invitation links that expire after 24 hours.

## Required before production deployment

- Run the manual isolation test against the deployed origin and production RLS configuration.
- Configure the production Auth site URL and allowed redirect URLs.
- Add abuse protection/CAPTCHA for anonymous sign-ins if the public app is exposed directly.

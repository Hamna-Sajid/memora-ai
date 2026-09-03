# Authentication and patient ownership implementation

This work remains local until the complete caregiver-to-patient flow passes.

## Target flow

1. A caregiver signs up or signs in through Supabase Auth.
2. The caregiver creates one or more patient profiles.
3. Items, embeddings, consent, audio, and photos are scoped to a patient.
4. The caregiver generates a ten-minute pairing link.
5. A patient device opens the link, creates an anonymous device session, and claims access to exactly one patient.
6. Patient mode uses that restricted session and never receives caregiver edit permissions.

Custom face recognition is not an authentication factor. A personal patient device stays paired; any future biometric unlock should use the device authenticator through WebAuthn/passkeys.

## Local verification gates

- [ ] Apply `supabase/migrations/20260904_caregiver_patient_auth.sql` to the test project.
- [ ] Enable anonymous sign-ins in Supabase Auth for patient-device pairing.
- [ ] Create and verify a caregiver account.
- [ ] Create two patient profiles and confirm isolation in both directions.
- [ ] Attach or re-enroll the legacy demo items under one patient.
- [ ] Generate a pairing link and claim it from a separate browser profile/device.
- [ ] Confirm the patient device can recall its own items but cannot read or change another patient's data.
- [ ] Confirm an unauthenticated browser cannot read, upload, enroll, or call the matcher.
- [ ] Move storage to private buckets and verify signed audio/photo access before deployment.
- [ ] Run unit tests, lint, production build, and the complete local browser flow.
- [ ] Push only after all applicable gates pass.

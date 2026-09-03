# Mobile HTTPS test

The patient and caregiver live-camera flows use `getUserMedia()`, which requires a secure browser context. Plain LAN HTTP is sufficient for file-input testing but not the final mobile camera/microphone rehearsal.

## Start the LAN HTTPS server

1. Put the phone and development PC on the same trusted private Wi-Fi network.
2. Stop any existing server on port 3000.
3. Run `npm run dev:https` from the repository root.
4. The command detects the preferred private LAN IPv4 address and generates a development certificate for it using Next.js/mkcert.
5. Do not commit or share anything under `certificates/`; it is ignored by Git.

To override address detection, set the process-only `MEMORA_HTTPS_HOST` environment variable to the PC's LAN IPv4 address before starting the command.

## Trust the development CA on the test phone

Next.js trusts the generated CA on the development PC, but the phone is a separate device. Transfer only mkcert's public `rootCA.pem` certificate to the phone; never transfer `rootCA-key.pem` or `localhost-key.pem`.

On Android, install it as a CA certificate from the device's security/encryption-and-credentials settings. Exact menu wording varies by manufacturer. Remove the development CA from the phone after demo testing is complete.

Then open the HTTPS LAN URL printed by `npm run dev:https`, allow camera/microphone access, and complete the rehearsal. A certificate warning means the CA is not installed or the URL address does not match the certificate.

## Rehearsal gate

Run three complete caregiver-to-patient rehearsals on the intended phone:

1. Enroll an item with 3–5 camera photos and a short voice note.
2. Recall it from a held-out camera angle and confirm the correct audio plays.
3. Show an unknown/lookalike item and confirm the safe not-sure path.
4. Record model warm-up, recall time, and any camera/audio failure.

After one clean rehearsal, record a backup demo video. Remove the development CA and any test-only sensitive data when testing is finished.

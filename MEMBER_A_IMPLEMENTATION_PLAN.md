# Member A - Recognition and AI Implementation Plan

## 1. Objective

Deliver the recognition portion of the Memora MVP on `feat/ai`:

- Convert a photo into a normalized 512-number CLIP embedding in the browser.
- Find the closest enrolled item through Member B's matching contract.
- Return a confident match or a calm `notSure` result without guessing.
- Optionally describe unknown objects through a server-side Qwen-VL route.
- Leave face recognition as a bonus until object recall is reliable.

The implementation must support the PRD's primary demo path: enroll an object with 3-5 photos, point the patient camera at it, tap once, and play the caregiver's recorded message.

## 2. Current Readiness

### Available

- `feat/ai` exists and is checked out.
- Next.js 16.3.4, React 19, TypeScript, Tailwind, and Supabase are scaffolded.
- The repository builds and lints successfully.
- The shared README fixes the embedding dimension at `vector(512)`.
- Node.js, npm, and Git are available locally.
- Alibaba Model Studio will use the Singapore region, and the workspace ID is known.
- WP-1 passed on 2 September 2026 with two held-out splits; results are recorded in `docs/recognition-spike-results.md`.
- WP-2 passed on 2 September 2026 with a browser-only singleton loader, typed validation, and automated coverage.
- WP-3 passed on 2 September 2026 with an injected matcher, provisional threshold, fail-closed results, and boundary/error coverage.
- WP-4 completed on 2 September 2026. The safe route passes automated coverage and the local Ollama adapter described all six supplied images through `qwen3-vl:2b-instruct` on the RX 580. Alibaba remains an optional deployment provider and currently lacks Singapore Qwen-VL entitlement.
- WP-5 passed on 3 September 2026 using the internal `/ai-test` surface and an Infinix Hot 30 running Chrome. Warm phone inference is approximately 5.6 seconds; the page remained responsive and samples stayed at 17 ms or lower, so no Web Worker is currently justified. The speed remains a WP-8 optimization risk against the preferred 2-3 second target.
- WP-6 code integration completed on 3 September 2026 after Member B's `cb1127d` landed on `main`. The production adapter maps and validates the RPC result and is connected through `recallFromDatabase()` with mocked contract coverage. Live verification remains gated by Supabase credentials, deployed schema, and storage buckets.
- WP-8 code integration completed on 3 September 2026 from Member C's `fd12e68`. The caregiver and patient screens retain the tested local embedding/recall implementations, pre-warm the model, prevent repeated recall taps, play audio only for confident results, and fail safely to the caregiver/Qwen path. Its real-device exit gate remains blocked by WP-7 calibration and live Supabase configuration.
- The first live end-to-end rehearsal passed on 3 September 2026: `Suduri` was enrolled with five photos and public caregiver audio, a held-out view recalled it successfully, and one unrelated photo produced the safe not-sure response. This is integration evidence only, not enough data to finalize the WP-7 threshold.
- Initial WP-7 batch exposed a 100-list IVFFlat index built with only five vectors, causing intermittent empty matches. After removing that index, all eight queries returned a nearest row: known scores were 0.7450–0.7809 and unknown scores were 0.5635–0.6309. The working threshold is now `0.70`; it accepts all four measured known views and rejects all four measured unknowns, but remains provisional until multiple enrolled objects are tested.
- WP-8 hardening now includes a repeatable LAN HTTPS command and a validated, optional caregiver phone configuration. The remaining WP-8 gate is operational: install the generated development CA on the Infinix Hot 30, run three complete camera/microphone rehearsals, and record the backup demo.
- WP-8 rehearsal 1 of 3 passed on 4 September 2026 using the Infinix Hot 30 over trusted LAN HTTPS. Camera access, held-out Suduri recognition, caregiver audio, unknown-object rejection, and the configured call action all worked. Timing was reported comparable to the prior approximately 5.6-second warm result; two rehearsals and the backup video remain.

### External gates

| Gate | Needed for | Owner / action | Work possible before it arrives |
| --- | --- | --- | --- |
| Rotate the exposed Alibaba key | Any Qwen API verification | Member A: revoke the pasted key and create a fresh key | Build and test all local recognition work |
| Five spike photos | Day-0 recognition proof | Complete: six local photos supplied and exercised | Repeat later with more objects for threshold calibration |
| `matchItem()` and `match_item` | Real database recall | Member B | Use an injected fake matcher and contract tests |
| Enrolled seed dataset | Final confidence threshold | Members B/C | Keep the working `0.70` clearly marked as provisional |
| Caregiver and patient screens | Model pre-warm and end-to-end UI | Member C | Expose stable `warmEmbeddingModel()` and `recall()` APIs |

These gates do not prevent implementation from starting. They prevent final integration, threshold tuning, and the complete Definition of Done.

## 3. Photo Kit for the Recognition Spike

### Minimum Day-0 set: five photos

Use one ordinary, non-reflective object with a stable shape, such as a mug, water bottle, glasses case, TV remote, or medicine box. Avoid faces, private documents, and real patient medication at this stage.

| Filename | Required content | Purpose |
| --- | --- | --- |
| `object_a_enroll_1.jpg` | Same physical object, front or most recognizable view | Enrollment example 1 |
| `object_a_enroll_2.jpg` | Same physical object, roughly 30-60 degrees to one side | Enrollment example 2 |
| `object_a_enroll_3.jpg` | Same physical object, opposite or elevated angle | Enrollment example 3 |
| `object_a_query.jpg` | Same physical object, newly taken and not reused from enrollment | Positive held-out query |
| `unknown_b_query.jpg` | A different physical object photographed in the same setting | Negative query |

Capture rules:

- Use the phone intended for the demo whenever possible.
- Keep the object dominant in the frame without filling every pixel.
- Use the normal room/background expected during the demonstration.
- Do not apply filters, portrait blur, screenshots, or aggressive crops.
- Keep the held-out query genuinely separate; never duplicate an enrollment file.
- Prefer JPEG or PNG with the longest edge at least 512px. The app will test its own downscaling path.

### Recommended second set

After the minimum spike works, add two more physical objects. For each object, capture three enrollment angles and two held-out queries. Include one visually similar unknown, such as:

- Enrolled blue mug versus unknown white mug.
- Enrolled medicine box versus another similarly sized box.
- Enrolled TV remote versus a different remote.

This exposes the main risk: CLIP may recognize an object category while failing to distinguish two individual objects from the same category.

### Can internet photos be used?

Internet photos may be used only for a smoke test that proves model download, decoding, 512-dimensional output, and similarity calculations work. They are weak evidence for product accuracy because they usually differ in camera, background, compression, and may show separate copies of a product rather than the same physical item.

If internet images are used temporarily:

- Use openly licensed images or a public multi-view dataset.
- Download several distinct views of the same object instance, not repeated copies of one image.
- Record the source and license.
- Do not commit images unless redistribution is permitted.
- Replace the results with phone-captured images before accepting Phase 1.

The final threshold must never be calibrated from internet images.

## 4. Technical Decisions

### Transformers.js

- Use the maintained `@huggingface/transformers` package, not the legacy `@xenova/transformers` package.
- Keep the model ID `Xenova/clip-vit-base-patch32` unless the Day-0 spike disproves its suitability.
- Assert at runtime that every embedding contains exactly 512 finite numbers.
- Use normalized output so dot product is cosine similarity.
- Load the model through one cached promise so concurrent calls cannot download it twice.
- Export `warmEmbeddingModel()`; do not expose an internal extractor object to UI code.
- Keep the module client-only and consider moving inference into a Web Worker if real-phone testing shows UI freezing.
- Keep `@huggingface/transformers` out of server routes. Version 4.2.0 currently reports transitive Node-runtime advisories through `onnxruntime-node` and `sharp`, with no upstream fix available; the browser implementation must resolve to `onnxruntime-web`, and the team should re-run `npm audit` when an upstream release lands.

### Matching contract with Member B

Member B's function must accept `number[512]` and return either `null` or:

```ts
type MatchResult = {
  item: {
    id: string;
    label: string;
    type: "object" | "face" | "med";
    noteText: string;
    audioUrl: string;
    language: "en" | "ur";
  };
  score: number;
};
```

Contract rules:

- `score` is cosine similarity, not cosine distance.
- Higher is better.
- If Postgres returns cosine distance, Member B converts it to similarity before returning it.
- Member B returns one best item, even though an item may have 3-5 stored embeddings.
- Missing items and query errors must be distinguishable internally, while the patient-facing result still degrades safely.

### Qwen-VL configuration

The route must read configuration from the server environment:

```text
DASHSCOPE_API_KEY=<fresh rotated key>
DASHSCOPE_BASE_URL=https://ws-wixqcfw8kkpu5v6h.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
DASHSCOPE_VL_MODEL=qwen-vl-max
```

Rules:

- Never commit `.env.local` or log the API key.
- Keep the base URL configurable because Alibaba endpoints and model availability are region/account dependent.
- Call Qwen only when recall is not confident.
- Validate the request body and image data URL.
- Enforce an image-size limit and a request timeout.
- Return a neutral fallback on all upstream errors; Qwen failure must never break recall.

## 5. Planned File Layout

```text
lib/
  ai/
    embeddings.ts          # singleton model, warm-up, embedImage
    recall.ts              # threshold decision and matcher interface
    types.ts               # image/match/recall contracts
    __tests__/
      embeddings.test.ts
      recall.test.ts
app/
  api/
    describe/
      route.ts             # server-only Qwen-VL fallback
      route.test.ts
scripts/
  recognition-spike.mjs    # repeatable local proof script
test-data/
  recognition/
    README.md              # naming/instructions; real photos remain ignored if desired
.env.example               # variable names only, never values
```

If the project does not yet have a test runner, add Vitest for unit tests. The spike remains a separate executable proof because it validates the actual model and real images rather than mocked behavior.

## 6. Implement-and-Test Work Packages

Each package has one concrete goal, one implementation slice, and one test gate. Finish the test gate before starting the next package.

| Package | Goal | Implement | Test gate | Dependency |
| --- | --- | --- | --- | --- |
| WP-0 | Secure configuration | Rotate key, add environment variable names, configure Singapore workspace URL | Exposed key fails; no secret is tracked by Git | Fresh API key |
| WP-1 | Prove recognition | Install Transformers.js and build the repeatable spike | Same-object score separates from unknown on real phone photos | Five-photo kit |
| WP-2 | Create reusable embeddings | Add singleton loader, warm-up, validation, and `embedImage()` | Unit tests plus real 512-value output | WP-1 |
| WP-3 | Make recall safe | Add typed recall function with injected fake matcher and provisional threshold | Boundary/error tests always fail closed to `notSure` | WP-2 |
| WP-4 | Add optional Qwen fallback | Add validated, timed server route using Singapore configuration | Valid request works; invalid/upstream failure degrades safely | WP-0 |
| WP-5 | Measure on a phone | Add a tiny internal test page or wire Member C's page when available | Cold/warm timing recorded; UI remains responsive | WP-2 |
| WP-6 | Integrate the database | Replace fake adapter with Member B's `matchItem()` | Correct nearest item and score semantics verified | Member B, expected in 3-4 days |
| WP-7 | Calibrate threshold | Collect known/unknown score table and select cutoff | Unknown demo objects never become confident | Members B/C and seed items |
| WP-8 | Complete demo wiring | Pre-warm on screens and connect confident audio/not-sure UI | Three successful real-phone rehearsals | Member C, expected in 3-4 days |
| WP-9 | Attempt faces | Reuse the pipeline with type filtering | Include only if reliable and consent/privacy checks pass | All object work complete |

Recommended execution order while waiting for Members B/C:

```text
WP-0 -> WP-1 -> WP-2 -> WP-3
   \
    -> WP-4
WP-2 -> WP-5

After teammate updates: WP-6 -> WP-7 -> WP-8 -> optional WP-9
```

### Working rule

For every package:

1. Implement the smallest complete behavior.
2. Add or update automated tests.
3. Run lint, tests, and production build.
4. Perform the package's real-device or real-image check where applicable.
5. Record evidence and any measurement in the PR description or README.
6. Commit only after the gate passes.

### WP-0 - Security and contract lock

1. Revoke the credential pasted in chat and create a new Singapore-region key.
2. Record the workspace ID privately.
3. Confirm with Member B that the database uses `vector(512)` and returns cosine similarity where higher is better.
4. Confirm the README data contract with Members B and C.
5. Add `.env.example` containing names only.

Exit criteria:

- Compromised key is invalid.
- No secret appears in Git history, source, logs, screenshots, or documentation.
- Similarity semantics are agreed in writing.

### WP-1 - Day-0 recognition spike

1. Add `@huggingface/transformers` using the repository package manager.
2. Add five representative photos:
   - Three angles of one enrolled object.
   - One new angle of the same physical object.
   - One unrelated object.
3. Implement the spike with `RawImage.read()`, normalized image-feature extraction, and dot-product similarity.
4. Print embedding length, same-object scores, unrelated-object scores, model load time, and inference time.
5. Repeat on at least two object pairs if time allows.
6. Save results in a short Markdown table without committing private photos unless the team agrees.

Exit criteria:

- Every embedding has exactly 512 finite values.
- The same physical object scores clearly above unrelated objects in the actual demo setup.
- Results are repeatable across multiple angles.
- If there is no useful separation, stop and reassess the model before building database integration.

### WP-2 - Browser embedding module

1. Implement a cached extractor promise in `lib/ai/embeddings.ts`.
2. Export:

```ts
warmEmbeddingModel(): Promise<void>
embedImage(image: Blob | string | HTMLImageElement): Promise<number[]>
```

3. Validate empty/invalid images, output dimensionality, and numeric finiteness.
4. Surface a typed error that UI code can turn into a calm retry message.
5. Measure cold load and warm inference on the actual demo phone.
6. If inference blocks interaction, move model work behind a Web Worker without changing the public API.

Exit criteria:

- One model initialization occurs per browser session.
- Concurrent warm/embed calls are safe.
- Valid photos produce normalized 512-number arrays.
- Failure does not crash the page.

### WP-3 - Recall logic with fake matcher

1. Define the `MatchItem` function type and inject it into recall logic for tests.
2. Implement:

```ts
type RecallResult =
  | { notSure: false; item: MatchResult["item"]; score: number }
  | { notSure: true; score: number };
```

3. Use `0.80` only as `PROVISIONAL_CONFIDENCE_THRESHOLD`.
4. Cover these cases:
   - No match.
   - Score below threshold.
   - Score exactly at threshold.
   - Score above threshold.
   - Matcher failure.
   - Invalid embedding.
5. Provide Member C with the two stable functions: `warmEmbeddingModel()` and `recall()`.

Exit criteria:

- Unknown and error cases never return an item as confident.
- Boundary behavior is deterministic and tested.
- The module can switch from the fake matcher to Member B's function without changing UI code.

### WP-4 - Qwen-VL not-sure route

1. Implement `POST /api/describe` as a Next.js server route.
2. Accept one resized image data URL.
3. Reject malformed input and oversized payloads.
4. Call the configured Singapore endpoint with a short, neutral prompt.
5. Normalize Qwen's response into `{ description: string }`.
6. Add timeout, non-2xx handling, and safe fallback behavior.
7. Test with the new key without exposing it to client bundles or logs.

Exit criteria:

- The fresh key is used only server-side.
- A valid image receives a short description when the configured model is available.
- Invalid input, timeout, quota, or regional model failure produces a safe fallback.
- The patient experience still offers caregiver contact when Qwen is unavailable.

### WP-5 - Real-phone performance check

1. Add a temporary internal test surface or use Member C's screen if it is already available.
2. Measure initial model download, cold embedding, and warm embedding separately.
3. Verify the loading state prevents repeated taps and explains what is happening.
4. Check for UI freezing during inference on the intended demo phone.
5. Move inference to a Web Worker only if measurements show it is necessary.

Exit criteria:

- Cold and warm timings are recorded with the phone/browser used.
- Warm recognition is practical for the demo flow.
- The interface remains responsive or a Web Worker mitigation is implemented.

Implementation status (3 September 2026): `/ai-test` is complete and verified
in production desktop and Infinix Hot 30 Chrome tests. The desktop baseline was
42,886 ms for a cold model warm-up, 497 ms for the first embedding, and 355 ms
for a repeated embedding, with a normalized 512-value result. On the phone, the
first run measured 63,419/6,190/5,714 ms for warm-up/first/warm inference; after
reload it measured 22,896/6,000/5,552 ms. Worst sampled UI delay was 17 ms and 3
ms respectively. See `docs/browser-performance-test.md`. A Web Worker is not
currently justified by responsiveness, but the roughly 5.6-second warm time is
an explicit WP-8 optimization risk.

### WP-6 - Member B integration

1. Replace the fake matcher adapter with `matchItem()`.
2. Verify that each enrollment photo produces its own embedding row.
3. Check that database similarity direction and range match the agreed contract.
4. Test duplicate/similar household objects so the system does not confidently return the wrong item.
5. Preserve the fake matcher for fast unit tests.

Exit criteria:

- The database returns the correct nearest enrolled item.
- Multiple angles improve matching rather than creating duplicate UI items.
- Query failures resolve to a safe not-sure state.

### WP-7 - Threshold calibration

1. Enroll approximately 10 real demo objects with 3-5 photos each.
2. Capture several held-out views of every enrolled object.
3. Capture unknown and visually similar objects.
4. Record scores under expected venue lighting and phone distance.
5. Choose a cutoff that prioritizes avoiding wrong confident answers.
6. Write the chosen threshold, dataset size, date, phone, and lighting notes in the README.

Do not choose the final threshold from one bottle/random-object example. If enrolled and unknown score distributions overlap, improve capture guidance or change the recognition approach rather than hiding the issue with an arbitrary cutoff.

Exit criteria:

- The final value replaces the provisional threshold.
- All rehearsed unknown items return `notSure`.
- Enrolled demo items work consistently across three complete rehearsals.

### WP-8 - UI integration and demo hardening

1. Member C calls `warmEmbeddingModel()` when caregiver and patient screens mount.
2. Show explicit model-loading and camera-processing states.
3. Prevent repeated taps while recall is running.
4. Play matched audio only after a confident result.
5. Use the calm not-sure/call-caregiver UI for all other outcomes.
6. Test on the real phone through HTTPS, not only desktop localhost.
7. Record a backup demo video after a successful rehearsal.

Exit criteria:

- Enrollment-to-recall works end to end on the demo phone.
- Warm recall meets the practical 2-3 second target or the UI communicates progress clearly.
- Network/Qwen failure does not break confident local recognition.

### WP-9 - Face recognition bonus

Attempt only after object recognition passes its exit criteria.

1. Reuse the same embedding and matching pipeline with `type: "face"` filtering.
2. Test multiple angles and lighting conditions with consenting team members only.
3. Show an accuracy/privacy disclaimer.
4. Remove the feature from the live demo if it is not consistently reliable.

## 7. Verification Commands

Run before each pull request:

```bash
npm run lint
npm run build
```

After a test runner is configured:

```bash
npm test
```

Run the recognition spike separately with its documented command and real images. A passing unit test cannot replace the real-image score check.

## 8. Pull Request Sequence

Keep changes reviewable:

1. `chore(ai): add transformers dependency and spike harness`
2. `feat(ai): add browser image embedding helper`
3. `feat(ai): add typed recall and confidence decision`
4. `feat(ai): add safe qwen vision fallback route`
5. `test(ai): document threshold calibration results`
6. `feat(ai): integrate database matcher`

Do not commit directly to `main`. Rebase or merge the latest integration branch before the final end-to-end test, following the team's chosen Git workflow.

## 9. Definition of Done

- [ ] Exposed Alibaba credential has been revoked.
- [ ] Day-0 spike demonstrates useful same-object versus unknown separation.
- [ ] `embedImage()` returns exactly 512 normalized finite numbers.
- [ ] `warmEmbeddingModel()` is wired to both relevant screens.
- [ ] `recall()` returns a typed confident/not-sure result.
- [ ] Member B's real `matchItem()` contract is integrated and tested.
- [ ] The final threshold is calibrated on real seed items and documented.
- [ ] Qwen-VL works with Singapore configuration or degrades safely.
- [ ] Unknown objects never produce a rehearsed wrong confident answer.
- [ ] Lint, tests, and production build pass.
- [ ] Three real-phone demo rehearsals pass and a backup video exists.
- [ ] Face recognition is included only if object recognition is already reliable.

## 10. Immediate Next Actions

1. Add the Supabase URL and anon key locally, apply `supabase/schema.sql`, and confirm the `photos` and `audio` buckets.
2. Enroll the WP-7 seed set and calibrate the threshold using known, unknown, and visually similar objects.
3. Replace the placeholder caregiver phone number before a real demo.
4. Run three end-to-end phone rehearsals and record a backup video.
5. Revoke the Alibaba key disclosed in chat after the agreed local work is complete.

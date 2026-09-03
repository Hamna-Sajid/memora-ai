# Browser Recognition Performance Check

Date: 3 September 2026

## Test surface

Before building the app, run `npm run models:prepare`. The generated
`public/models/` directory is intentionally ignored by Git because the vision
model is approximately 89 MB. Browsers then fetch the Q8/WASM model from the Memora
server instead of contacting Hugging Face directly.

Open `/ai-test` on the device being evaluated. The page:

- Starts `warmEmbeddingModel()` once and records the model warm-up time.
- Accepts a JPEG, PNG, or WebP from the camera or file picker.
- Disables selection and inference controls while work is running.
- Records first and repeated `embedImage()` timings separately.
- Samples animation frames during inference as a basic main-thread delay signal.
- Verifies that the result contains 512 values with magnitude `1.000000`.

The frame-delay number is a lightweight warning signal, not a full browser
performance trace. A visible freeze on the real phone still counts as a failure
even if the displayed sample is low.

## Desktop browser baseline

The production build was opened in the Codex in-app browser on the development
PC and tested with `query.jpeg`.

| Measurement | Result |
| --- | ---: |
| Cold model warm-up | 42,886 ms |
| First embedding after warm-up | 497 ms |
| Repeated warm embedding | 355 ms |
| Worst sampled frame delay | 0 ms |
| Embedding dimensions | 512 |
| Embedding magnitude | 1.000000 |

The preview, loading state, disabled controls, and result cards rendered
correctly. This establishes a desktop baseline only; it does not satisfy the
real-phone exit criterion.

## Real-phone check

1. Run the production build on the same network and open the HTTPS deployment
   or approved local-network test URL on the intended demo phone.
2. Record the phone model, browser/version, connection, and whether the model
   was already cached.
3. Wait until the page says `Ready for a photo`.
4. Capture or select one representative demo photo.
5. Run the first embedding, then run the warm embedding again.
6. While each run is active, try scrolling the page. Record any visible freeze.
7. Reload once with the browser cache intact and confirm the warm-up improves.

Record the result here before closing WP-5:

| Device/browser | Cache state | Warm-up | First embedding | Warm embedding | Worst UI delay | Visible freeze |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Infinix Hot 30 / Chrome | First phone visit | 63,419 ms | 6,190 ms | 5,714 ms | 17 ms | No |
| Infinix Hot 30 / Chrome | Reload, browser data retained | 22,896 ms | 6,000 ms | 5,552 ms | 3 ms | No |

The reload reduced model warm-up by about 64%, while repeated inference stayed
near 5.6 seconds. The frame-delay sample is low, so a Web Worker is not yet
justified for responsiveness. Warm inference is slower than the preferred 2-3
second demo target; keep an explicit processing state and reassess smaller-model
or hardware-accelerated options during WP-8 if the complete flow feels too slow.

WP-5 is accepted with this performance note: the real-phone interface remained
responsive during both inference runs, so the package's responsiveness gate is
complete without a Web Worker.

If warm inference is impractical or interaction freezes, move model inference
to a Web Worker while preserving the existing `warmEmbeddingModel()` and
`embedImage()` public API.

# Browser Recognition Performance Check

Date: 3 September 2026

## Test surface

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
| Pending | Pending | Pending | Pending | Pending | Pending | Pending |

If warm inference is impractical or interaction freezes, move model inference
to a Web Worker while preserving the existing `warmEmbeddingModel()` and
`embedImage()` public API.

# Recognition Spike Results

Date: 2 September 2026
Runtime: Node.js 24.14.0 on the local Windows development machine
Model: `Xenova/clip-vit-base-patch32` through `@huggingface/transformers` 4.2.0
Input images: six locally captured 702x1600 JPEG files

## Result

WP-1 passed for the supplied Suduri box and the visually similar Duphalac box.

| Split | Enrollment images | Positive query | Best positive | Best unknown | Separation |
| --- | --- | --- | ---: | ---: | ---: |
| Original | `front`, `back`, `side`, `top` | `query` | 0.9093 | 0.7521 | 0.1572 |
| Swapped | `front`, `query`, `side`, `top` | `back` | 0.9093 | 0.7291 | 0.1801 |

In both splits, the held-out same object scored clearly above the unknown medicine box. The result is especially useful because the unknown is a hard negative with a similar rectangular package and medical-product context.

## Timing

| Measurement | Observed value |
| --- | ---: |
| First model download and load | 163.8 seconds |
| Cached model load | 0.8 seconds |
| Individual Node.js embedding | 132-180 milliseconds |

These timings prove local feasibility but are not browser-phone performance measurements. WP-5 must measure the real demo phone separately.

## Interpretation

- The fixed 512-dimensional embedding contract was confirmed for every image.
- Explicit L2 normalization produced cosine similarity values suitable for nearest-neighbor matching.
- The provisional threshold of 0.80 separates the positive and unknown examples in this tiny dataset.
- A final threshold cannot be selected from one enrolled object and one unknown object. WP-7 still requires multiple enrolled, unknown, and visually similar objects under demo conditions.
- The first-load delay requires model pre-warming and a clear loading state. Browser caching must be verified on the deployed application.

## Next test data

Before threshold calibration, add:

- At least two more enrolled physical objects.
- Two held-out queries per enrolled object.
- One easy unknown such as a mug or remote.
- At least two additional hard unknowns from similar object categories.

## Dependency audit note

`npm audit --omit=dev` reports four high-severity advisories inherited through the package's Node-only `onnxruntime-node` and `sharp` dependencies, with no fix currently offered by npm. The production embedding module must remain browser-only so Next.js selects the web runtime. Re-check the audit before release and upgrade when Hugging Face publishes a fixed dependency chain.

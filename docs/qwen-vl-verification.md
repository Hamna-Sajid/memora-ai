# Qwen-VL Verification

Date: 2 September 2026
Region: Singapore
Endpoint: workspace-specific `ap-southeast-1.maas.aliyuncs.com`

## Automated result

The `/api/describe` route passes tests for:

- Successful string and array response formats.
- JPEG, PNG, and WebP data-URL validation.
- Malformed JSON and unsupported input rejection.
- Request and decoded-image size limits.
- Missing or invalid server configuration.
- Upstream non-success, timeout, malformed JSON, and empty response handling.
- Description normalization, length limiting, and no-store responses.

## Live result

The configured key and workspace successfully reach Alibaba Model Studio. Live calls to the following models return HTTP 403 with `AccessDenied.Unpurchased`:

- `qwen3-vl-plus`
- `qwen3-vl-flash`
- `qwen-vl-max`

This is an Alibaba account/model-entitlement gate rather than a route, endpoint, key-format, or request-network failure. Activate a Singapore Qwen-VL model in the Model Studio console, then repeat the live check. Until activation, the route returns its safe fallback and the main CLIP recognition path remains unaffected.

No API key value is recorded in this document or tracked by Git.

## Character-model control test

The following Singapore character models were tested as possible alternatives:

| Model | Text-only request | Image request | Suitability for `/api/describe` |
| --- | --- | --- | --- |
| `qwen-plus-character` | HTTP 200 | HTTP 400 invalid multimodal format | Not suitable |
| `qwen-flash-character` | HTTP 200 | HTTP 400 invalid multimodal format | Not suitable |

Both models are enabled for the workspace, but they are role-playing text-generation models and do not accept the route's image input. They cannot replace Qwen-VL for visual description. They may be useful later for rewriting an already-known text note, although a general Qwen text model is a better fit for that requirement.

## Additional model control tests

| Model | Live result | Actual capability | Suitability for Member A |
| --- | --- | --- | --- |
| `qwen3.7-text-embedding` | HTTP 200; valid 512-dimensional vector | Embeds text and code | Not suitable for image recognition or `/api/describe` |
| `qwen-mt-image-2.0` | HTTP 200; translated-image output returned | Translates text contained in an image and produces another image | Not suitable for visual description or identity matching |

Both models are enabled in the Singapore workspace and work through their documented endpoints. They do not replace either part of the current architecture:

- `qwen3.7-text-embedding` produces text-space vectors. Selecting 512 dimensions does not make those vectors compatible with the 512-dimensional CLIP image vectors used by the recognition pipeline.
- `qwen-mt-image-2.0` uses a separate image-to-image translation endpoint and requires an image URL. It returns a translated image rather than an object description.

The implementation therefore keeps browser-side CLIP for recognition and a Qwen-VL model for the optional `/api/describe` fallback.

## Local Ollama verification

Ollama `0.33.2` is installed locally with its application and model data on the `E:` drive. The selected checkpoint is `qwen3-vl:2b-instruct`; the shorter `qwen3-vl:2b` tag resolves to the Thinking checkpoint and is unsuitable for the route's small direct-answer token budget.

The production Next.js `/api/describe` route was exercised against all six supplied JPEGs. Every request returned HTTP 200 with `source: "qwen"` and a usable description. Warm request times ranged from 1.0 to 8.7 seconds. Ollama reported the model as 100% GPU-resident on the AMD Radeon RX 580 with a 2,048-token context.

The route uses Ollama's native `/api/chat` request format locally, disables streaming, limits generation, and allows a 90-second timeout for cold model loading. Alibaba Model Studio remains supported through its separate OpenAI-compatible payload and 12-second timeout.

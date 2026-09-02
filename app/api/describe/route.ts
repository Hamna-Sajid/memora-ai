import "server-only";

export const runtime = "nodejs";

const FALLBACK_DESCRIPTION = "I'm not sure what this is.";
const MAX_REQUEST_CHARACTERS = 1_500_000;
const MAX_IMAGE_BYTES = 1_000_000;
const DASHSCOPE_TIMEOUT_MILLISECONDS = 12_000;
const OLLAMA_TIMEOUT_MILLISECONDS = 90_000;
const MAX_DESCRIPTION_CHARACTERS = 240;
const MODEL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,100}$/;
const DESCRIPTION_PROMPT =
  "Describe the main visible object in one short, calm, simple sentence for an elderly person. Do not identify people, infer health conditions, or give medical or dosage advice.";
const SUPPORTED_IMAGE_DATA_URL =
  /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

type DescribeSource = "qwen" | "fallback";

type DescribeResponse = {
  description: string;
  source: DescribeSource;
  error?: "INVALID_REQUEST" | "PAYLOAD_TOO_LARGE" | "UNAVAILABLE";
};

type QwenContentPart = {
  type?: unknown;
  text?: unknown;
};

type DescriptionConfiguration = {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  provider: "dashscope" | "ollama";
  timeoutMilliseconds: number;
};

function jsonResponse(payload: DescribeResponse, status: number) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function fallbackResponse(
  status: number,
  error: NonNullable<DescribeResponse["error"]>,
) {
  return jsonResponse(
    {
      description: FALLBACK_DESCRIPTION,
      source: "fallback",
      error,
    },
    status,
  );
}

function decodedBase64Size(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length * 3) / 4 - padding;
}

function validateImageDataUrl(
  value: unknown,
): "valid" | "invalid" | "too-large" {
  if (typeof value !== "string") {
    return "invalid";
  }

  const match = SUPPORTED_IMAGE_DATA_URL.exec(value);
  if (!match) {
    return "invalid";
  }

  const base64 = match[1];
  if (base64.length === 0 || base64.length % 4 !== 0) {
    return "invalid";
  }

  return decodedBase64Size(base64) <= MAX_IMAGE_BYTES
    ? "valid"
    : "too-large";
}

function getDescriptionConfiguration(): DescriptionConfiguration | null {
  const provider = process.env.DESCRIPTION_PROVIDER?.trim() || "dashscope";

  if (provider === "ollama") {
    const baseUrl =
      process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
    const model =
      process.env.OLLAMA_VL_MODEL?.trim() || "qwen3-vl:2b-instruct";

    if (!MODEL_NAME.test(model)) {
      return null;
    }

    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      return null;
    }

    if (
      parsedBaseUrl.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(parsedBaseUrl.hostname) ||
      parsedBaseUrl.port !== "11434" ||
      parsedBaseUrl.pathname !== "/" ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password
    ) {
      return null;
    }

    parsedBaseUrl.search = "";
    parsedBaseUrl.hash = "";

    return {
      endpoint: new URL("api/chat", parsedBaseUrl).toString(),
      headers: {
        "Content-Type": "application/json",
      },
      model,
      provider,
      timeoutMilliseconds: OLLAMA_TIMEOUT_MILLISECONDS,
    };
  }

  if (provider !== "dashscope") {
    return null;
  }

  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  const baseUrl = process.env.DASHSCOPE_BASE_URL?.trim();
  const model = process.env.DASHSCOPE_VL_MODEL?.trim() || "qwen3-vl-plus";

  if (!apiKey || !baseUrl || !MODEL_NAME.test(model)) {
    return null;
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return null;
  }

  if (
    parsedBaseUrl.protocol !== "https:" ||
    !parsedBaseUrl.hostname.endsWith(".maas.aliyuncs.com") ||
    parsedBaseUrl.pathname.replace(/\/$/, "") !== "/compatible-mode/v1"
  ) {
    return null;
  }

  parsedBaseUrl.search = "";
  parsedBaseUrl.hash = "";

  return {
    endpoint: new URL(
      "chat/completions",
      `${parsedBaseUrl.toString().replace(/\/$/, "")}/`,
    ).toString(),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    model,
    provider,
    timeoutMilliseconds: DASHSCOPE_TIMEOUT_MILLISECONDS,
  };
}

function createUpstreamBody(
  configuration: DescriptionConfiguration,
  imageDataUrl: string,
) {
  if (configuration.provider === "ollama") {
    const imageBase64 = SUPPORTED_IMAGE_DATA_URL.exec(imageDataUrl)?.[1];

    return {
      model: configuration.model,
      messages: [
        {
          role: "user",
          content: DESCRIPTION_PROMPT,
          images: [imageBase64],
        },
      ],
      options: {
        num_ctx: 2048,
        num_predict: 60,
        temperature: 0.1,
      },
      stream: false,
      think: false,
    };
  }

  return {
    model: configuration.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: DESCRIPTION_PROMPT,
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    max_tokens: 60,
    temperature: 0.1,
  };
}

function extractDescription(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typedPayload = payload as {
      choices?: Array<{ message?: { content?: unknown } }>;
      message?: { content?: unknown };
    };
  const content =
    typedPayload.choices?.[0]?.message?.content ??
    typedPayload.message?.content;

  let text: string | null = null;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter(
        (part): part is QwenContentPart =>
          Boolean(part) && typeof part === "object",
      )
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join(" ");
  }

  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_DESCRIPTION_CHARACTERS);
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_CHARACTERS
  ) {
    return fallbackResponse(413, "PAYLOAD_TOO_LARGE");
  }

  let requestText: string;
  try {
    requestText = await request.text();
  } catch {
    return fallbackResponse(400, "INVALID_REQUEST");
  }

  if (requestText.length > MAX_REQUEST_CHARACTERS) {
    return fallbackResponse(413, "PAYLOAD_TOO_LARGE");
  }

  let body: unknown;
  try {
    body = JSON.parse(requestText);
  } catch {
    return fallbackResponse(400, "INVALID_REQUEST");
  }

  const imageBase64 =
    body && typeof body === "object"
      ? (body as { imageBase64?: unknown }).imageBase64
      : undefined;

  const imageValidation = validateImageDataUrl(imageBase64);
  if (imageValidation === "too-large") {
    return fallbackResponse(413, "PAYLOAD_TOO_LARGE");
  }
  if (imageValidation === "invalid") {
    return fallbackResponse(400, "INVALID_REQUEST");
  }
  const validatedImageDataUrl = imageBase64 as string;

  const configuration = getDescriptionConfiguration();
  if (!configuration) {
    return fallbackResponse(503, "UNAVAILABLE");
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(configuration.endpoint, {
      method: "POST",
      headers: configuration.headers,
      body: JSON.stringify(
        createUpstreamBody(configuration, validatedImageDataUrl),
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(configuration.timeoutMilliseconds),
    });
  } catch {
    return fallbackResponse(502, "UNAVAILABLE");
  }

  if (!upstreamResponse.ok) {
    return fallbackResponse(502, "UNAVAILABLE");
  }

  let upstreamPayload: unknown;
  try {
    upstreamPayload = await upstreamResponse.json();
  } catch {
    return fallbackResponse(502, "UNAVAILABLE");
  }

  const description = extractDescription(upstreamPayload);
  if (!description) {
    return fallbackResponse(502, "UNAVAILABLE");
  }

  return jsonResponse(
    {
      description,
      source: "qwen",
    },
    200,
  );
}

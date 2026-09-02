// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/describe/route";

const BASE_URL =
  "https://ws-wixqcfw8kkpu5v6h.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
const VALID_IMAGE = "data:image/jpeg;base64,/9j/2Q==";
const fetchMock = vi.fn();

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/describe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<{
    description: string;
    source: string;
    error?: string;
  }>;
}

beforeEach(() => {
  vi.stubEnv("DESCRIPTION_PROVIDER", "dashscope");
  vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
  vi.stubEnv("DASHSCOPE_BASE_URL", BASE_URL);
  vi.stubEnv("DASHSCOPE_VL_MODEL", "qwen3-vl-plus");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/describe", () => {
  it("calls the Singapore Qwen endpoint and returns a normalized description", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: "  This is a red medicine box.\n",
            },
          },
        ],
      }),
    );

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(responseBody(response)).resolves.toEqual({
      description: "This is a red medicine box.",
      source: "qwen",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    expect(options.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(options.cache).toBe("no-store");

    const upstreamBody = JSON.parse(String(options.body));
    expect(upstreamBody.model).toBe("qwen3-vl-plus");
    expect(upstreamBody.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: VALID_IMAGE },
    });
  });

  it("supports array-form text content", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "This is" },
                { type: "text", text: "a bottle." },
              ],
            },
          },
        ],
      }),
    );

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toMatchObject({
      description: "This is a bottle.",
      source: "qwen",
    });
  });

  it("calls local Ollama without an authorization header", async () => {
    vi.stubEnv("DESCRIPTION_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_VL_MODEL", "qwen3-vl:2b-instruct");
    fetchMock.mockResolvedValue(
      Response.json({
        message: { content: "This is a medicine bottle." },
      }),
    );

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({
      description: "This is a medicine bottle.",
      source: "qwen",
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const upstreamBody = JSON.parse(String(options.body));
    expect(upstreamBody.model).toBe("qwen3-vl:2b-instruct");
    expect(upstreamBody.messages[0].images).toEqual(["/9j/2Q=="]);
    expect(upstreamBody.stream).toBe(false);
    expect(upstreamBody.think).toBe(false);
    expect(upstreamBody.options).toMatchObject({
      num_ctx: 2048,
      num_predict: 60,
    });
  });

  it.each([
    ["remote Ollama URL", "OLLAMA_BASE_URL", "http://example.com:11434"],
    ["invalid Ollama model", "OLLAMA_VL_MODEL", "invalid model"],
  ])("rejects %s", async (_label, name, value) => {
    vi.stubEnv("DESCRIPTION_PROVIDER", "ollama");
    vi.stubEnv(name, value);

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(503);
    await expect(responseBody(response)).resolves.toMatchObject({
      source: "fallback",
      error: "UNAVAILABLE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown description provider", async () => {
    vi.stubEnv("DESCRIPTION_PROVIDER", "unknown");

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing image", {}],
    ["unsupported MIME type", { imageBase64: "data:image/gif;base64,AAAA" }],
    ["invalid base64", { imageBase64: "data:image/jpeg;base64,not_base64" }],
  ])("rejects %s", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toMatchObject({
      source: "fallback",
      error: "INVALID_REQUEST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized request before reading it", async () => {
    const response = await POST(
      request(
        { imageBase64: VALID_IMAGE },
        { "Content-Length": "1500001" },
      ),
    );

    expect(response.status).toBe(413);
    await expect(responseBody(response)).resolves.toMatchObject({
      error: "PAYLOAD_TOO_LARGE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an image whose decoded payload exceeds one megabyte", async () => {
    const oversizedBase64 = "A".repeat(1_333_336);
    const response = await POST(
      request({ imageBase64: `data:image/jpeg;base64,${oversizedBase64}` }),
    );

    expect(response.status).toBe(413);
    await expect(responseBody(response)).resolves.toMatchObject({
      error: "PAYLOAD_TOO_LARGE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing key", "DASHSCOPE_API_KEY", ""],
    ["invalid base URL", "DASHSCOPE_BASE_URL", "https://example.com/v1"],
    ["invalid model", "DASHSCOPE_VL_MODEL", "invalid model"],
  ])("returns a safe fallback for %s", async (_label, name, value) => {
    vi.stubEnv(name, value);

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(503);
    await expect(responseBody(response)).resolves.toEqual({
      description: "I'm not sure what this is.",
      source: "fallback",
      error: "UNAVAILABLE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back when Model Studio returns a non-success status", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(502);
    await expect(responseBody(response)).resolves.toMatchObject({
      source: "fallback",
      error: "UNAVAILABLE",
    });
  });

  it("falls back when the Model Studio request rejects or times out", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(502);
    await expect(responseBody(response)).resolves.toMatchObject({
      source: "fallback",
      error: "UNAVAILABLE",
    });
  });

  it("falls back when Model Studio returns no usable text", async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [] }));

    const response = await POST(request({ imageBase64: VALID_IMAGE }));

    expect(response.status).toBe(502);
    await expect(responseBody(response)).resolves.toMatchObject({
      source: "fallback",
      error: "UNAVAILABLE",
    });
  });

  it("limits the returned description length", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [{ message: { content: "A".repeat(500) } }],
      }),
    );

    const response = await POST(request({ imageBase64: VALID_IMAGE }));
    const body = await responseBody(response);

    expect(body.description).toHaveLength(240);
  });
});

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/warm-note/route";

const BASE_URL =
  "https://ws-wixqcfw8kkpu5v6h.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
const validBody = {
  note: "heart medicine, one at breakfast",
  caregiverName: "Ayesha",
  language: "en",
};
const fetchMock = vi.fn();

function request(body: unknown) {
  return new Request("http://localhost/api/warm-note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
  vi.stubEnv("DASHSCOPE_BASE_URL", BASE_URL);
  vi.stubEnv("DASHSCOPE_TEXT_MODEL", "qwen-turbo");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/warm-note", () => {
  it("returns a normalized Qwen rewrite", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [{ message: { content: "  Ayesha recorded this to help you.  \n" } }],
      }),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      warm: "Ayesha recorded this to help you.",
      source: "qwen",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns the raw note when configuration is missing", async () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "");

    const response = await POST(request(validBody));

    await expect(response.json()).resolves.toEqual({
      warm: validBody.note,
      source: "fallback",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the raw note when the provider fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const response = await POST(request(validBody));

    await expect(response.json()).resolves.toEqual({
      warm: validBody.note,
      source: "fallback",
    });
  });

  it.each([
    ["malformed JSON", "{"],
    ["empty note", { ...validBody, note: "" }],
    ["invalid language", { ...validBody, language: "fr" }],
  ])("rejects %s", async (_name, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      warm: "",
      source: "fallback",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

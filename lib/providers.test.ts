import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnswer } from "./providers";

describe("provider failover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.AGNES_API_KEY;
    delete process.env.MODEL_PROVIDER_ORDER;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GEMINI_ENABLE_GOOGLE_SEARCH;
  });

  it("falls through to Agnes when Gemini returns an error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.AGNES_API_KEY = "test-agnes-key";
    process.env.MODEL_PROVIDER_ORDER = "gemini,agnes";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("agnes-ai.com")) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: "Answer from Agnes" } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unavailable" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAnswer("test prompt")).resolves.toMatchObject({
      text: "Answer from Agnes",
      provider: "agnes",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses Vertex AI Express mode and keeps only trusted grounding domains", async () => {
    process.env.GEMINI_API_KEY = "test-vertex-key";
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
    process.env.GEMINI_ENABLE_GOOGLE_SEARCH = "true";
    process.env.MODEL_PROVIDER_ORDER = "gemini";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: "Answer from Vertex AI" }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://hkuway.com/docs/aml", title: "UWAY AML" } },
            { web: { uri: "https://example.com/other", title: "Other" } },
          ],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAnswer("test prompt")).resolves.toMatchObject({
      text: "Answer from Vertex AI",
      provider: "gemini-vertex",
      sources: [{ title: "UWAY AML", url: "https://hkuway.com/docs/aml" }],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("aiplatform.googleapis.com");
  });
});

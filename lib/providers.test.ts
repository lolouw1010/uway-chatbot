import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnswer } from "./providers";

describe("provider failover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.AGNES_API_KEY;
    delete process.env.MODEL_PROVIDER_ORDER;
  });

  it("falls through to Agnes when Gemini returns an error", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.AGNES_API_KEY = "test-agnes-key";
    process.env.MODEL_PROVIDER_ORDER = "gemini,agnes";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "Answer from Agnes" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAnswer("test prompt")).resolves.toMatchObject({
      text: "Answer from Agnes",
      provider: "agnes",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

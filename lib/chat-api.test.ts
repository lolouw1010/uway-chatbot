import { describe, expect, it } from "vitest";
import { parseChatApiRequest, sanitizeAnswerText, toChatApiResponse } from "./chat-api";

describe("chat API contract", () => {
  it("accepts a channel query and defaults to web", () => {
    expect(parseChatApiRequest({ query: "  How do I start KYC?  " })).toMatchObject({
      channel: "web",
      query: "How do I start KYC?",
    });
    expect(parseChatApiRequest({ query: "Help", channel: "telegram" })).toMatchObject({
      channel: "telegram",
      query: "Help",
    });
  });

  it("rejects unsupported channels", () => {
    expect(() => parseChatApiRequest({ query: "Help", channel: "email" })).toThrow("Unsupported channel.");
  });

  it("adds the public answer and source URI fields without removing legacy fields", () => {
    expect(toChatApiResponse({
      text: "Start with a sandbox applicant.",
      provider: "gemini-vertex",
      model: "gemini-2.5-flash",
      sources: [{
        title: "Create an applicant",
        url: "https://docs.sumsub.com/docs/create-an-applicant",
        excerpt: "Applicant setup",
        domain: "sumsub",
        sourceType: "web",
      }],
    })).toMatchObject({
      answer: "Start with a sandbox applicant.",
      text: "Start with a sandbox applicant.",
      model: "gemini-2.5-flash",
      sources: [{
        title: "Create an applicant",
        uri: "https://docs.sumsub.com/docs/create-an-applicant",
        url: "https://docs.sumsub.com/docs/create-an-applicant",
      }],
    });
  });

  it("removes model-inserted citation markers from answer text", () => {
    expect(sanitizeAnswerText("Use the sandbox first [cite: 3]. Then verify webhooks [1]."))
      .toBe("Use the sandbox first. Then verify webhooks.");
  });
});

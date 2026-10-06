import { describe, expect, it } from "vitest";
import { buildPrompt, buildSystemInstruction } from "./prompt";

describe("assistant prompt", () => {
  it("requires direct expert answers while keeping vendor and source boundaries", () => {
    const prompt = buildPrompt([{ role: "user", content: "How should we launch KYC?" }], "Test context");

    expect(prompt).toContain("Uway's Lead Solutions Architect");
    expect(prompt).toContain("Never call the brand HKUWay");
    expect(prompt).toContain("Never begin with phrases such as");
    expect(prompt).toContain("Never begin with acknowledgment or pleasantry fillers");
    expect(prompt).toContain("implementation steps and the relevant compliance or risk controls");
    expect(prompt).toContain("Clearly distinguish Uway services from vendor capabilities");
    expect(prompt).toContain("Never refuse a documented Sumsub question merely because it is not about a Uway-owned product");
    expect(prompt).toContain("always finish the answer cleanly");
    expect(prompt).toContain("Do not add a sources section, source URLs");
  });

  it("requires live Sumsub documentation search when local context is incomplete", () => {
    const instruction = buildSystemInstruction("No matching local passage");

    expect(instruction).toContain("MUST use Google Search grounding");
    expect(instruction).toContain("site:docs.sumsub.com");
    expect(instruction).toContain("Never treat missing local context as proof");
    expect(instruction).toContain("X-Payload-Digest-Alg");
    expect(instruction).toContain("lowercase hexadecimal HMAC-SHA256");
    expect(instruction).toContain("URL-encode userId or levelName string values");
    expect(instruction).toContain("Do not mention or invent undocumented alternative signature headers");
    expect(instruction).not.toContain("CONVERSATION");
  });
});

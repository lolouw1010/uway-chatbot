import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";

describe("assistant prompt", () => {
  it("requires direct expert answers while keeping vendor and source boundaries", () => {
    const prompt = buildPrompt([{ role: "user", content: "How should we launch KYC?" }], "Test context");

    expect(prompt).toContain("HKUWay's Chief Solutions Expert");
    expect(prompt).toContain("Never begin with phrases such as");
    expect(prompt).toContain("implementation steps and the relevant compliance or risk controls");
    expect(prompt).toContain("Clearly distinguish HKUWay services from vendor capabilities");
    expect(prompt).toContain("always finish the answer cleanly");
    expect(prompt).toContain("Do not add a sources section, source URLs");
  });
});

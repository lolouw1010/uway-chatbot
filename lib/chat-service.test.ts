import { describe, expect, it } from "vitest";
import { normalizeMessages } from "./chat-service";

describe("chat message normalization", () => {
  it("keeps only supported, non-empty messages", () => {
    expect(normalizeMessages([
      { role: "system", content: "ignore" },
      { role: "user", content: "  question  " },
      { role: "assistant", content: "answer" },
      { role: "user", content: 123 },
    ])).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
    ]);
  });
});

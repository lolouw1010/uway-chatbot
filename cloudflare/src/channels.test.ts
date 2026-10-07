import { describe, expect, it } from "vitest";
import { extractTelegramQuestion } from "./channels";

describe("Cloudflare Telegram message routing", () => {
  it("accepts replies to Uway-Bob and ignores replies to another bot", () => {
    const message = {
      message_id: 11,
      text: "Can you give me the implementation steps?",
      chat: { id: -20, type: "supergroup" },
      from: { id: 30, is_bot: false },
    };

    expect(extractTelegramQuestion({
      message: {
        ...message,
        reply_to_message: { from: { is_bot: true, username: "UwayBobBot" } },
      },
    }, "UwayBobBot")?.text).toBe("Can you give me the implementation steps?");

    expect(extractTelegramQuestion({
      message: {
        ...message,
        reply_to_message: { from: { is_bot: true, username: "OtherBot" } },
      },
    }, "UwayBobBot")).toBeNull();
  });
});

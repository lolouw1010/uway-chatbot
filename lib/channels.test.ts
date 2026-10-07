import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, formatChannelAnswer, splitText } from "./channel-utils";
import { extractLarkQuestion } from "./lark";
import { extractTelegramQuestion } from "./telegram";

describe("Telegram message routing", () => {
  it("accepts a private text question", () => {
    expect(extractTelegramQuestion({
      message: {
        message_id: 10,
        text: "How do I submit a support ticket?",
        chat: { id: 20, type: "private" },
        from: { id: 30, is_bot: false },
      },
    }, "UwayHelpBot")).toEqual({
      chatId: "20",
      messageId: 10,
      senderId: "30",
      text: "How do I submit a support ticket?",
    });
  });

  it("requires an explicit command or mention in a group", () => {
    const base = {
      message_id: 10,
      chat: { id: -20, type: "supergroup" },
      from: { id: 30, is_bot: false },
    };
    expect(extractTelegramQuestion({ message: { ...base, text: "How does billing work?" } }, "UwayHelpBot")).toBeNull();
    expect(extractTelegramQuestion({ message: { ...base, text: "@UwayHelpBot How does billing work?" } }, "UwayHelpBot")?.text)
      .toBe("How does billing work?");
    expect(extractTelegramQuestion({ message: { ...base, text: "/ask@UwayHelpBot How does billing work?" } }, "UwayHelpBot")?.text)
      .toBe("How does billing work?");
  });

  it("accepts a group question that replies to this bot", () => {
    expect(extractTelegramQuestion({
      message: {
        message_id: 11,
        text: "Can you give me the implementation steps?",
        chat: { id: -20, type: "supergroup" },
        from: { id: 30, is_bot: false },
        reply_to_message: { from: { is_bot: true, username: "UwayBobBot" } },
      },
    }, "UwayBobBot")?.text).toBe("Can you give me the implementation steps?");

    expect(extractTelegramQuestion({
      message: {
        message_id: 12,
        text: "This reply is for another bot",
        chat: { id: -20, type: "supergroup" },
        from: { id: 30, is_bot: false },
        reply_to_message: { from: { is_bot: true, username: "OtherBot" } },
      },
    }, "UwayBobBot")).toBeNull();
  });

  it("ignores messages from bots", () => {
    expect(extractTelegramQuestion({
      message: {
        message_id: 10,
        text: "loop",
        chat: { id: 20, type: "private" },
        from: { id: 30, is_bot: true },
      },
    }, "UwayHelpBot")).toBeNull();
  });
});

describe("Lark message routing", () => {
  const payload = {
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_type: "user", sender_id: { open_id: "ou_user" } },
      message: {
        message_id: "om_message",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_1 How do I download an invoice?" }),
        mentions: [{ key: "@_user_1" }],
      },
    },
  };

  it("accepts and cleans a group mention", () => {
    expect(extractLarkQuestion(payload)).toEqual({
      chatId: "oc_group",
      messageId: "om_message",
      senderId: "ou_user",
      text: "How do I download an invoice?",
    });
  });

  it("ignores group messages that do not mention the bot", () => {
    expect(extractLarkQuestion({
      ...payload,
      event: {
        ...payload.event,
        message: { ...payload.event.message, mentions: [] },
      },
    })).toBeNull();
  });
});

describe("channel output controls", () => {
  it("renders model output and sources as plain text", () => {
    const text = formatChannelAnswer({
      text: "## Answer\nUse **Settings**.",
      provider: "gemini-vertex",
      model: "gemini-2.5-flash",
      sources: [{
        title: "Billing guide",
        url: "https://hkuway.com/docs/billing",
        excerpt: "",
        domain: "uway-general",
        sourceType: "web",
      }],
    });
    expect(text).toContain("Answer\nUse Settings.");
    expect(text).toContain("https://hkuway.com/docs/billing");
  });

  it("splits long messages below a platform limit", () => {
    const parts = splitText("first paragraph\n\nsecond paragraph\n\nthird paragraph", 24);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 24)).toBe(true);
  });

  it("limits repeated questions within a fixed window", () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);
    expect(limiter.allow("customer", 0)).toBe(true);
    expect(limiter.allow("customer", 1)).toBe(true);
    expect(limiter.allow("customer", 2)).toBe(false);
    expect(limiter.allow("customer", 1000)).toBe(true);
  });
});

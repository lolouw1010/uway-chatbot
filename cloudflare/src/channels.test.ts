import { afterEach, describe, expect, it, vi } from "vitest";
import { extractTelegramQuestion, sendTelegramReply } from "./channels";
import type { Env } from "./env";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("accepts a Telegram guest mention and preserves its one-time query id", () => {
    expect(extractTelegramQuestion({
      guest_message: {
        message_id: 12,
        guest_query_id: "guest-query-1",
        text: "@UwayBobBot How do I integrate WebSDK?",
        chat: { id: -20, type: "supergroup" },
        from: { id: 30, is_bot: false },
      },
    }, "UwayBobBot")).toEqual({
      chatId: "-20",
      messageId: 12,
      senderId: "30",
      text: "How do I integrate WebSDK?",
      guestQueryId: "guest-query-1",
    });
  });

  it("answers guest mentions through answerGuestQuery instead of sendMessage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramReply({ TELEGRAM_BOT_TOKEN: "token" } as Env, {
      chatId: "-20",
      messageId: 12,
      senderId: "30",
      text: "question",
      guestQueryId: "guest-query-1",
    }, "answer");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottoken/answerGuestQuery");
    expect(JSON.parse(String(init.body))).toMatchObject({
      guest_query_id: "guest-query-1",
      result: {
        type: "article",
        title: "Uway-Bob",
        input_message_content: { message_text: "answer" },
      },
    });
  });
});

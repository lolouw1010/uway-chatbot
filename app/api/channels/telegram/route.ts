import { after } from "next/server";
import { channelRateLimiter, isAllowedChat, secretsMatch } from "@/lib/channel-utils";
import { answerTelegramQuestion, extractTelegramQuestion, sendTelegramText, type TelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

const busyMessage = "You have sent several questions in a short period. Please wait a moment and try again.\n\n您短时间内发送了较多问题，请稍后再试。";
const unavailableMessage = "UWAY AI is temporarily unavailable. Please try again shortly.\n\nUWAY AI 暂时不可用，请稍后再试。";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !webhookSecret) return Response.json({ error: "Telegram is not configured" }, { status: 503 });
  if (!secretsMatch(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const question = extractTelegramQuestion(update, process.env.TELEGRAM_BOT_USERNAME);
  if (!question || !isAllowedChat(question.chatId, process.env.TELEGRAM_ALLOWED_CHAT_IDS)) return Response.json({ ok: true });

  after(async () => {
    if (!channelRateLimiter.allow(`telegram:${question.chatId}:${question.senderId}`)) {
      await sendTelegramText(token, question, busyMessage).catch((error) => console.error("Telegram rate-limit reply failed", error));
      return;
    }
    try {
      await answerTelegramQuestion(token, question);
    } catch (error) {
      console.error(`Telegram update ${update.update_id || "unknown"} failed`, error);
      await sendTelegramText(token, question, unavailableMessage).catch((sendError) => console.error("Telegram error reply failed", sendError));
    }
  });

  return Response.json({ ok: true });
}

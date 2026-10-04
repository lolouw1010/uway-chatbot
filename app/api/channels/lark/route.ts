import { after } from "next/server";
import { channelRateLimiter, isAllowedChat, secretsMatch } from "@/lib/channel-utils";
import { answerLarkQuestion, extractLarkQuestion, sendLarkReply, type LarkEventPayload } from "@/lib/lark";

export const runtime = "nodejs";
export const maxDuration = 60;

const busyMessage = "You have sent several questions in a short period. Please wait a moment and try again.\n\n您短时间内发送了较多问题，请稍后再试。";
const unavailableMessage = "UWAY AI is temporarily unavailable. Please try again shortly.\n\nUWAY AI 暂时不可用，请稍后再试。";

function credentials() {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  return appId && appSecret
    ? { appId, appSecret, baseUrl: process.env.LARK_OPEN_API_BASE_URL }
    : null;
}

export async function POST(request: Request) {
  const verificationToken = process.env.LARK_VERIFICATION_TOKEN;
  const larkCredentials = credentials();
  if (!verificationToken || !larkCredentials) return Response.json({ error: "Lark is not configured" }, { status: 503 });

  let payload: LarkEventPayload & { challenge?: string; token?: string; type?: string; encrypt?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (payload.encrypt) {
    return Response.json({ error: "Encrypted Lark callbacks are not enabled" }, { status: 400 });
  }

  const callbackToken = payload.header?.token || payload.token;
  if (!secretsMatch(callbackToken, verificationToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (payload.type === "url_verification" && payload.challenge) return Response.json({ challenge: payload.challenge });

  const question = extractLarkQuestion(payload);
  if (!question || !isAllowedChat(question.chatId, process.env.LARK_ALLOWED_CHAT_IDS)) return Response.json({});

  after(async () => {
    if (!channelRateLimiter.allow(`lark:${question.chatId}:${question.senderId}`)) {
      await sendLarkReply(larkCredentials, question.messageId, busyMessage).catch((error) => console.error("Lark rate-limit reply failed", error));
      return;
    }
    try {
      await answerLarkQuestion(larkCredentials, question);
    } catch (error) {
      console.error(`Lark event ${payload.header?.event_id || "unknown"} failed`, error);
      await sendLarkReply(larkCredentials, question.messageId, unavailableMessage).catch((sendError) => console.error("Lark error reply failed", sendError));
    }
  });

  return Response.json({});
}

import { isAllowedChat, secretsMatch } from "@/lib/channel-utils";
import { sendLarkNotification } from "@/lib/lark";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

type NotificationRequest = {
  channel?: unknown;
  destinationId?: unknown;
  title?: unknown;
  message?: unknown;
  referenceUrl?: unknown;
};

function notificationText(title: string, message: string, referenceUrl?: string) {
  return `UWAY NOTICE | ${title}\n\n${message}${referenceUrl ? `\n\nMore information\n${referenceUrl}` : ""}`;
}

export async function POST(request: Request) {
  const notifySecret = process.env.CHANNEL_NOTIFY_SECRET;
  const authorization = request.headers.get("authorization");
  const suppliedSecret = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!notifySecret) return Response.json({ error: "Notifications are not configured" }, { status: 503 });
  if (!secretsMatch(suppliedSecret, notifySecret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: NotificationRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const channel = body.channel;
  const destinationId = typeof body.destinationId === "string" ? body.destinationId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 12_000) : "";
  const referenceUrl = typeof body.referenceUrl === "string" ? body.referenceUrl.trim() : undefined;
  if ((channel !== "telegram" && channel !== "lark") || !destinationId || !title || !message) {
    return Response.json({ error: "channel, destinationId, title, and message are required" }, { status: 400 });
  }
  if (referenceUrl) {
    try {
      if (new URL(referenceUrl).protocol !== "https:") throw new Error();
    } catch {
      return Response.json({ error: "referenceUrl must be an HTTPS URL" }, { status: 400 });
    }
  }

  const allowedIds = channel === "telegram" ? process.env.TELEGRAM_ALLOWED_CHAT_IDS : process.env.LARK_ALLOWED_CHAT_IDS;
  if (!allowedIds?.trim() || !isAllowedChat(destinationId, allowedIds)) {
    return Response.json({ error: "Destination is not allowlisted" }, { status: 403 });
  }

  const text = notificationText(title, message, referenceUrl);
  try {
    if (channel === "telegram") {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return Response.json({ error: "Telegram is not configured" }, { status: 503 });
      await sendTelegramNotification(token, destinationId, text);
    } else {
      const appId = process.env.LARK_APP_ID;
      const appSecret = process.env.LARK_APP_SECRET;
      if (!appId || !appSecret) return Response.json({ error: "Lark is not configured" }, { status: 503 });
      await sendLarkNotification({ appId, appSecret, baseUrl: process.env.LARK_OPEN_API_BASE_URL }, destinationId, text);
    }
    return Response.json({ success: true, channel, destinationId });
  } catch (error) {
    console.error(`Failed to deliver ${channel} notification`, error);
    return Response.json({ error: "Notification delivery failed" }, { status: 502 });
  }
}

import type { AssistantAnswer } from "./chat";
import type { Env, LarkQuestion, TelegramQuestion } from "./env";

type TelegramMessage = {
  message_id?: number;
  text?: string;
  guest_query_id?: string;
  chat?: { id?: number; type?: string };
  from?: { id?: number; is_bot?: boolean; username?: string };
  reply_to_message?: { from?: { is_bot?: boolean; username?: string } };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  guest_message?: TelegramMessage;
};

export type LarkEventPayload = {
  type?: string;
  challenge?: string;
  token?: string;
  encrypt?: string;
  header?: { event_id?: string; event_type?: string; token?: string };
  event?: {
    sender?: { sender_id?: { open_id?: string }; sender_type?: string };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      mentions?: Array<{ key?: string }>;
    };
  };
};

function escapedRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractTelegramQuestion(update: TelegramUpdate, botUsername?: string): TelegramQuestion | null {
  const message = update.guest_message || update.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  const senderId = message?.from?.id;
  const rawText = message?.text?.trim();
  if (!chatId || !messageId || !senderId || !rawText || message.from?.is_bot) return null;
  const isPrivate = message.chat?.type === "private";
  const username = botUsername?.trim().replace(/^@/, "");
  const commandPattern = username
    ? new RegExp(`^/ask(?:@${escapedRegExp(username)})?(?:\\s+|$)`, "i")
    : /^\/ask(?:\s+|$)/i;
  const hasCommand = commandPattern.test(rawText);
  const mentionPattern = username ? new RegExp(`@${escapedRegExp(username)}\\b`, "ig") : null;
  const hasMention = Boolean(mentionPattern?.test(rawText));
  const replyAuthor = message.reply_to_message?.from;
  const isReplyToBot = Boolean(
    username
    && replyAuthor?.is_bot
    && replyAuthor.username?.toLowerCase() === username.toLowerCase(),
  );
  const isGuestQuery = Boolean(update.guest_message?.guest_query_id);
  if (!isPrivate && !isGuestQuery && !hasCommand && !hasMention && !isReplyToBot) return null;
  const text = rawText.replace(commandPattern, "").replace(mentionPattern || /$^/, "").trim().slice(0, 6000);
  return text ? {
    chatId: String(chatId),
    messageId,
    senderId: String(senderId),
    text,
    ...(isGuestQuery ? { guestQueryId: update.guest_message?.guest_query_id } : {}),
  } : null;
}

export function extractLarkQuestion(payload: LarkEventPayload): LarkQuestion | null {
  if (payload.header?.event_type !== "im.message.receive_v1") return null;
  const sender = payload.event?.sender;
  const message = payload.event?.message;
  if (
    sender?.sender_type !== "user"
    || message?.message_type !== "text"
    || !message.message_id
    || !message.chat_id
    || !sender.sender_id?.open_id
    || !message.content
  ) return null;
  const mentions = message.mentions || [];
  if (message.chat_type === "group" && mentions.length === 0) return null;
  let content: unknown;
  try {
    content = JSON.parse(message.content);
  } catch {
    return null;
  }
  if (!content || typeof content !== "object" || !("text" in content) || typeof content.text !== "string") return null;
  const text = mentions.reduce((value, mention) => mention.key ? value.replaceAll(mention.key, "") : value, content.text).trim().slice(0, 6000);
  return text ? { chatId: message.chat_id, messageId: message.message_id, senderId: sender.sender_id.open_id, text } : null;
}

export function isAllowedChat(chatId: string, allowedIds?: string) {
  if (!allowedIds?.trim()) return true;
  return allowedIds.split(",").some((id) => id.trim() === chatId);
}

export async function secretsMatch(actual: string | null | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function markdownToPlainText(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function formatChannelAnswer(answer: AssistantAnswer, sourceLimit = 5) {
  const sources = answer.sources.slice(0, sourceLimit);
  const sourceText = sources.length
    ? `\n\nSources\n${sources.map((source, index) => `${index + 1}. ${source.title}\n${source.url}`).join("\n")}`
    : "";
  return `${markdownToPlainText(answer.text)}${sourceText}`;
}

function splitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return [value];
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    const paragraphBreak = remaining.lastIndexOf("\n\n", maxLength);
    const lineBreak = remaining.lastIndexOf("\n", maxLength);
    const space = remaining.lastIndexOf(" ", maxLength);
    const splitAt = paragraphBreak > maxLength / 2 ? paragraphBreak : lineBreak > maxLength / 2 ? lineBreak : space > maxLength / 2 ? space : maxLength;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function telegramApi(token: string, method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean } | null;
  if (!response.ok || !result?.ok) throw new Error(`Telegram ${method} failed with status ${response.status}`);
}

export async function sendTelegramReply(env: Env, question: TelegramQuestion, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram is not configured");
  if (question.guestQueryId) {
    await telegramApi(env.TELEGRAM_BOT_TOKEN, "answerGuestQuery", {
      guest_query_id: question.guestQueryId,
      result: {
        type: "article",
        id: crypto.randomUUID(),
        title: "Uway-Bob",
        input_message_content: {
          message_text: text.slice(0, 3900),
          link_preview_options: { is_disabled: true },
        },
      },
    });
    return;
  }
  for (const [index, part] of splitText(text, 3900).entries()) {
    await telegramApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
      chat_id: question.chatId,
      text: part,
      link_preview_options: { is_disabled: true },
      ...(index === 0 ? { reply_parameters: { message_id: question.messageId } } : {}),
    });
  }
}

export async function sendTelegramNotification(env: Env, chatId: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram is not configured");
  for (const part of splitText(text, 3900)) {
    await telegramApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: part,
      link_preview_options: { is_disabled: true },
    });
  }
}

function larkBaseUrl(env: Env) {
  return (env.LARK_OPEN_API_BASE_URL || "https://open.larksuite.com").replace(/\/$/, "");
}

async function getLarkToken(env: Env) {
  if (!env.LARK_APP_ID || !env.LARK_APP_SECRET) throw new Error("Lark is not configured");
  const response = await fetch(`${larkBaseUrl(env)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as { code?: number; tenant_access_token?: string } | null;
  if (!response.ok || result?.code !== 0 || !result.tenant_access_token) throw new Error(`Lark tenant token request failed with status ${response.status}`);
  return result.tenant_access_token;
}

async function larkApi(env: Env, path: string, body: object) {
  const token = await getLarkToken(env);
  const response = await fetch(`${larkBaseUrl(env)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as { code?: number } | null;
  if (!response.ok || result?.code !== 0) throw new Error(`Lark API request failed with status ${response.status}`);
}

export async function sendLarkReply(env: Env, messageId: string, text: string) {
  await larkApi(env, `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    msg_type: "text",
    content: JSON.stringify({ text: text.slice(0, 20_000) }),
  });
}

export async function sendLarkNotification(env: Env, chatId: string, text: string) {
  await larkApi(env, "/open-apis/im/v1/messages?receive_id_type=chat_id", {
    receive_id: chatId,
    msg_type: "text",
    content: JSON.stringify({ text: text.slice(0, 20_000) }),
  });
}

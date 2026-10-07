import { answerConversation } from "./chat-service";
import { formatChannelAnswer, splitText } from "./channel-utils";

type TelegramUser = {
  id?: number;
  is_bot?: boolean;
  username?: string;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number; type?: string };
  from?: TelegramUser;
  reply_to_message?: { from?: TelegramUser };
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

export type TelegramQuestion = {
  chatId: string;
  messageId: number;
  senderId: string;
  text: string;
};

function escapedRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractTelegramQuestion(update: TelegramUpdate, botUsername: string | undefined): TelegramQuestion | null {
  const message = update.message;
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
  if (!isPrivate && !hasCommand && !hasMention && !isReplyToBot) return null;

  const text = rawText
    .replace(commandPattern, "")
    .replace(mentionPattern || /$^/, "")
    .trim()
    .slice(0, 6000);
  if (!text) return null;

  return {
    chatId: String(chatId),
    messageId,
    senderId: String(senderId),
    text,
  };
}

async function telegramApi(token: string, method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(`Telegram ${method} failed with status ${response.status}`);
  }
}

export async function sendTelegramText(token: string, question: TelegramQuestion, text: string) {
  const parts = splitText(text, 3900);
  for (const [index, part] of parts.entries()) {
    await telegramApi(token, "sendMessage", {
      chat_id: question.chatId,
      text: part,
      link_preview_options: { is_disabled: true },
      ...(index === 0 ? { reply_parameters: { message_id: question.messageId } } : {}),
    });
  }
}

export async function sendTelegramNotification(token: string, chatId: string, text: string) {
  for (const part of splitText(text, 3900)) {
    await telegramApi(token, "sendMessage", {
      chat_id: chatId,
      text: part,
      link_preview_options: { is_disabled: true },
    });
  }
}

export async function answerTelegramQuestion(token: string, question: TelegramQuestion) {
  const answer = await answerConversation([{ role: "user", content: question.text }]);
  await sendTelegramText(token, question, formatChannelAnswer(answer));
}

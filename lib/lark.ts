import { answerConversation } from "./chat-service";
import { formatChannelAnswer } from "./channel-utils";

type LarkMention = {
  key?: string;
};

export type LarkEventPayload = {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    token?: string;
  };
  event?: {
    sender?: {
      sender_id?: { open_id?: string };
      sender_type?: string;
    };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      mentions?: LarkMention[];
    };
  };
};

export type LarkQuestion = {
  chatId: string;
  messageId: string;
  senderId: string;
  text: string;
};

type LarkCredentials = {
  appId: string;
  appSecret: string;
  baseUrl?: string;
};

let cachedTenantToken: { appId: string; value: string; expiresAt: number } | undefined;

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

  const text = mentions
    .reduce((value, mention) => mention.key ? value.replaceAll(mention.key, "") : value, content.text)
    .trim()
    .slice(0, 6000);
  if (!text) return null;

  return {
    chatId: message.chat_id,
    messageId: message.message_id,
    senderId: sender.sender_id.open_id,
    text,
  };
}

function openApiBaseUrl(value: string | undefined) {
  return (value || "https://open.larksuite.com").replace(/\/$/, "");
}

async function getTenantToken(credentials: LarkCredentials) {
  const now = Date.now();
  if (cachedTenantToken?.appId === credentials.appId && cachedTenantToken.expiresAt > now + 60_000) {
    return cachedTenantToken.value;
  }

  const response = await fetch(`${openApiBaseUrl(credentials.baseUrl)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: credentials.appId, app_secret: credentials.appSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.code !== 0 || typeof result?.tenant_access_token !== "string") {
    throw new Error(`Lark tenant token request failed with status ${response.status}`);
  }

  cachedTenantToken = {
    appId: credentials.appId,
    value: result.tenant_access_token,
    expiresAt: now + (typeof result.expire === "number" ? result.expire : 7200) * 1000,
  };
  return cachedTenantToken.value;
}

async function larkApi(credentials: LarkCredentials, path: string, body: object) {
  const tenantToken = await getTenantToken(credentials);
  const response = await fetch(`${openApiBaseUrl(credentials.baseUrl)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenantToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.code !== 0) {
    throw new Error(`Lark API request failed with status ${response.status}`);
  }
}

export async function sendLarkReply(credentials: LarkCredentials, messageId: string, text: string) {
  await larkApi(credentials, `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    msg_type: "text",
    content: JSON.stringify({ text: text.slice(0, 20_000) }),
  });
}

export async function sendLarkNotification(credentials: LarkCredentials, chatId: string, text: string) {
  await larkApi(credentials, "/open-apis/im/v1/messages?receive_id_type=chat_id", {
    receive_id: chatId,
    msg_type: "text",
    content: JSON.stringify({ text: text.slice(0, 20_000) }),
  });
}

export async function answerLarkQuestion(credentials: LarkCredentials, question: LarkQuestion) {
  const answer = await answerConversation([{ role: "user", content: question.text }]);
  await sendLarkReply(credentials, question.messageId, formatChannelAnswer(answer));
}

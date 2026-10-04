import type { Source } from "./types";

export const CHAT_API_CHANNELS = ["web", "whatsapp", "telegram", "lark"] as const;

export type ChatApiChannel = typeof CHAT_API_CHANNELS[number];

type ChatAnswer = {
  text: string;
  provider: string;
  model: string;
  sources: Source[];
};

export function parseChatApiRequest(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const requestedChannel = input.channel ?? "web";
  if (!CHAT_API_CHANNELS.includes(requestedChannel as ChatApiChannel)) {
    throw new Error("Unsupported channel.");
  }

  const query = typeof input.query === "string"
    ? input.query.trim().slice(0, 6000)
    : null;

  return {
    channel: requestedChannel as ChatApiChannel,
    query,
    messages: input.messages,
  };
}

export function toChatApiResponse(result: ChatAnswer) {
  return {
    ...result,
    answer: result.text,
    sources: result.sources.map((source) => ({
      ...source,
      uri: source.url,
    })),
  };
}

export function sanitizeAnswerText(text: string) {
  return text
    .replace(/\s*\[(?:cite|source|来源)\s*:?\s*[\d,\s-]+\]/giu, "")
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/gu, "")
    .trim();
}

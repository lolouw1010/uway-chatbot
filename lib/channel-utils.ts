import { timingSafeEqual } from "node:crypto";
import type { AssistantAnswer } from "./chat-service";

export function secretsMatch(actual: string | null | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function isAllowedChat(chatId: string, allowedIds: string | undefined) {
  if (!allowedIds?.trim()) return true;
  return allowedIds.split(",").some((id) => id.trim() === chatId);
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

export function splitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return [value];

  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    const paragraphBreak = remaining.lastIndexOf("\n\n", maxLength);
    const lineBreak = remaining.lastIndexOf("\n", maxLength);
    const space = remaining.lastIndexOf(" ", maxLength);
    const splitAt = paragraphBreak > maxLength / 2
      ? paragraphBreak
      : lineBreak > maxLength / 2
        ? lineBreak
        : space > maxLength / 2
          ? space
          : maxLength;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export class FixedWindowRateLimiter {
  private readonly requests = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()) {
    const current = this.requests.get(key);
    if (!current || current.resetAt <= now) {
      this.requests.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const channelRateLimiter = new FixedWindowRateLimiter(
  positiveInteger(process.env.CHANNEL_RATE_LIMIT_MAX, 6),
  positiveInteger(process.env.CHANNEL_RATE_LIMIT_WINDOW_MS, 60_000),
);

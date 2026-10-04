import { buildPrompt, generateAnswer } from "./providers";
import { retrieve, toSources } from "./retrieval";
import type { Source } from "./types";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantAnswer = {
  text: string;
  provider: string;
  model: string;
  sources: Source[];
};

export class MissingQuestionError extends Error {}

export function normalizeMessages(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((message): message is { role: "user" | "assistant"; content: string } => (
      Boolean(message)
      && typeof message === "object"
      && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
    ))
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 6000),
    }))
    .filter((message) => message.content);
}

export async function answerConversation(messages: ConversationMessage[]): Promise<AssistantAnswer> {
  const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content;
  if (!latestQuestion) throw new MissingQuestionError("Please enter a question.");

  const chunks = retrieve(latestQuestion, 6);
  const context = chunks.map((chunk, index) => (
    `[${index + 1}] ${chunk.title}\nDomain: ${chunk.domain}\nSource type: ${chunk.sourceType}\nURL: ${chunk.url}\n${chunk.text}`
  )).join("\n\n");

  try {
    const result = await generateAnswer(buildPrompt(messages, context));
    const seenSources = new Set<string>();
    const sources = [...toSources(chunks), ...(result.sources || [])].filter((source) => {
      if (seenSources.has(source.url)) return false;
      seenSources.add(source.url);
      return true;
    });
    return { ...result, sources };
  } catch (error) {
    if (process.env.NODE_ENV === "development" && !process.env.GEMINI_API_KEY && !process.env.AGNES_API_KEY) {
      return {
        text: `This local preview is ready, but no model API key is configured yet. The question was matched against **${chunks[0]?.title || "UWAY Documentation"}**.\n\nAdd a Gemini or Agnes API key to \`.env.local\` to generate a documentation-grounded answer.`,
        provider: "preview",
        model: "local preview",
        sources: toSources(chunks),
      };
    }
    throw error;
  }
}

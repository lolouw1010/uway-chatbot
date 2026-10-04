import { GoogleGenAI, type GenerateContentResponse } from "@google/genai/web";
import { sanitizeAnswerText } from "@/lib/chat-api";
import { buildPrompt } from "@/lib/prompt";
import { retrieve, toSources } from "@/lib/retrieval";
import type { Source } from "@/lib/types";
import type { Env } from "./env";

export type ConversationMessage = { role: "user" | "assistant"; content: string };
export type AssistantAnswer = { text: string; provider: string; model: string; sources: Source[] };

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
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 6000) }))
    .filter((message) => message.content);
}

function trustedGroundingSources(response: GenerateContentResponse): Source[] {
  const seen = new Set<string>();
  return (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).flatMap((chunk) => {
    const web = chunk.web;
    if (!web?.uri || seen.has(web.uri)) return [];
    let hostname = web.domain?.toLowerCase().replace(/^www\./, "") || "";
    try {
      hostname ||= new URL(web.uri).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return [];
    }
    const domain = hostname === "docs.sumsub.com" || hostname.endsWith(".docs.sumsub.com")
      ? "sumsub"
      : hostname === "hkuway.com" || hostname.endsWith(".hkuway.com")
        ? "uway-general"
        : null;
    if (!domain) return [];
    seen.add(web.uri);
    return [{
      title: web.title || web.uri,
      url: web.uri,
      excerpt: "Live Google Search grounding result.",
      domain,
      sourceType: "web" as const,
    }];
  });
}

async function generateWithGemini(env: Env, prompt: string) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const googleSearch = env.GEMINI_ENABLE_GOOGLE_SEARCH !== "false";
  const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: env.GEMINI_API_KEY,
    httpOptions: { apiVersion: "v1" },
  });
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.15,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 256 },
      abortSignal: AbortSignal.timeout(30_000),
      tools: googleSearch ? [{ googleSearch: {} }] : undefined,
    },
  });
  const text = sanitizeAnswerText(response.text || "");
  if (!text) throw new Error("Vertex AI returned no text");
  return {
    text,
    provider: "gemini-vertex",
    model,
    sources: googleSearch ? trustedGroundingSources(response) : [],
  };
}

async function generateWithAgnes(env: Env, prompt: string) {
  if (!env.AGNES_API_KEY) throw new Error("AGNES_API_KEY is not configured");
  const model = env.AGNES_MODEL || "agnes-2.0-flash";
  const baseUrl = (env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AGNES_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.15,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Agnes returned ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? sanitizeAnswerText(content)
    : Array.isArray(content)
      ? sanitizeAnswerText(content.map((part) => part.text || "").join(""))
      : "";
  if (!text) throw new Error("Agnes returned no text");
  return { text, provider: "agnes", model, sources: [] };
}

async function generateAnswer(env: Env, prompt: string) {
  const order = (env.MODEL_PROVIDER_ORDER || "gemini,agnes")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is "gemini" | "agnes" => provider === "gemini" || provider === "agnes");
  const errors: string[] = [];
  for (const provider of order) {
    try {
      return provider === "gemini" ? await generateWithGemini(env, prompt) : await generateWithAgnes(env, prompt);
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw new Error(errors.join("; ") || "No model providers configured");
}

export async function answerConversation(env: Env, messages: ConversationMessage[]): Promise<AssistantAnswer> {
  const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content;
  if (!latestQuestion) throw new MissingQuestionError("Please enter a question.");
  const chunks = retrieve(latestQuestion, 6);
  const context = chunks.map((chunk, index) => (
    `[${index + 1}] ${chunk.title}\nDomain: ${chunk.domain}\nSource type: ${chunk.sourceType}\nURL: ${chunk.url}\n${chunk.text}`
  )).join("\n\n");
  const result = await generateAnswer(env, buildPrompt(messages, context));
  const seen = new Set<string>();
  const sources = [...toSources(chunks), ...result.sources].filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
  return { ...result, sources };
}

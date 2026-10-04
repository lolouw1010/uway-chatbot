import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { sanitizeAnswerText } from "./chat-api";
import type { Source } from "@/lib/types";

export { buildPrompt } from "./prompt";

type ProviderResult = {
  text: string;
  provider: "gemini" | "gemini-vertex" | "agnes";
  model: string;
  sources?: Source[];
};

function timeoutSignal(milliseconds = 30000) {
  return AbortSignal.timeout(milliseconds);
}

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
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

async function generateWithGemini(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
  const explicitVertex = isEnabled(process.env.GOOGLE_GENAI_USE_VERTEXAI);
  const useVertex = explicitVertex || (!apiKey && Boolean(project));

  if (!apiKey && !project) {
    throw new Error("Gemini API key or Vertex AI project is not configured");
  }

  const ai = useVertex
    ? apiKey
      ? new GoogleGenAI({ vertexai: true, apiKey, httpOptions: { apiVersion: "v1" } })
      : new GoogleGenAI({ vertexai: true, project, location, httpOptions: { apiVersion: "v1" } })
    : new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const googleSearch = useVertex && process.env.GEMINI_ENABLE_GOOGLE_SEARCH !== "false";
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.15,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 256 },
      abortSignal: timeoutSignal(),
      tools: googleSearch ? [{ googleSearch: {} }] : undefined,
    },
  });
  const text = sanitizeAnswerText(response.text || "");
  if (!text) throw new Error("Gemini returned no text");
  return {
    text,
    provider: useVertex ? "gemini-vertex" : "gemini",
    model,
    sources: googleSearch ? trustedGroundingSources(response) : [],
  };
}

async function generateWithAgnes(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) throw new Error("AGNES_API_KEY is not configured");
  const model = process.env.AGNES_MODEL || "agnes-2.0-flash";
  const baseUrl = (process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.15,
      max_tokens: 4096,
    }),
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error(`Agnes returned ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? sanitizeAnswerText(content)
    : Array.isArray(content)
      ? sanitizeAnswerText(content.map((part: { text?: string }) => part.text || "").join(""))
      : "";
  if (!text) throw new Error("Agnes returned no text");
  return { text, provider: "agnes", model };
}

export async function generateAnswer(prompt: string): Promise<ProviderResult> {
  const order = (process.env.MODEL_PROVIDER_ORDER || "gemini,agnes")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is "gemini" | "agnes" => provider === "gemini" || provider === "agnes");
  const errors: string[] = [];

  for (const provider of order) {
    try {
      return provider === "gemini" ? await generateWithGemini(prompt) : await generateWithAgnes(prompt);
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw new Error(errors.join("; ") || "No model providers configured");
}

import { GoogleAuth } from "google-auth-library";

type ProviderMessage = { role: "user" | "assistant"; content: string };

type ProviderResult = {
  text: string;
  provider: "gemini" | "gemini-vertex" | "agnes";
  model: string;
};

function timeoutSignal(milliseconds = 30000) {
  return AbortSignal.timeout(milliseconds);
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function geminiText(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}

async function generateWithGeminiApiKey(prompt: string, apiKey: string): Promise<ProviderResult> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1200 },
      }),
      signal: timeoutSignal(),
    },
  );
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const data = await response.json() as GeminiResponse;
  const text = geminiText(data);
  if (!text) throw new Error("Gemini returned no text");
  return { text, provider: "gemini", model };
}

async function generateWithVertexGemini(prompt: string): Promise<ProviderResult> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error("Gemini API key or Vertex ADC is not configured");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const project = process.env.GOOGLE_CLOUD_PROJECT || await auth.getProjectId();
  if (!project) throw new Error("Vertex AI project could not be determined");

  const response = await client.request<GeminiResponse>({
    url: `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
    method: "POST",
    data: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 1200 },
    },
    timeout: 30000,
  });
  const text = geminiText(response.data);
  if (!text) throw new Error("Vertex Gemini returned no text");
  return { text, provider: "gemini-vertex", model };
}

async function generateWithGemini(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? generateWithGeminiApiKey(prompt, apiKey) : generateWithVertexGemini(prompt);
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
      max_tokens: 1200,
    }),
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error(`Agnes returned ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part: { text?: string }) => part.text || "").join("").trim()
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

export function buildPrompt(messages: ProviderMessage[], context: string) {
  const conversation = messages.slice(-8).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  return `You are UWAY AI, a careful documentation assistant for UWAY Innovation.

The knowledge base covers UWAY's Compliance Quality Analysis, AI Travel Rule Auto Configer, AI AML Sentinel, product documentation, selected vendor integration documentation, and official regulatory material.

Answer only from the DOCUMENTATION CONTEXT below. If the context does not contain enough information, say so plainly and direct the user to the linked source documents or contacts@hkuway.com. Never invent regulations, thresholds, product capabilities, or legal conclusions.

Apply this evidence order when sources differ: official regulator material, current UWAY product documentation, vendor documentation, then repository implementation notes. Treat plans, milestones, roadmaps, proposals, and future-tense implementation notes as planned work—not as a live production capability. State the relevant jurisdiction and publication date when the context provides them, and flag a mismatch with the user's jurisdiction or timeframe. Distinguish documented UWAY guidance from legal advice.

Keep the answer practical and concise. Use Markdown. Reply in the same language as the user's latest message. Do not add a sources section or context-number citations such as [1] because the interface renders deduplicated source links separately.

DOCUMENTATION CONTEXT
${context}

CONVERSATION
${conversation}`;
}

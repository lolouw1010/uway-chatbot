import docs from "@/data/docs.json";
import type { DocumentChunk } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  const corpus = docs as DocumentChunk[];
  const domains = corpus.reduce<Record<string, number>>((counts, chunk) => {
    counts[chunk.domain] = (counts[chunk.domain] || 0) + 1;
    return counts;
  }, {});
  const vertexEnabled = process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === "true";
  const geminiAuth = vertexEnabled && process.env.GEMINI_API_KEY
    ? "vertex-express-key"
    : vertexEnabled && process.env.GOOGLE_CLOUD_PROJECT
      ? "vertex-adc"
      : process.env.GEMINI_API_KEY
        ? "gemini-api-key"
        : "unconfigured";

  return Response.json({
    status: corpus.length ? "ok" : "degraded",
    service: "uway-docs-assistant",
    knowledge: { chunks: corpus.length, domains },
    providers: {
      gemini: {
        configured: geminiAuth !== "unconfigured",
        auth: geminiAuth,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        googleSearch: vertexEnabled && process.env.GEMINI_ENABLE_GOOGLE_SEARCH !== "false",
      },
      agnes: { configured: Boolean(process.env.AGNES_API_KEY), model: process.env.AGNES_MODEL || "agnes-2.0-flash" },
    },
    channels: {
      telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) },
      lark: { configured: Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET && process.env.LARK_VERIFICATION_TOKEN) },
      notifications: { configured: Boolean(process.env.CHANNEL_NOTIFY_SECRET) },
    },
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

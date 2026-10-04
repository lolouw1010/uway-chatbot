import { NextResponse } from "next/server";
import { buildPrompt, generateAnswer } from "@/lib/providers";
import { retrieve, toSources } from "@/lib/retrieval";

type IncomingMessage = { role?: unknown; content?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawMessages: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages
      .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      .map((message) => ({ role: message.role as "user" | "assistant", content: (message.content as string).trim().slice(0, 6000) }))
      .filter((message) => message.content);

    const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content;
    if (!latestQuestion) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });

    const chunks = retrieve(latestQuestion, 6);
    const context = chunks.map((chunk, index) => (
      `[${index + 1}] ${chunk.title}\nDomain: ${chunk.domain}\nSource type: ${chunk.sourceType}\nURL: ${chunk.url}\n${chunk.text}`
    )).join("\n\n");
    const prompt = buildPrompt(messages, context);

    try {
      const result = await generateAnswer(prompt);
      const seenSources = new Set<string>();
      const sources = [...toSources(chunks), ...(result.sources || [])].filter((source) => {
        if (seenSources.has(source.url)) return false;
        seenSources.add(source.url);
        return true;
      });
      const { sources: _groundingSources, ...answer } = result;
      return NextResponse.json({ ...answer, sources });
    } catch (providerError) {
      if (process.env.NODE_ENV === "development" && !process.env.GEMINI_API_KEY && !process.env.AGNES_API_KEY) {
        return NextResponse.json({
          text: `This local preview is ready, but no model API key is configured yet. The question was matched against **${chunks[0]?.title || "UWAY Documentation"}**.\n\nAdd a Gemini or Agnes API key to \`.env.local\` to generate a documentation-grounded answer.`,
          provider: "preview",
          model: "local preview",
          sources: toSources(chunks),
        });
      }
      console.error("All model providers failed", providerError);
      return NextResponse.json({ error: "The assistant is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "The request could not be processed." }, { status: 400 });
  }
}

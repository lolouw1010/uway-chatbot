import { NextResponse } from "next/server";
import { answerConversation, MissingQuestionError, normalizeMessages } from "@/lib/chat-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = normalizeMessages(body.messages);

    try {
      return NextResponse.json(await answerConversation(messages));
    } catch (providerError) {
      if (providerError instanceof MissingQuestionError) {
        return NextResponse.json({ error: providerError.message }, { status: 400 });
      }
      console.error("All model providers failed", providerError);
      return NextResponse.json({ error: "The assistant is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "The request could not be processed." }, { status: 400 });
  }
}

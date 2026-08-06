import { Suspense } from "react";
import { ChatWorkspace } from "@/components/chat-workspace";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="chat-loading">Loading UWAY AI…</div>}>
      <ChatWorkspace />
    </Suspense>
  );
}

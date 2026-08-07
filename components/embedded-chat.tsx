"use client";

import { FloatingChat } from "./floating-chat";

function noop() {}

export function EmbeddedChat({ initialQuery }: { initialQuery: string }) {
  return (
    <main className="embed-shell">
      <FloatingChat
        embedded
        initialQuery={initialQuery}
        open
        onOpen={noop}
        onClose={noop}
      />
    </main>
  );
}

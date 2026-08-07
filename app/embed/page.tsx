import type { Metadata } from "next";
import { EmbeddedChat } from "@/components/embedded-chat";

export const metadata: Metadata = {
  title: "Ask UWAY AI | UWAY Documentation Assistant",
  robots: { index: false, follow: false },
};

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const query = (await searchParams).q;
  const initialQuery = (Array.isArray(query) ? query[0] : query)?.trim().slice(0, 800) ?? "";

  return <EmbeddedChat initialQuery={initialQuery} />;
}

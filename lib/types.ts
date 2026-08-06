export type Role = "user" | "assistant";

export type KnowledgeDomain =
  | "uway-general"
  | "compliance-quality"
  | "travel-rule"
  | "aml-sentinel"
  | "regulatory"
  | "sumsub";

export type KnowledgeSourceType = "web" | "repository";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
  provider?: string;
  model?: string;
};

export type Source = {
  title: string;
  url: string;
  excerpt: string;
  domain: KnowledgeDomain;
  sourceType: KnowledgeSourceType;
};

export type DocumentChunk = Source & {
  id: string;
  text: string;
};

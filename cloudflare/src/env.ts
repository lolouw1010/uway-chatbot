export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CHANNEL_JOBS: Queue<ChannelJob>;
  ENVIRONMENT: string;
  GEMINI_MODEL: string;
  GEMINI_ENABLE_GOOGLE_SEARCH: string;
  MODEL_PROVIDER_ORDER: string;
  AGNES_MODEL: string;
  AGNES_BASE_URL: string;
  CHANNEL_RATE_LIMIT_MAX: string;
  CHANNEL_RATE_LIMIT_WINDOW_MS: string;
  GEMINI_API_KEY?: string;
  AGNES_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_CHAT_IDS?: string;
  LARK_APP_ID?: string;
  LARK_APP_SECRET?: string;
  LARK_VERIFICATION_TOKEN?: string;
  LARK_ALLOWED_CHAT_IDS?: string;
  LARK_OPEN_API_BASE_URL?: string;
  CHANNEL_NOTIFY_SECRET?: string;
}

export type TelegramQuestion = {
  chatId: string;
  messageId: number;
  senderId: string;
  text: string;
};

export type LarkQuestion = {
  chatId: string;
  messageId: string;
  senderId: string;
  text: string;
};

export type ChannelJob =
  | { kind: "telegram-question"; eventId: string; question: TelegramQuestion }
  | { kind: "lark-question"; eventId: string; question: LarkQuestion }
  | {
      kind: "notification";
      eventId: string;
      channel: "telegram" | "lark";
      destinationId: string;
      text: string;
    };

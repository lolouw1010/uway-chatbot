import { Hono } from "hono";
import docs from "@/data/docs.json";
import { parseChatApiRequest, toChatApiResponse } from "@/lib/chat-api";
import type { DocumentChunk } from "@/lib/types";
import { answerConversation, MissingQuestionError, normalizeMessages } from "./chat";
import {
  extractLarkQuestion,
  extractTelegramQuestion,
  formatChannelAnswer,
  isAllowedChat,
  type LarkEventPayload,
  secretsMatch,
  sendLarkNotification,
  sendLarkReply,
  sendTelegramNotification,
  sendTelegramReply,
} from "./channels";
import type { ChannelJob, Env } from "./env";

type AppBindings = { Bindings: Env };
type NotificationRequest = {
  channel?: unknown;
  destinationId?: unknown;
  title?: unknown;
  message?: unknown;
  referenceUrl?: unknown;
};

const app = new Hono<AppBindings>();
const busyMessage = "You have sent several questions in a short period. Please wait a moment and try again.\n\n您短时间内发送了较多问题，请稍后再试。";
const unavailableMessage = "UWAY AI is temporarily unavailable. Please try again shortly.\n\nUWAY AI 暂时不可用，请稍后再试。";

async function reserveEvent(env: Env, eventId: string, kind: ChannelJob["kind"]) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO processed_events (event_id, kind, status, attempts, created_at, updated_at)
    VALUES (?, ?, 'pending', 0, unixepoch(), unixepoch())
  `).bind(eventId, kind).run();
  const row = await env.DB.prepare(
    "SELECT status FROM processed_events WHERE event_id = ?",
  ).bind(eventId).first<{ status: string }>();
  return row?.status === "pending" || row?.status === "retry";
}

async function claimEvent(env: Env, eventId: string) {
  const row = await env.DB.prepare(`
    UPDATE processed_events
    SET status = 'processing', attempts = attempts + 1, updated_at = unixepoch()
    WHERE event_id = ?
      AND (
        status IN ('pending', 'retry')
        OR (status = 'processing' AND updated_at < unixepoch() - 900)
      )
    RETURNING event_id
  `).bind(eventId).first<{ event_id: string }>();
  return Boolean(row);
}

async function updateEvent(env: Env, eventId: string, status: "completed" | "retry" | "failed", error?: string) {
  await env.DB.prepare(`
    UPDATE processed_events SET status = ?, error = ?, updated_at = unixepoch() WHERE event_id = ?
  `).bind(status, error?.slice(0, 500) || null, eventId).run();
}

async function logDelivery(
  env: Env,
  eventId: string,
  channel: "telegram" | "lark",
  destinationId: string,
  status: "delivered" | "failed",
  error?: string,
) {
  await env.DB.prepare(`
    INSERT INTO delivery_logs (event_id, channel, destination_id, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
  `).bind(eventId, channel, destinationId, status, error?.slice(0, 500) || null).run();
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function allowQuestion(env: Env, key: string) {
  const now = Date.now();
  const windowMs = positiveInteger(env.CHANNEL_RATE_LIMIT_WINDOW_MS, 60_000);
  const limit = positiveInteger(env.CHANNEL_RATE_LIMIT_MAX, 6);
  const row = await env.DB.prepare(`
    INSERT INTO rate_limits (limiter_key, window_started_at, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(limiter_key) DO UPDATE SET
      window_started_at = CASE
        WHEN ? - rate_limits.window_started_at >= ? THEN ?
        ELSE rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN ? - rate_limits.window_started_at >= ? THEN 1
        ELSE rate_limits.request_count + 1
      END
    RETURNING request_count
  `).bind(key, now, now, windowMs, now, now, windowMs).first<{ request_count: number }>();
  return (row?.request_count || 1) <= limit;
}

function notificationText(title: string, message: string, referenceUrl?: string) {
  return `UWAY NOTICE | ${title}\n\n${message}${referenceUrl ? `\n\nMore information\n${referenceUrl}` : ""}`;
}

app.get("/api/health", async (c) => {
  const corpus = docs as DocumentChunk[];
  const domains = corpus.reduce<Record<string, number>>((counts, chunk) => {
    counts[chunk.domain] = (counts[chunk.domain] || 0) + 1;
    return counts;
  }, {});
  let database = "ok";
  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch {
    database = "degraded";
  }
  return c.json({
    status: corpus.length && database === "ok" ? "ok" : "degraded",
    service: "uway-docs-assistant",
    runtime: "cloudflare-workers",
    environment: c.env.ENVIRONMENT,
    knowledge: { chunks: corpus.length, domains },
    providers: {
      gemini: {
        configured: Boolean(c.env.GEMINI_API_KEY),
        auth: c.env.GEMINI_API_KEY ? "vertex-express-key" : "unconfigured",
        model: c.env.GEMINI_MODEL || "gemini-2.5-flash",
        googleSearch: c.env.GEMINI_ENABLE_GOOGLE_SEARCH !== "false",
      },
      agnes: { configured: Boolean(c.env.AGNES_API_KEY), model: c.env.AGNES_MODEL || "agnes-2.0-flash" },
    },
    channels: {
      telegram: { configured: Boolean(c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_WEBHOOK_SECRET) },
      lark: { configured: Boolean(c.env.LARK_APP_ID && c.env.LARK_APP_SECRET && c.env.LARK_VERIFICATION_TOKEN) },
      notifications: { configured: Boolean(c.env.CHANNEL_NOTIFY_SECRET) },
    },
    database,
    timestamp: new Date().toISOString(),
  }, 200, { "Cache-Control": "no-store" });
});

app.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json();
    const input = parseChatApiRequest(body);
    const messages = input.query === null
      ? normalizeMessages(input.messages)
      : input.query
        ? [{ role: "user" as const, content: input.query }]
        : [];
    try {
      return c.json(toChatApiResponse(await answerConversation(c.env, messages)));
    } catch (error) {
      if (error instanceof MissingQuestionError) return c.json({ error: error.message }, 400);
      console.error("All model providers failed", error instanceof Error ? error.message : "unknown error");
      return c.json({ error: "The assistant is temporarily unavailable. Please try again shortly." }, 503);
    }
  } catch {
    return c.json({ error: "The request could not be processed." }, 400);
  }
});

app.post("/api/channels/telegram", async (c) => {
  const env = c.env;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error: "Telegram is not configured" }, 503);
  if (!await secretsMatch(c.req.header("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let update: Parameters<typeof extractTelegramQuestion>[0];
  try {
    update = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }
  const question = extractTelegramQuestion(update, env.TELEGRAM_BOT_USERNAME);
  if (!question || !isAllowedChat(question.chatId, env.TELEGRAM_ALLOWED_CHAT_IDS)) return c.json({ ok: true });
  const eventId = `telegram:${update.update_id ?? `${question.chatId}:${question.messageId}`}`;
  if (await reserveEvent(env, eventId, "telegram-question")) {
    await env.CHANNEL_JOBS.send({ kind: "telegram-question", eventId, question }, { contentType: "json" });
  }
  return c.json({ ok: true });
});

app.post("/api/channels/lark", async (c) => {
  const env = c.env;
  if (!env.LARK_APP_ID || !env.LARK_APP_SECRET || !env.LARK_VERIFICATION_TOKEN) return c.json({ error: "Lark is not configured" }, 503);
  let payload: LarkEventPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }
  if (payload.encrypt) return c.json({ error: "Encrypted Lark callbacks are not enabled" }, 400);
  if (!await secretsMatch(payload.header?.token || payload.token, env.LARK_VERIFICATION_TOKEN)) return c.json({ error: "Unauthorized" }, 401);
  if (payload.type === "url_verification" && payload.challenge) return c.json({ challenge: payload.challenge });
  const question = extractLarkQuestion(payload);
  if (!question || !isAllowedChat(question.chatId, env.LARK_ALLOWED_CHAT_IDS)) return c.json({});
  const eventId = `lark:${payload.header?.event_id || question.messageId}`;
  if (await reserveEvent(env, eventId, "lark-question")) {
    await env.CHANNEL_JOBS.send({ kind: "lark-question", eventId, question }, { contentType: "json" });
  }
  return c.json({});
});

app.post("/api/channels/notify", async (c) => {
  const env = c.env;
  const authorization = c.req.header("authorization");
  const suppliedSecret = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!env.CHANNEL_NOTIFY_SECRET) return c.json({ error: "Notifications are not configured" }, 503);
  if (!await secretsMatch(suppliedSecret, env.CHANNEL_NOTIFY_SECRET)) return c.json({ error: "Unauthorized" }, 401);
  let body: NotificationRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }
  const channel = body.channel;
  const destinationId = typeof body.destinationId === "string" ? body.destinationId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 12_000) : "";
  const referenceUrl = typeof body.referenceUrl === "string" ? body.referenceUrl.trim() : undefined;
  if ((channel !== "telegram" && channel !== "lark") || !destinationId || !title || !message) {
    return c.json({ error: "channel, destinationId, title, and message are required" }, 400);
  }
  if (referenceUrl) {
    try {
      if (new URL(referenceUrl).protocol !== "https:") throw new Error();
    } catch {
      return c.json({ error: "referenceUrl must be an HTTPS URL" }, 400);
    }
  }
  const allowedIds = channel === "telegram" ? env.TELEGRAM_ALLOWED_CHAT_IDS : env.LARK_ALLOWED_CHAT_IDS;
  if (!allowedIds?.trim() || !isAllowedChat(destinationId, allowedIds)) return c.json({ error: "Destination is not allowlisted" }, 403);
  const eventId = `notification:${crypto.randomUUID()}`;
  await reserveEvent(env, eventId, "notification");
  await env.CHANNEL_JOBS.send({
    kind: "notification",
    eventId,
    channel,
    destinationId,
    text: notificationText(title, message, referenceUrl),
  }, { contentType: "json" });
  return c.json({ success: true, accepted: true, eventId, channel, destinationId }, 202);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

async function processJob(env: Env, job: ChannelJob) {
  if (!await claimEvent(env, job.eventId)) return;
  if (job.kind === "telegram-question") {
    if (!await allowQuestion(env, `telegram:${job.question.chatId}:${job.question.senderId}`)) {
      await sendTelegramReply(env, job.question, busyMessage);
      await logDelivery(env, job.eventId, "telegram", job.question.chatId, "delivered");
      await updateEvent(env, job.eventId, "completed");
      return;
    }
    const answer = await answerConversation(env, [{ role: "user", content: job.question.text }]);
    await sendTelegramReply(env, job.question, formatChannelAnswer(answer));
    await logDelivery(env, job.eventId, "telegram", job.question.chatId, "delivered");
  } else if (job.kind === "lark-question") {
    if (!await allowQuestion(env, `lark:${job.question.chatId}:${job.question.senderId}`)) {
      await sendLarkReply(env, job.question.messageId, busyMessage);
      await logDelivery(env, job.eventId, "lark", job.question.chatId, "delivered");
      await updateEvent(env, job.eventId, "completed");
      return;
    }
    const answer = await answerConversation(env, [{ role: "user", content: job.question.text }]);
    await sendLarkReply(env, job.question.messageId, formatChannelAnswer(answer));
    await logDelivery(env, job.eventId, "lark", job.question.chatId, "delivered");
  } else if (job.channel === "telegram") {
    await sendTelegramNotification(env, job.destinationId, job.text);
    await logDelivery(env, job.eventId, "telegram", job.destinationId, "delivered");
  } else {
    await sendLarkNotification(env, job.destinationId, job.text);
    await logDelivery(env, job.eventId, "lark", job.destinationId, "delivered");
  }
  await updateEvent(env, job.eventId, "completed");
}

async function sendFinalFailure(env: Env, job: ChannelJob) {
  if (job.kind === "telegram-question") await sendTelegramReply(env, job.question, unavailableMessage);
  if (job.kind === "lark-question") await sendLarkReply(env, job.question.messageId, unavailableMessage);
}

async function serveAsset(request: Request, env: Env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (new URL(request.url).pathname.startsWith("/embed")) {
    headers.set("Content-Security-Policy", "frame-ancestors 'self' https://hkuway.com https://www.hkuway.com");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    return path.startsWith("/api/") ? app.fetch(request, env, ctx) : serveAsset(request, env);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processJob(env, message.body);
        message.ack();
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        console.error("Channel job failed", { eventId: message.body.eventId, kind: message.body.kind, attempt: message.attempts, error: detail });
        if (message.attempts >= 5) {
          await sendFinalFailure(env, message.body).catch(() => undefined);
          const destinationId = message.body.kind === "notification" ? message.body.destinationId : message.body.question.chatId;
          const channel = message.body.kind === "lark-question" ? "lark" : message.body.kind === "telegram-question" ? "telegram" : message.body.channel;
          await logDelivery(env, message.body.eventId, channel, destinationId, "failed", detail).catch(() => undefined);
          await updateEvent(env, message.body.eventId, "failed", detail);
          message.ack();
        } else {
          await updateEvent(env, message.body.eventId, "retry", detail);
          message.retry({ delaySeconds: Math.min(30 * (2 ** message.attempts), 600) });
        }
      }
    }
  },
} satisfies ExportedHandler<Env, ChannelJob>;

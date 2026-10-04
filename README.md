# UWAY Docs Assistant

A documentation-grounded chatbot for [hkuway.com](https://hkuway.com). It preserves the existing homepage hero and adds two low-impact entry points: an `Ask UWAY AI` header action and a bottom-right floating launcher. Both open the same in-page assistant with answers and links back to the relevant UWAY documentation.

## What is included

- Existing UWAY hero preserved as the primary homepage composition
- Header and bottom-right floating assistant entry points
- Desktop side panel and mobile bottom-sheet interaction
- Optional full-page `/chat` workspace
- Local retrieval over a versioned, multi-source compliance knowledge snapshot
- Vertex AI Express mode with Gemini as the primary model provider
- Optional Google Search grounding scoped by the assistant prompt, with returned sources filtered to `hkuway.com` and `docs.sumsub.com`
- Automatic fallback to Agnes AI's OpenAI-compatible API
- Environment-configurable provider order and model names
- English, Simplified Chinese, and Traditional Chinese compliance-term retrieval aliases
- Dedicated retrieval domains for Compliance Quality Analysis, AI Travel Rule Auto Configer, and AI AML Sentinel
- Selected HKMA, SFC, FATF, and Sumsub sources with source-domain provenance
- Evidence ordering that distinguishes official rules, current product documentation, vendor guidance, and implementation plans
- Development preview responses when no API keys are present
- Telegram Bot API support for private questions and explicit `/ask` or `@bot` group questions
- Lark custom-app bot support for private questions and group mentions
- Authenticated, allowlisted delivery of confirmed UWAY operations and billing notices

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Add at least one model key to `.env.local`:

```dotenv
GEMINI_API_KEY=your_vertex_ai_express_key
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_GENAI_USE_VERTEXAI=true
GEMINI_ENABLE_GOOGLE_SEARCH=true

AGNES_API_KEY=your_agnes_key
AGNES_MODEL=agnes-2.0-flash
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

MODEL_PROVIDER_ORDER=gemini,agnes
```

Secrets are read only by the server route and are never sent to the browser.

## Chat API

New channel clients can call `POST /api/chat` with a single query:

```json
{
  "query": "How should we configure a KYC workflow?",
  "channel": "web"
}
```

Supported channels are `web`, `telegram`, `lark`, and `whatsapp`. The response includes `answer`, `model`, and source objects with `title` and `uri`. Legacy `messages`, `text`, and source `url` fields remain available so the existing web assistant continues to work during channel rollout.

The assistant answers as HKUWay's Chief Solutions Expert: it leads with the recommendation, adds implementation and compliance controls when the question warrants them, and does not repeat source URLs in the answer body. Google Search Grounding can search the public web; the prompt narrows its intended use and the API filters displayed grounding links to the approved HKUWay and Sumsub domains.

## Telegram and Lark channels

Both channel adapters reuse the same retrieval and provider pipeline as the web assistant. They acknowledge incoming webhooks immediately and complete the answer after the response, so Lark does not time out while Gemini is generating. Channel questions are intentionally single-turn in the first release.

Telegram webhook URL:

```text
https://chatbot.hkuway.com/api/channels/telegram
```

Create a free bot with BotFather, keep group privacy mode enabled, and configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and a random `TELEGRAM_WEBHOOK_SECRET`. Register the webhook with only the `message` update type and the same secret token. In private chat the bot accepts normal text; in groups it responds only to `/ask`, `/ask@BotUsername`, or `@BotUsername`.

Lark event callback URL:

```text
https://chatbot.hkuway.com/api/channels/lark
```

Create a company custom app, enable its bot capability, subscribe to `im.message.receive_v1`, and grant the message receive/reply/send permissions requested by the Lark developer console. Configure `LARK_APP_ID`, `LARK_APP_SECRET`, and `LARK_VERIFICATION_TOKEN`, leave event payload encryption disabled for this initial webhook, then release the app version. In group chats the bot responds only when mentioned.

`TELEGRAM_ALLOWED_CHAT_IDS` and `LARK_ALLOWED_CHAT_IDS` are optional comma-separated inbound allowlists. Configure them in production to limit model usage to approved customer groups. The shared fixed-window limiter defaults to six questions per user per minute and can be changed with `CHANNEL_RATE_LIMIT_MAX` and `CHANNEL_RATE_LIMIT_WINDOW_MS`.

### Confirmed UWAY notices

Billing and operations systems can send already-calculated notices through `POST /api/channels/notify`. The endpoint never calculates balances, charges, invoice status, thresholds, or remaining service time. It only delivers values supplied by an authenticated upstream system.

Every outbound destination must be present in that platform's allowed-chat list, and the request must carry `Authorization: Bearer <CHANNEL_NOTIFY_SECRET>`:

```json
{
  "channel": "telegram",
  "destinationId": "-1001234567890",
  "title": "Prepaid balance below 30%",
  "message": "Your confirmed balance is HKD 12,345. At the current measured usage rate, the estimated remaining time is 18 days.",
  "referenceUrl": "https://hkuway.com/docs/"
}
```

The caller remains responsible for obtaining the real account data, choosing the correct customer destination, suppressing duplicate alerts, and recording delivery policy. Do not put customer secrets, identity documents, or full financial credentials in channel messages.

## Refresh the documentation corpus

```bash
npm run docs:sync
```

The source manifest is [`config/knowledge-sources.json`](config/knowledge-sources.json). It combines the `hkuway.com/docs` crawl with current Travel Rule implementation notes, Sumsub integration documentation, and selected official regulatory sources. The sync script extracts sections, records a knowledge domain and source type on every chunk, and writes the versionable snapshot to `data/docs.json`.

Independent sources are fetched concurrently. Unavailable sources are reported without discarding successfully refreshed material; review these warnings and the generated corpus before committing a refresh. Some regulator sites use anti-bot controls, so an unavailable page should never be treated as proof that its material is absent or superseded.

The current snapshot contains these retrieval domains:

- `uway-general`
- `compliance-quality`
- `travel-rule`
- `aml-sentinel`
- `regulatory`
- `sumsub`

The provenance and migration review of the production Streamlit/FastAPI implementation is recorded in [`docs/UPSTREAM_AUDIT.md`](docs/UPSTREAM_AUDIT.md). No server secrets or production data are stored in this repository.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run cf:typecheck
npm run cf:build
```

## Cloudflare staging

The repository also contains a parallel Cloudflare-native deployment: React/Vite static assets, a Hono Worker API, Cloudflare Queues for Telegram/Lark and confirmed notices, and D1 for idempotency, delivery status, and rate limiting. It is deployed at [chatbot-staging.hkuway.com](https://chatbot-staging.hkuway.com) without changing the production `chatbot.hkuway.com` route or stopping UWAY-MAIN.

Deployment, resource, secret, and cutover instructions are in [`cloudflare/README.md`](cloudflare/README.md).

## Request flow

1. The user opens the in-page assistant from the header or floating launcher and submits a question; `/chat` remains available as a full-page alternative.
2. The server identifies the likely product/regulatory domain and retrieves the six most relevant local documentation chunks.
3. The model receives those chunks and recent conversation messages; Vertex AI may supplement them with Google Search grounding scoped by the prompt, while the API filters displayed grounding links to `hkuway.com` and `docs.sumsub.com`.
4. Vertex AI Gemini is attempted first; failures fall through to Agnes AI.
5. The interface renders the answer, actual provider/model, and deduplicated source links.

The assistant prompt requires answers to stay within retrieved documentation, prefer official regulator material when sources differ, avoid presenting roadmaps as live capabilities, and never invent regulations, thresholds, product capabilities, or legal conclusions.

# Cloudflare staging

The Cloudflare deployment is intentionally parallel to the production Next.js service on UWAY-MAIN. It does not replace `chatbot.hkuway.com` or stop the origin service.

## Resources

- Worker: `uway-chatbot-staging`
- Custom domain: `https://chatbot-staging.hkuway.com`
- D1: `uway-chatbot-staging-apac` in the APAC region
- Queue: `uway-chatbot-staging-jobs`
- Dead-letter queue: `uway-chatbot-staging-dlq`
- Static UI: React/Vite assets served by the Worker
- API runtime: Hono on Cloudflare Workers

The Worker calls Vertex AI Express directly with the existing API-key authentication and uses Agnes as fallback. Telegram, Lark, and confirmed UWAY notices are placed on the Queue; D1 stores event idempotency, retry state, delivery status, and channel rate limits.

## Required secrets

Store secrets with Wrangler. Never put values in `wrangler.jsonc`, `.dev.vars`, Git, shell arguments, or deployment documentation.

```bash
npx wrangler secret put GEMINI_API_KEY --config cloudflare/wrangler.jsonc
npx wrangler secret put AGNES_API_KEY --config cloudflare/wrangler.jsonc
```

Channel activation additionally requires the corresponding secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
LARK_APP_ID
LARK_APP_SECRET
LARK_VERIFICATION_TOKEN
CHANNEL_NOTIFY_SECRET
```

Allowlist and non-secret channel settings can be added to the Worker configuration when the customer group IDs are known.

## Verify and deploy

```bash
npm run cf:typecheck
npm run cf:build
npm run cf:migrate:remote
npm run cf:deploy:staging
curl --fail https://chatbot-staging.hkuway.com/api/health
```

Before deploying, `npx wrangler whoami` must show the `louie@hkuway.com` account and `Uway Innovation Limited` workspace.

## Production cutover

Do not point `chatbot.hkuway.com` at this Worker until web chat, sources, Gemini billing/credits, queue retries, Telegram, Lark, and authenticated notices have been verified in staging. Keep UWAY-MAIN running as the rollback origin during the observation period. Migrating this chatbot does not authorize shutting down other services or data on UWAY-MAIN.

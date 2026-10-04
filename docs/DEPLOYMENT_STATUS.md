# Deployment status

Status date: 2026-10-04.

## Production

- Host: UWAY-MAIN.
- Live URL: `https://chatbot.hkuway.com`.
- Service: `uway-chatbot.service` on `127.0.0.1:3100`.
- Active release: `/opt/uway-chatbot/releases/20261004T084325Z`.
- Immediate rollback release: `/opt/uway-chatbot/releases/20261004T071223Z`.
- Knowledge health: 158 chunks across six domains.
- Primary model: Gemini 2.5 Flash through Vertex AI Express mode; Agnes is configured as fallback.
- Telegram, Lark, and authenticated notification routes are deployed but inactive until their channel credentials are stored in `/etc/uway-chatbot.env`.

The deployment was verified on an isolated candidate listener and again after the atomic production switch. Both checks returned a real `gemini-vertex` answer with a source. The public chatbot and the separate `hkuway.com` homepage both returned HTTP 200 after deployment.

## Staging

- Host: existing GCP Hong Kong chatbot host.
- Release root: `/opt/uway-chatbot-next-staging/releases`.
- Active release: `/opt/uway-chatbot-next-staging/current` symlink.
- Service: `uway-chatbot-next-staging.service`.
- Listener: `127.0.0.1:3100`; no public nginx route is enabled.
- Existing production services on ports 8501 and 8001 remain active.
- Knowledge health: 158 chunks across six domains.
- Primary model: Gemini 2.5 Flash through Vertex ADC.

Real staging prompts have returned successful, source-linked answers for Compliance Quality Analysis, AI Travel Rule Auto Configer, and AI AML Sentinel. The automated suite also verifies that an Agnes response is used when the Gemini API returns an error.

## Required before channel activation

- Create the Telegram bot with BotFather, then run the interactive `set-telegram-bot.sh` installer on UWAY-MAIN.
- Create and release the Lark custom app, subscribe to `im.message.receive_v1`, keep payload encryption disabled for the initial webhook, then run `set-lark-bot.sh` on UWAY-MAIN.
- Add approved customer chat IDs to both channel allowlists before sending account-specific notices.
- Store `CHANNEL_NOTIFY_SECRET` through the root-owned environment workflow before connecting billing or operations systems.
- Supply authoritative onboarding and vendor-ticket instructions for the knowledge corpus. The current corpus does not yet contain UWAY-specific invoice, billing, or vendor ticket procedures.
- Define the billing system's confirmed event payloads and duplicate-suppression policy before enabling balance, spend, invoice, or runway alerts.
- Add a reliable official-PDF extraction path for FATF sources currently blocked by Cloudflare.

Production deployment and rollback assets are maintained in `deploy/uway-main/`.

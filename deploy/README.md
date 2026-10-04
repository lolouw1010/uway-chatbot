# GCP deployment

The staging service runs from `/opt/uway-chatbot-next-staging/current` on `127.0.0.1:3100`. It does not replace the existing Streamlit service on port 8501 or change the live nginx upstream.

## Staging verification

```bash
curl --fail --silent http://127.0.0.1:3100/api/health
curl --fail --silent http://127.0.0.1:3100/
sudo systemctl status uway-chatbot-next-staging.service --no-pager
sudo journalctl -u uway-chatbot-next-staging.service -n 100 --no-pager
```

The environment file is `/etc/uway-chatbot-next-staging.env`. Keep it root-owned with mode `0600`. Never store model keys or Google credentials in the application directory or Git.

If an initial migration must reference a service-account key file, keep the path only in the root-owned environment file. Prefer workload identity or an attached service account, and rotate any transitional key before production cutover.

## Production cutover

1. Confirm the staging health response, all six knowledge domains, and a real Gemini answer.
2. Confirm Agnes by temporarily setting `MODEL_PROVIDER_ORDER=agnes` and submitting a non-sensitive test prompt.
3. Back up `/etc/nginx/sites-available/chatbot.hkuway.com`.
4. Validate the proposed nginx file with `sudo nginx -t` before reloading.
5. Reload nginx; do not stop the Streamlit service until the new endpoint has been observed successfully.

Rollback is an nginx upstream restoration to `http://localhost:8501` followed by `sudo nginx -t && sudo systemctl reload nginx`. The old frontend service remains available throughout the first cutover.

## UWAY-MAIN deployment

The `deploy/uway-main/` directory contains the production service, Cloudflare origin nginx site, rate-limit zone, and environment-variable template for the UWAY-MAIN host. The nginx site expects a dedicated Let's Encrypt certificate at `/etc/letsencrypt/live/chatbot.hkuway.com/`; issue it with Certbot after DNS reaches the host, then enable the checked-in site.

Install `set-gemini-key.sh` and `set-agnes-key.sh` as root-owned executables and run them from an interactive terminal. They read keys without echo and atomically update `/etc/uway-chatbot.env`; never pass a key as a command-line argument. The Gemini installer also performs a real chat request, requires the returned provider to be `gemini`, and restores the previous environment if verification fails.

Install `set-telegram-bot.sh` and `set-lark-bot.sh` the same way. Run them interactively on UWAY-MAIN rather than pasting bot credentials into chat or shell history. The Telegram script stores the credentials, registers the production webhook with a generated secret, restarts the service, and verifies the webhook. The Lark script stores credentials and restarts the service; the Lark developer console still requires the callback URL, `im.message.receive_v1` subscription, requested message permissions, and an app release.

Customer-group IDs must be added to the corresponding comma-separated allowlist before the internal notice endpoint can deliver account-specific notices. Inbound bot questions can be tested without an allowlist, but production should use one to control access and model spend.

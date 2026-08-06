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

The `deploy/uway-main/` directory contains the production service, HTTP-only pre-DNS nginx site, rate-limit zone, and environment-variable template for the UWAY-MAIN host. Install TLS only after `chatbot.hkuway.com` resolves to the host and the HTTP challenge is reachable.

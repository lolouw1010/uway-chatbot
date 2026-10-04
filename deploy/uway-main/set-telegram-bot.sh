#!/usr/bin/env bash
set -euo pipefail

environment_file="/etc/uway-chatbot.env"
backup_file="$(mktemp)"
candidate_file="$(mktemp)"
response_file="$(mktemp)"
trap 'rm -f "$backup_file" "$candidate_file" "$response_file"' EXIT

if [[ ! -f "$environment_file" ]]; then
  echo "Missing $environment_file; environment was not changed." >&2
  exit 1
fi

read -r -s -p "Telegram bot token: " telegram_token
printf "\n"
read -r -p "Telegram bot username (without @): " telegram_username
read -r -p "Allowed chat IDs, comma separated (blank allows inbound questions from all chats): " allowed_chat_ids
if [[ -z "$telegram_token" || ! "$telegram_username" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "A token and valid bot username are required; environment was not changed." >&2
  exit 1
fi

webhook_secret="$(openssl rand -hex 32)"
cp -p "$environment_file" "$backup_file"
grep -Ev '^(TELEGRAM_BOT_TOKEN|TELEGRAM_BOT_USERNAME|TELEGRAM_WEBHOOK_SECRET|TELEGRAM_ALLOWED_CHAT_IDS)=' "$environment_file" > "$candidate_file" || true
printf 'TELEGRAM_BOT_TOKEN=%s\n' "$telegram_token" >> "$candidate_file"
printf 'TELEGRAM_BOT_USERNAME=%s\n' "$telegram_username" >> "$candidate_file"
printf 'TELEGRAM_WEBHOOK_SECRET=%s\n' "$webhook_secret" >> "$candidate_file"
printf 'TELEGRAM_ALLOWED_CHAT_IDS=%s\n' "$allowed_chat_ids" >> "$candidate_file"
install -o root -g root -m 0600 "$candidate_file" "$environment_file"

rollback() {
  install -o root -g root -m 0600 "$backup_file" "$environment_file"
  systemctl restart uway-chatbot.service
  echo "Telegram setup failed; the previous environment was restored." >&2
}

systemctl restart uway-chatbot.service
http_status="$(curl --silent --show-error --max-time 20 \
  --output "$response_file" \
  --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data "$(printf '{\"url\":\"https://chatbot.hkuway.com/api/channels/telegram\",\"secret_token\":\"%s\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}' "$webhook_secret")" \
  "https://api.telegram.org/bot${telegram_token}/setWebhook" \
  || true)"
if [[ "$http_status" != "200" ]] || ! grep -q '"ok":true' "$response_file"; then
  rollback
  exit 1
fi

unset telegram_token webhook_secret
echo "Telegram webhook registered successfully."
curl --fail --silent http://127.0.0.1:3100/api/health
printf "\n"

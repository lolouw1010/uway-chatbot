#!/usr/bin/env bash
set -euo pipefail

environment_file="/etc/uway-chatbot.env"
temporary_file="$(mktemp)"
trap 'rm -f "$temporary_file"' EXIT

if [[ ! -f "$environment_file" ]]; then
  echo "Missing $environment_file; environment was not changed." >&2
  exit 1
fi

read -r -p "Lark App ID: " lark_app_id
read -r -s -p "Lark App Secret: " lark_app_secret
printf "\n"
read -r -s -p "Lark Verification Token: " lark_verification_token
printf "\n"
read -r -p "Allowed Lark chat IDs, comma separated (blank allows inbound questions from all chats): " allowed_chat_ids
if [[ -z "$lark_app_id" || -z "$lark_app_secret" || -z "$lark_verification_token" ]]; then
  echo "App ID, App Secret, and Verification Token are required; environment was not changed." >&2
  exit 1
fi

grep -Ev '^(LARK_APP_ID|LARK_APP_SECRET|LARK_VERIFICATION_TOKEN|LARK_OPEN_API_BASE_URL|LARK_ALLOWED_CHAT_IDS)=' "$environment_file" > "$temporary_file" || true
printf 'LARK_APP_ID=%s\n' "$lark_app_id" >> "$temporary_file"
printf 'LARK_APP_SECRET=%s\n' "$lark_app_secret" >> "$temporary_file"
printf 'LARK_VERIFICATION_TOKEN=%s\n' "$lark_verification_token" >> "$temporary_file"
printf 'LARK_OPEN_API_BASE_URL=https://open.larksuite.com\n' >> "$temporary_file"
printf 'LARK_ALLOWED_CHAT_IDS=%s\n' "$allowed_chat_ids" >> "$temporary_file"
install -o root -g root -m 0600 "$temporary_file" "$environment_file"
unset lark_app_id lark_app_secret lark_verification_token

systemctl restart uway-chatbot.service
sleep 2
curl --fail --silent http://127.0.0.1:3100/api/health
printf "\nLark credentials stored. Complete the event callback and app release in the Lark developer console.\n"

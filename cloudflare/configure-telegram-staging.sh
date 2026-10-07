#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"
wrangler_config="$script_dir/wrangler.jsonc"
webhook_url="https://chatbot-staging.hkuway.com/api/channels/telegram"

cd "$repo_dir"

if [[ ! -x node_modules/.bin/wrangler ]]; then
  echo "Wrangler is unavailable. Run npm install, then retry." >&2
  exit 1
fi
for command in curl jq openssl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

if [[ -z "${HTTPS_PROXY:-}${https_proxy:-}${ALL_PROXY:-}${all_proxy:-}" ]] \
  && command -v scutil >/dev/null 2>&1; then
  proxy_config="$(scutil --proxy)"
  proxy_enabled="$(awk '$1 == "HTTPSEnable" { print $3; exit }' <<<"$proxy_config")"
  proxy_host="$(awk '$1 == "HTTPSProxy" { print $3; exit }' <<<"$proxy_config")"
  proxy_port="$(awk '$1 == "HTTPSPort" { print $3; exit }' <<<"$proxy_config")"
  if [[ "$proxy_enabled" == "1" && -n "$proxy_host" && -n "$proxy_port" ]]; then
    export HTTPS_PROXY="http://${proxy_host}:${proxy_port}"
    export HTTP_PROXY="$HTTPS_PROXY"
    echo "Using macOS HTTPS proxy: ${proxy_host}:${proxy_port}"
  fi
  unset proxy_config proxy_enabled proxy_host proxy_port
fi

read -r -s -p "Telegram bot token from BotFather: " telegram_token
printf "\n"
if [[ -z "$telegram_token" ]]; then
  echo "A bot token is required." >&2
  exit 1
fi

bot_info="$(curl --fail --silent --show-error --max-time 20 \
  "https://api.telegram.org/bot${telegram_token}/getMe")"
if [[ "$(jq -r '.ok // false' <<<"$bot_info")" != "true" ]]; then
  echo "Telegram rejected the bot token." >&2
  exit 1
fi
bot_username="$(jq -r '.result.username // empty' <<<"$bot_info")"
if [[ -z "$bot_username" ]]; then
  echo "Telegram did not return a bot username." >&2
  exit 1
fi

printf "Open https://t.me/%s and send /start in a private chat.\n" "$bot_username"
printf "For a test group, add the bot and send /ask hello in that group.\n"
read -r -p "Press Enter after sending the test message(s): "

updates="$(curl --fail --silent --show-error --max-time 20 \
  --request POST \
  --data-urlencode 'timeout=0' \
  --data-urlencode 'limit=50' \
  "https://api.telegram.org/bot${telegram_token}/getUpdates")"
if [[ "$(jq -r '.ok // false' <<<"$updates")" != "true" ]]; then
  echo "Telegram could not return pending messages: $(jq -r '.description // "unknown error"' <<<"$updates")" >&2
  exit 1
fi

discovered_chats="$(jq -r '
  [
    .result[]?
    | (.message // .edited_message // empty)
    | {
        id: (.chat.id | tostring),
        type: (.chat.type // ""),
        name: (.chat.title // .chat.username // .from.username // .from.first_name // "")
      }
  ]
  | unique_by(.id)
  | .[]
  | "\(.id)\t\(.type)\t\(.name | gsub("[\\t\\r\\n]"; " "))"
' <<<"$updates")"
if [[ -z "$discovered_chats" ]]; then
  echo "No Telegram chat was found. Send /start to the bot, then rerun this script." >&2
  exit 1
fi

printf "Discovered Telegram chats:\nCHAT_ID\tTYPE\tNAME\n%s\n" "$discovered_chats"
read -r -p "Allowed Telegram chat IDs, comma separated (required): " allowed_chat_ids
allowed_chat_ids="$(tr -d '[:space:]' <<<"$allowed_chat_ids")"
if [[ -z "$allowed_chat_ids" ]]; then
  echo "At least one allowed Telegram chat ID is required." >&2
  exit 1
fi
if [[ ! "$allowed_chat_ids" =~ ^-?[0-9]+(,-?[0-9]+)*$ ]]; then
  echo "Chat IDs must be numeric and comma separated." >&2
  exit 1
fi

webhook_secret="$(openssl rand -hex 32)"

put_secret() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | node_modules/.bin/wrangler secret put "$name" \
    --config "$wrangler_config" >/dev/null
}

put_secret TELEGRAM_BOT_TOKEN "$telegram_token"
put_secret TELEGRAM_BOT_USERNAME "$bot_username"
put_secret TELEGRAM_WEBHOOK_SECRET "$webhook_secret"
put_secret TELEGRAM_ALLOWED_CHAT_IDS "$allowed_chat_ids"

telegram_api() {
  local method="$1"
  local body="$2"
  curl --fail --silent --show-error --max-time 20 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data "$body" \
    "https://api.telegram.org/bot${telegram_token}/${method}"
}

telegram_api setMyName '{"name":"Uway-Bob"}' >/dev/null
telegram_api setMyShortDescription \
  '{"short_description":"Uway AI assistant for product, compliance, KYC, KYB and AML questions."}' >/dev/null
telegram_api setMyDescription \
  '{"description":"Ask Uway-Bob about Uway solutions and Sumsub KYC, KYB, AML, WebSDK and API documentation."}' >/dev/null
telegram_api setMyCommands \
  '{"commands":[{"command":"ask","description":"Ask Uway-Bob a question"}]}' >/dev/null

webhook_body="$(jq -n \
  --arg url "$webhook_url" \
  --arg secret "$webhook_secret" \
  '{url:$url, secret_token:$secret, allowed_updates:["message","guest_message"]}')"
webhook_result="$(telegram_api setWebhook "$webhook_body")"
if [[ "$(jq -r '.ok // false' <<<"$webhook_result")" != "true" ]]; then
  echo "Telegram webhook registration failed." >&2
  exit 1
fi

unset telegram_token webhook_secret

health="$(curl --fail --silent --show-error --max-time 20 \
  https://chatbot-staging.hkuway.com/api/health)"
if [[ "$(jq -r '.channels.telegram.configured // false' <<<"$health")" != "true" ]]; then
  echo "Cloudflare health check does not report Telegram as configured." >&2
  exit 1
fi

printf "Telegram bot configured: @%s\n" "$bot_username"
printf "Open: https://t.me/%s\n" "$bot_username"
printf "Webhook: %s\n" "$webhook_url"

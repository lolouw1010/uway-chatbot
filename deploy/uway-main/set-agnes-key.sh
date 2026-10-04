#!/usr/bin/env bash
set -euo pipefail

environment_file="/etc/uway-chatbot.env"
temporary_file="$(mktemp)"
trap 'rm -f "$temporary_file"' EXIT

read -r -s -p "Agnes API key: " agnes_key
printf "\n"
if [[ -z "$agnes_key" ]]; then
  echo "No key entered; environment was not changed." >&2
  exit 1
fi

grep -v '^AGNES_API_KEY=' "$environment_file" > "$temporary_file"
printf 'AGNES_API_KEY=%s\n' "$agnes_key" >> "$temporary_file"
install -o root -g root -m 0600 "$temporary_file" "$environment_file"
unset agnes_key

systemctl restart uway-chatbot.service
sleep 2
curl --fail --silent http://127.0.0.1:3100/api/health
printf "\n"

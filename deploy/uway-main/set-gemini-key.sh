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

read -r -s -p "Vertex AI Express API key: " gemini_key
printf "\n"
if [[ -z "$gemini_key" ]]; then
  echo "No key entered; environment was not changed." >&2
  exit 1
fi

cp -p "$environment_file" "$backup_file"
grep -Ev '^(GEMINI_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|GEMINI_ENABLE_GOOGLE_SEARCH|MODEL_PROVIDER_ORDER)=' "$environment_file" > "$candidate_file" || true
printf 'GEMINI_API_KEY=%s\n' "$gemini_key" >> "$candidate_file"
printf 'GOOGLE_GENAI_USE_VERTEXAI=true\n' >> "$candidate_file"
printf 'GEMINI_ENABLE_GOOGLE_SEARCH=true\n' >> "$candidate_file"
printf 'MODEL_PROVIDER_ORDER=gemini,agnes\n' >> "$candidate_file"
install -o root -g root -m 0600 "$candidate_file" "$environment_file"
unset gemini_key

rollback() {
  install -o root -g root -m 0600 "$backup_file" "$environment_file"
  systemctl restart uway-chatbot.service
  echo "Gemini verification failed; the previous environment was restored." >&2
}

systemctl restart uway-chatbot.service
for _ in {1..15}; do
  if curl --fail --silent http://127.0.0.1:3100/api/health > /dev/null; then
    break
  fi
  sleep 1
done

http_status="$(curl --silent --show-error --max-time 45 \
  --output "$response_file" \
  --write-out '%{http_code}' \
  http://127.0.0.1:3100/api/chat \
  --header 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"What does AML Sentinel do?"}]}' \
  || true)"

provider="$(node -e '
  const fs = require("fs");
  try {
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(typeof data.provider === "string" ? data.provider : "");
  } catch {}
' "$response_file")"

if [[ "$http_status" != "200" || "$provider" != "gemini-vertex" ]]; then
  rollback
  exit 1
fi

echo "Gemini verification succeeded; Vertex AI is the active primary provider."
curl --fail --silent http://127.0.0.1:3100/api/health
printf "\n"

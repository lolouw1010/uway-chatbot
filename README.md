# UWAY Docs Assistant

A documentation-grounded chatbot for [hkuway.com](https://hkuway.com). It preserves the existing homepage hero and adds two low-impact entry points: an `Ask UWAY AI` header action and a bottom-right floating launcher. Both open the same in-page assistant with answers and links back to the relevant UWAY documentation.

## What is included

- Existing UWAY hero preserved as the primary homepage composition
- Header and bottom-right floating assistant entry points
- Desktop side panel and mobile bottom-sheet interaction
- Optional full-page `/chat` workspace
- Local retrieval over a versioned, multi-source compliance knowledge snapshot
- Gemini as the primary model provider
- Automatic fallback to Agnes AI's OpenAI-compatible API
- Environment-configurable provider order and model names
- English, Simplified Chinese, and Traditional Chinese compliance-term retrieval aliases
- Dedicated retrieval domains for Compliance Quality Analysis, AI Travel Rule Auto Configer, and AI AML Sentinel
- Selected HKMA, SFC, FATF, and Sumsub sources with source-domain provenance
- Evidence ordering that distinguishes official rules, current product documentation, vendor guidance, and implementation plans
- Development preview responses when no API keys are present

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Add at least one model key to `.env.local`:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash

AGNES_API_KEY=your_agnes_key
AGNES_MODEL=agnes-2.0-flash
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

MODEL_PROVIDER_ORDER=gemini,agnes
```

Secrets are read only by the server route and are never sent to the browser.

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
```

## Request flow

1. The user opens the in-page assistant from the header or floating launcher and submits a question; `/chat` remains available as a full-page alternative.
2. The server identifies the likely product/regulatory domain and retrieves the six most relevant local documentation chunks.
3. The model receives only those chunks and recent conversation messages.
4. Gemini is attempted first; failures fall through to Agnes AI.
5. The interface renders the answer, actual provider/model, and deduplicated source links.

The assistant prompt requires answers to stay within retrieved documentation, prefer official regulator material when sources differ, avoid presenting roadmaps as live capabilities, and never invent regulations, thresholds, product capabilities, or legal conclusions.

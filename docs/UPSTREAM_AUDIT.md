# chatbot.hkuway.com upstream audit

Audit date: 2026-08-05. This document records provenance only; no production credentials or databases were copied.

## Located sources

- Internal NAS bare repository:
  - State at audit: empty `main` branch with no commits.
- Production frontend recovered from the existing GCP host:
  - Runtime: Streamlit on port 8501 behind `chatbot.hkuway.com`.
  - `app.py` SHA-256: `caa16ab191d28fd9afa2ff2c6c60a4053ad935d52dc9660f84dee8e077bf5b7f`.
- Production backend recovered from the existing GCP host:
  - Runtime: FastAPI/Uvicorn on port 8001.
  - `main.py` SHA-256: `c78ab982d666ddbfcaf7e323cc3a74bd2a607d74f168dfe3d3aae42456539104`.
  - `provider_manager.py` SHA-256: `b369acd2ef2b957bc8153584fcf192d896e418fbd04aa5667ea8b04988aead7c`.
- Earlier monolith recovered from the existing GCP host:
  - `streamlit_app.py` SHA-256: `2147478729adf202bdfa7afc3902c703c59f012c6209ed3bd40e65dcf1d1eea4`.

## Product repositories inspected

- `louiezhelee-uway/hkuway-site-v3`: current hkuway.com Next.js brand site.
- `louiezhelee-uway/uway-AI-AML-Sentinal`: FastAPI/Sumsub/Gemini AML alert analysis product.
- `louiezhelee-uway/travel-rule-auto-config`: earlier FastAPI VASP registry and IVMS101 exchange tool.
- `lolouw1010/travel-rule-policy-engine`: newer Cloudflare Worker/D1/R2 regulatory knowledge and auto-configuration engine.

## Migration findings

- The production backend resolves its local knowledge directory one level above the actual directory, so the deployed path can load zero documents.
- The fallback prompt path includes only the first five files and the first 500 characters of each; it is not retrieval.
- Source names and confidence are fixed response defaults rather than evidence from the answer.
- The Streamlit client omits a unique session identifier while the server stores history under a shared `default` key.
- Only Gemini is enabled in the active provider list; fallback providers are commented out.
- A Google service-account JSON file was present in the production source directory. It was excluded from recovery and must not be committed. Move the credential to the deployment secret store and rotate it during production migration.

The new Next.js implementation replaces these behaviors with request-scoped conversation history, evidence retrieval, real source links, and Gemini-to-Agnes failover.

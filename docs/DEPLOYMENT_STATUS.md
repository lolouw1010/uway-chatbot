# Deployment status

Status date: 2026-08-05.

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

## Required before production cutover

- Add an Agnes API key to the root-owned deployment environment and run a real Agnes-only smoke test.
- Rotate the legacy Google service-account credential and move to an attached service account or workload identity.
- Decide whether the production cutover should initially keep the current Streamlit service available only for rollback or retire it after an observation period.
- Add a reliable official-PDF extraction path for FATF sources currently blocked by Cloudflare.
- Back up and validate the live nginx site file before changing its upstream from port 8501 to 3100.

The proposed nginx configuration and rollback sequence are in `deploy/` and have not been applied to the live site.

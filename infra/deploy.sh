#!/usr/bin/env bash
# Build backend/ from source with Cloud Build and deploy it to Cloud Run.
#
#   ./infra/deploy.sh                          # Firestore-backed (recommended)
#   STORE_BACKEND=memory ./infra/deploy.sh     # fallback: in-memory, pinned to 1 instance
#   CORS_ORIGINS=https://my-frontend.run.app ./infra/deploy.sh
#
# Run ./infra/gcp-setup.sh once beforehand.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-6d34f8a9-8150-4e6a-ae7}"
REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-skillcoach-api}"
SA_EMAIL="${SA_EMAIL:-skillcoach-api@${PROJECT_ID}.iam.gserviceaccount.com}"
STORE_BACKEND="${STORE_BACKEND:-firestore}"
# Keep the CORS origins deploy-web.sh set on the live service unless overridden.
if [[ -z "${CORS_ORIGINS:-}" ]]; then
  CORS_ORIGINS="$(gcloud run services describe "${SERVICE:-skillcoach-api}" --project="$PROJECT_ID" --region="$REGION" \
    --format='yaml(spec.template.spec.containers[0].env)' 2>/dev/null \
    | awk '/name: CORS_ORIGINS/ { getline; sub(/.*value: */, ""); gsub(/["\047]/, ""); print }' || true)"
  CORS_ORIGINS="${CORS_ORIGINS:-*}"
fi
MIN_INSTANCES="${MIN_INSTANCES:-1}"   # 1 keeps the demo warm (no cold start); 0 to save cost

if [[ "$STORE_BACKEND" == "memory" ]]; then
  MAX_INSTANCES=1   # in-memory state must live in exactly one instance
else
  MAX_INSTANCES="${MAX_INSTANCES:-3}"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT

# YAML env file avoids gcloud's comma-splitting (CORS_ORIGINS may hold several origins).
cat >"$ENV_FILE" <<EOF
GOOGLE_GENAI_USE_VERTEXAI: "true"
GOOGLE_CLOUD_PROJECT: "${PROJECT_ID}"
GOOGLE_CLOUD_LOCATION: "global"
GEMINI_FAST_MODEL: "${GEMINI_FAST_MODEL:-gemini-4-argon}"
GEMINI_PRO_MODEL: "${GEMINI_PRO_MODEL:-gemini-4-argon}"
GEMINI_LITE_MODEL: "${GEMINI_LITE_MODEL:-gemini-3.5-flash-lite}"
GEMINI_FAST_FALLBACKS: "${GEMINI_FAST_FALLBACKS:-gemini-3.8-flash}"
GEMINI_PRO_FALLBACKS: "${GEMINI_PRO_FALLBACKS:-gemini-3.1-pro-preview,gemini-2.5-pro}"
GEMINI_LITE_FALLBACKS: "${GEMINI_LITE_FALLBACKS:-gemini-3.8-flash}"
GEMINI_EMBED_MODEL: "gemini-embedding-001"
GEMINI_EMBED_LOCATION: "${GEMINI_EMBED_LOCATION:-$REGION}"
EMBED_DIMENSIONS: "768"
STORE_BACKEND: "${STORE_BACKEND}"
CORS_ORIGINS: "${CORS_ORIGINS}"
LLM_FAKE: "false"
SESSION_REPORT_THINKING: "${SESSION_REPORT_THINKING:-low}"
SESSION_REPORT_PARALLEL: "true"
SESSION_SPECULATIVE_REPORTS: "true"
EOF

echo "==> Deploying $SERVICE to $REGION (store=$STORE_BACKEND, instances=$MIN_INSTANCES..$MAX_INSTANCES)"
# --timeout 3600: SSE turn streams stay open for the whole response.
# --no-cpu-throttling: background work (startup seeding, embedding cache refresh)
#   keeps running between requests.
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source="$ROOT/backend" \
  --service-account="$SA_EMAIL" \
  --env-vars-file="$ENV_FILE" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=80 \
  --timeout=3600 \
  --min-instances="$MIN_INSTANCES" \
  --max-instances="$MAX_INSTANCES" \
  --cpu-boost \
  --no-cpu-throttling \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo "==> Deployed: $URL"
# /healthz is reserved by Cloud Run's front end; the app also serves /health.
echo "    Health: $(curl -fsS "$URL/health" || echo 'not ready yet')"
echo "    Frontend: NEXT_PUBLIC_API_URL=$URL"

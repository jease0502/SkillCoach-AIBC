#!/usr/bin/env bash
# Build frontend/ with Cloud Build (API URL baked in at build time), deploy it to
# Cloud Run, then allow the new web origin in the API's CORS settings.
#
#   ./infra/deploy-web.sh                        # API URL looked up from the skillcoach-api service
#   API_URL=https://... ./infra/deploy-web.sh
#
# Deploy the API first (./infra/deploy.sh).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-6d34f8a9-8150-4e6a-ae7}"
REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-skillcoach-web}"
API_SERVICE="${API_SERVICE:-skillcoach-api}"
REPO="${REPO:-cloud-run-source-deploy}"   # the Artifact Registry repo `run deploy --source` uses
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:${TAG}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

API_URL="${API_URL:-$(gcloud run services describe "$API_SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')}"
API_URL="${API_URL%/}"
[[ -n "$API_URL" ]] || { echo "Could not resolve the API URL; set API_URL=..." >&2; exit 1; }

gcloud artifacts repositories describe "$REPO" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --project="$PROJECT_ID" --location="$REGION" \
    --repository-format=docker --description="SkillCoach images"

BUILD_FILE="$(mktemp)"
trap 'rm -f "$BUILD_FILE"' EXIT
# `gcloud builds submit --tag` cannot pass build args, so use an inline config.
cat >"$BUILD_FILE" <<'EOF'
steps:
  - name: gcr.io/cloud-builders/docker
    args: ["build", "-t", "$_IMAGE", "--build-arg", "NEXT_PUBLIC_API_URL=$_API_URL", "--build-arg", "NEXT_PUBLIC_MOCK=false", "."]
images: ["$_IMAGE"]
options:
  machineType: E2_HIGHCPU_8
EOF

echo "==> Building $IMAGE (NEXT_PUBLIC_API_URL=$API_URL)"
gcloud builds submit "$ROOT/frontend" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --config="$BUILD_FILE" \
  --substitutions="_IMAGE=${IMAGE},_API_URL=${API_URL}"

echo "==> Deploying $SERVICE"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances="${MIN_INSTANCES:-1}" \
  --max-instances="${MAX_INSTANCES:-3}" \
  --cpu-boost \
  --quiet

WEB_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"

echo "==> Allowing $WEB_URL in $API_SERVICE CORS_ORIGINS"
# A Cloud Run service answers on two URLs (hash form and project-number form);
# allow both. --env-vars-file would replace every variable, so use
# --update-env-vars, which touches only CORS_ORIGINS; the ^|^ prefix switches the
# list delimiter so the commas inside the value survive.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
ALT_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
ORIGINS="$WEB_URL"
[[ "$ALT_URL" != "$WEB_URL" ]] && ORIGINS="${ORIGINS},${ALT_URL}"
[[ -n "${EXTRA_ORIGINS:-}" ]] && ORIGINS="${ORIGINS},${EXTRA_ORIGINS}"

gcloud run services update "$API_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="^|^CORS_ORIGINS=${ORIGINS}" \
  --quiet

echo "==> Done"
echo "    Web: $WEB_URL"
echo "    API: $API_URL (CORS_ORIGINS=$ORIGINS)"
echo "    Check: curl -sI -H 'Origin: $WEB_URL' $API_URL/health | grep -i access-control-allow-origin"

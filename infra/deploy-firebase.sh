#!/usr/bin/env bash
# Put Firebase Hosting in front of the skillcoach-web Cloud Run service, so the
# public URL is https://<SITE_ID>.web.app, then allow that origin in the API's CORS.
#
#   PROJECT_ID=... SITE_ID=skillcoach-aibc ./infra/deploy-firebase.sh
#
# The project must already be a Firebase project. Deploy the API and web first
# (./infra/deploy.sh, ./infra/deploy-web.sh). Uses the Firebase Hosting REST API
# with the gcloud login, so no Node.js / firebase-tools is needed. firebase.json
# at the repo root holds the same config for `firebase deploy --only hosting`.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
REGION="${REGION:-asia-east1}"
SITE_ID="${SITE_ID:-skillcoach-aibc}"
WEB_SERVICE="${WEB_SERVICE:-skillcoach-web}"
API_SERVICE="${API_SERVICE:-skillcoach-api}"
API="https://firebasehosting.googleapis.com/v1beta1"

export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
gcloud services enable firebasehosting.googleapis.com --quiet

TOKEN="$(gcloud auth print-access-token)"
call() {  # call METHOD URL [JSON]
  curl -fsS -X "$1" "$2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-goog-user-project: $PROJECT_ID" \
    -H "Content-Type: application/json" \
    ${3:+-d "$3"}
}

echo "==> Hosting site $SITE_ID"
if call GET "$API/projects/$PROJECT_ID/sites/$SITE_ID" >/dev/null 2>&1; then
  echo "    already exists"
else
  call POST "$API/projects/$PROJECT_ID/sites?siteId=$SITE_ID" '{}' >/dev/null
  echo "    created"
fi

echo "==> New version: rewrite every path to Cloud Run $WEB_SERVICE ($REGION)"
VERSION="$(call POST "$API/sites/$SITE_ID/versions" \
  "{\"config\":{\"rewrites\":[{\"glob\":\"**\",\"run\":{\"serviceId\":\"$WEB_SERVICE\",\"region\":\"$REGION\"}}]}}" \
  | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"
[[ -n "$VERSION" ]] || { echo "Could not create a hosting version" >&2; exit 1; }
call PATCH "$API/$VERSION?update_mask=status" '{"status":"FINALIZED"}' >/dev/null
call POST "$API/sites/$SITE_ID/releases?versionName=$VERSION" '{}' >/dev/null
echo "    released $VERSION"

HOSTING_URLS="https://${SITE_ID}.web.app,https://${SITE_ID}.firebaseapp.com"
echo "==> Adding $HOSTING_URLS to $API_SERVICE CORS_ORIGINS"
CURRENT="$(gcloud run services describe "$API_SERVICE" --region="$REGION" \
  --format='yaml(spec.template.spec.containers[0].env)' \
  | awk '/name: CORS_ORIGINS/ { getline; sub(/.*value: */, ""); gsub(/["\047]/, ""); print }')"
ORIGINS="$CURRENT"
for u in ${HOSTING_URLS//,/ }; do
  [[ ",$ORIGINS," == *",$u,"* ]] || ORIGINS="${ORIGINS:+$ORIGINS,}$u"
done
if [[ "$ORIGINS" != "$CURRENT" ]]; then
  gcloud run services update "$API_SERVICE" --region="$REGION" \
    --update-env-vars="^|^CORS_ORIGINS=${ORIGINS}" --quiet
fi

echo "==> Done: https://${SITE_ID}.web.app"

#!/usr/bin/env bash
# One-time Google Cloud setup for the SkillCoach API on Cloud Run.
# Safe to re-run: every step tolerates "already exists".
#
#   PROJECT_ID=... REGION=asia-east1 ./infra/gcp-setup.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-6d34f8a9-8150-4e6a-ae7}"
REGION="${REGION:-asia-east1}"
SA_NAME="${SA_NAME:-skillcoach-api}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-$REGION}"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com

echo "==> Runtime service account: $SA_EMAIL"
gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="SkillCoach API (Cloud Run)"

for role in roles/aiplatform.user roles/datastore.user roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$role" --condition=None --quiet >/dev/null
  echo "    granted $role"
done

# `gcloud run deploy --source` builds with the default compute service account in
# newer projects; it needs the Cloud Build builder role to push the image.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder" --condition=None --quiet >/dev/null
echo "    granted roles/cloudbuild.builds.builder to the default compute SA (source builds)"

echo "==> Firestore (Native mode) in $FIRESTORE_LOCATION"
if gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  echo "    (default) database already exists"
else
  gcloud firestore databases create --database="(default)" \
    --location="$FIRESTORE_LOCATION" --type=firestore-native
fi

echo "==> Firestore index exemptions"
# Embedding vectors are stored as plain 768-float arrays and searched in process
# memory (app/kb/search.py), so they must NOT be auto-indexed: indexing every
# array element would cost 768 index entries per chunk. Long text fields are
# never filtered on either.
gcloud firestore indexes fields update vector --collection-group=embeddings --disable-indexes --quiet
gcloud firestore indexes fields update text --collection-group=chunks --disable-indexes --quiet
gcloud firestore indexes fields update turns --collection-group=sessions --disable-indexes --quiet
# All app queries are single-field equality filters (e.g. chunks.document_id),
# which Firestore's automatic single-field indexes already cover: no composite
# indexes are needed.

# Optional, only if search moves to Firestore's native KNN (find_nearest) instead of
# the in-memory cosine search. That also requires writing vectors as
# firestore.Vector values rather than plain arrays:
#
# gcloud firestore indexes composite create \
#   --collection-group=embeddings --query-scope=COLLECTION \
#   --field-config=field-path=vector,vector-config='{"dimension":"768","flat":"{}"}'

echo "==> Done. Next: ./infra/deploy.sh"

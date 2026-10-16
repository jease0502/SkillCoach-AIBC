# Deployment

How to deploy SkillCoach to Google Cloud: `skillcoach-api` (from `backend/`)
and `skillcoach-web` (from `frontend/`) on Cloud Run, Gemini on Vertex AI,
data in Firestore, the optional fallback key in Secret Manager. See
[architecture](architecture.md) and [ADR-0001](adr/0001-gemini-on-cloud-run.md)
for the reasoning, and [API_CONTRACT.md](API_CONTRACT.md) for the
authoritative env var names.

All commands are bash. On Windows use Cloud Shell or Git Bash.

Locations at a glance (verified against the project on 2026-10-15):

| What | Location | Why |
|---|---|---|
| Cloud Run (`skillcoach-api`, `skillcoach-web`), Firestore, Artifact Registry | `asia-east1` (`$REGION`, the gcloud default) | Data at rest in the chosen APAC region |
| Gemini generation (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`) | `global` (`GOOGLE_CLOUD_LOCATION`) | These models return 200 only on `global` (404 on `us-central1`) |
| Embeddings (`gemini-embedding-001`) | `asia-east1` (`GEMINI_EMBED_LOCATION`) | Regional model; about 170 ms from Cloud Run vs about 1.1 s on `us-central1` |

`gemini-2.5-flash` and `gemini-2.5-pro` work on both `global` and
`us-central1`; they are fallbacks only. Data residency wording for the deck
and README: data is stored at rest in the chosen APAC region, embeddings are
served there too, and Gemini generation runs through the Vertex AI global endpoint. Do not claim that data never
leaves Taiwan.

---

## 1. Prerequisites

- A Google Cloud project with billing enabled (hackathon credits applied).
- `gcloud` CLI, up to date (`gcloud components update`), logged in:
  `gcloud auth login && gcloud auth application-default login`
- Python 3.12 and Node 20+ for local development (the web image uses Node 22). Docker is optional:
  `gcloud run deploy --source` builds remotely with Cloud Build using the
  Dockerfile in each directory.

Set shell variables once:

```bash
export PROJECT_ID=project-6d34f8a9-8150-4e6a-ae7   # dev project; use your own
export REGION=asia-east1                           # Cloud Run + Firestore + Artifact Registry
export API_SA=skillcoach-api@${PROJECT_ID}.iam.gserviceaccount.com
export WEB_SA=skillcoach-web@${PROJECT_ID}.iam.gserviceaccount.com

gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION
```

---

## 2. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  logging.googleapis.com \
  cloudtrace.googleapis.com
```

Add `generativelanguage.googleapis.com` only if you use the Developer API
fallback, and `firebase.googleapis.com` only if you use Firebase Hosting/Auth.

Quick model check before writing code (from your machine, with ADC):

```bash
python - <<EOF
from google import genai
gen = genai.Client(vertexai=True, project="$PROJECT_ID", location="global")
for m in ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash-lite", "gemini-2.5-pro"]:
    try:
        print(m, "->", gen.models.generate_content(model=m, contents="Say OK").text.strip())
    except Exception as e:
        print(m, "FAILED", e)
emb = genai.Client(vertexai=True, project="$PROJECT_ID", location="asia-east1")
print("embed dims:", len(emb.models.embed_content(model="gemini-embedding-001", contents="hi",
      config={"output_dimensionality": 768}).embeddings[0].values))
EOF
```

Gemini 3.x models return 404 on `us-central1`; always test them on
`global`. If `gemini-3.1-pro-preview` fails, set
`GEMINI_PRO_MODEL=gemini-2.5-pro`.

---

## 3. Firestore and the vector index

```bash
# Firestore Native mode, default database, in asia-east1
gcloud firestore databases create --location=$REGION --type=firestore-native

# Vector index on chunks.embedding (dimension must match the embed() wrapper: 768)
gcloud firestore indexes composite create \
  --collection-group=chunks \
  --query-scope=COLLECTION \
  --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}' \
  --database="(default)"

# Watch until state is READY (can take several minutes)
gcloud firestore indexes composite list
```

Until the index is `READY`, deploy with `STORE_BACKEND=memory` (data is then
per-instance and lost on restart; fine for a smoke test, not for the demo).

---

## 4. Service accounts and IAM

```bash
gcloud iam service-accounts create skillcoach-api --display-name="SkillCoach API"
gcloud iam service-accounts create skillcoach-web --display-name="SkillCoach Web"

for ROLE in roles/aiplatform.user roles/datastore.user \
            roles/logging.logWriter roles/cloudtrace.agent; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$API_SA" --role="$ROLE" --condition=None
done
```

| Principal | Role | Scope | Why |
|---|---|---|---|
| `skillcoach-api` | `roles/aiplatform.user` | project | Call Gemini on Vertex AI |
| `skillcoach-api` | `roles/datastore.user` | project | Read/write Firestore |
| `skillcoach-api` | `roles/secretmanager.secretAccessor` | `gemini-api-key` secret only | Fallback key (optional) |
| `skillcoach-api` | `roles/logging.logWriter`, `roles/cloudtrace.agent` | project | Logs and traces |
| `skillcoach-web` | none | | Serves pages only |

The person deploying needs `roles/run.admin`, `roles/iam.serviceAccountUser`
and `roles/cloudbuild.builds.editor` (project Owner/Editor covers this).

---

## 5. Secret Manager (fallback only)

With Vertex AI there is no model key. The only secret is the optional
Gemini Developer API key, used if Vertex quota or model access fails on demo day:

```bash
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:$API_SA" --role=roles/secretmanager.secretAccessor
```

To switch to it (no code change):

```bash
gcloud run services update skillcoach-api \
  --update-env-vars=GOOGLE_GENAI_USE_VERTEXAI=false \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

Never commit `.env` files with keys, never put keys in Dockerfiles, and never
put secrets in `NEXT_PUBLIC_*` variables (they are compiled into the browser bundle).

---

## 6. Dockerfiles

### 6.1 Backend (`backend/Dockerfile`)

The file in the repo, in short: `python:3.12-slim`, `WORKDIR /srv`,
`pip install -r requirements.txt`, copy `app/`, run as a non-root user
(`app`, uid 1000), `EXPOSE 8080`, and

```dockerfile
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
```

`PORT` defaults to 8080 in the image; Cloud Run overrides it.

`backend/requirements.txt`: `fastapi`, `uvicorn[standard]`, `pydantic`,
`pydantic-settings`, `python-multipart`, `google-genai`,
`google-cloud-firestore`, `pypdf`, `sse-starlette`, plus the test tools
`pytest`, `pytest-asyncio` and `httpx` (installed in the image too).
OpenTelemetry packages are not included; add them only if tracing (section
11 of the architecture) is built.

`backend/.dockerignore`: `.env`, `.venv`, `**/__pycache__`, `.pytest_cache`, `tests`.

### 6.2 Frontend (`frontend/Dockerfile`, Next.js 15 standalone)

`frontend/next.config.mjs` sets `output: 'standalone'`. The Dockerfile in
the repo is a three-stage build (`deps`, `builder`, `runner`) on
`node:22-alpine`. `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_MOCK` are declared
as build arguments (`ARG`) and exported as `ENV` before `npm run build`, so
they are inlined into the client bundle at build time. Because the `ENV`
value takes precedence over `.env.production`, pass the API URL as a build
argument (section 7.2). The runner listens on `PORT=8080` as a non-root user.

`frontend/.dockerignore` excludes `node_modules`, `.next`, `.env` and
`.env.local`.

---

## 7. Deploy to Cloud Run

Order matters: the API URL must exist before the frontend is built.

### 7.1 API

```bash
gcloud run deploy skillcoach-api \
  --source backend \
  --region $REGION \
  --service-account $API_SA \
  --allow-unauthenticated \
  --cpu 1 --memory 1Gi \
  --concurrency 40 \
  --timeout 300 \
  --min-instances 0 --max-instances 3 \
  --cpu-boost \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GEMINI_EMBED_LOCATION=asia-east1,GEMINI_FAST_MODEL=gemini-3.8-flash,GEMINI_LITE_MODEL=gemini-3.5-flash-lite,GEMINI_PRO_MODEL=gemini-3.1-pro-preview,GEMINI_EMBED_MODEL=gemini-embedding-001,STORE_BACKEND=firestore,CORS_ORIGINS=*"

export API_URL=$(gcloud run services describe skillcoach-api --region $REGION --format='value(status.url)')
curl -s $API_URL/healthz        # {"ok": true}
```

`--max-instances 3` is deliberately low: with `STORE_BACKEND=memory` you
would want exactly 1, and with Firestore a small cap limits runaway cost.
`--allow-unauthenticated` is required because the browser calls the API
directly; the demo is single-tenant (see architecture, Security).

### 7.2 Web

`NEXT_PUBLIC_API_URL` must be passed as a Docker build argument (see 6.2),
so build the image with Cloud Build and deploy the image:

```bash
export WEB_IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/skillcoach-web:latest

cat > /tmp/cloudbuild-web.yaml <<EOF
steps:
- name: gcr.io/cloud-builders/docker
  args: ["build", "--build-arg", "NEXT_PUBLIC_API_URL=$API_URL", "-t", "$WEB_IMAGE", "."]
images: ["$WEB_IMAGE"]
EOF
gcloud builds submit frontend --config /tmp/cloudbuild-web.yaml

gcloud run deploy skillcoach-web \
  --image $WEB_IMAGE \
  --region $REGION \
  --service-account $WEB_SA \
  --allow-unauthenticated \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 3

export WEB_URL=$(gcloud run services describe skillcoach-web --region $REGION --format='value(status.url)')
```

The `cloud-run-source-deploy` repository in `$REGION` is created by the
first `--source` deploy of the API (7.1); create it with
`gcloud artifacts repositories create` if you deploy the web service first.
Rebuild the image whenever the API URL changes. Firebase Hosting is an
equivalent alternative only if the frontend becomes a pure static export.

### 7.3 Lock down CORS

```bash
gcloud run services update skillcoach-api --region $REGION \
  --update-env-vars "CORS_ORIGINS=$WEB_URL"
```

(Use `^@^` delimiter syntax if you need several comma-separated origins:
`--update-env-vars "^@^CORS_ORIGINS=$WEB_URL,http://localhost:3000"`.)

### 7.4 Seed demo data

```bash
curl -s -X POST $API_URL/api/kb/documents -F file=@backend/app/seed/data/docs/acme-analytics-product-sheet.md
# or run the seed module locally against the same Firestore with ADC
# (documents, personas and scenarios; add --force to re-ingest):
cd backend && GOOGLE_CLOUD_PROJECT=$PROJECT_ID GOOGLE_CLOUD_LOCATION=global \
  GEMINI_EMBED_LOCATION=asia-east1 STORE_BACKEND=firestore python -m app.seed
```

### 7.5 Demo-day settings

```bash
# Before recording / judging: no cold starts
gcloud run services update skillcoach-api --region $REGION --min-instances 1
gcloud run services update skillcoach-web --region $REGION --min-instances 1
# After judging ends
gcloud run services update skillcoach-api --region $REGION --min-instances 0
gcloud run services update skillcoach-web --region $REGION --min-instances 0
```

If the Gemini Live stretch ships, the API additionally needs
`--timeout 3600 --session-affinity`, and must not use `--use-http2`.

---

## 8. Environment variables

Names come from [API_CONTRACT.md](API_CONTRACT.md). "Deploy value" is what
we set on Cloud Run; it may differ from the code default.

| Variable | Service | Code default | Deploy value | Notes |
|---|---|---|---|---|
| `PORT` | both | `8080` | set by Cloud Run | Never set manually |
| `GOOGLE_GENAI_USE_VERTEXAI` | api | `true` | `true` | `false` + `GEMINI_API_KEY` = Developer API |
| `GOOGLE_CLOUD_PROJECT` | api | - | project ID | Required for Vertex |
| `GOOGLE_CLOUD_LOCATION` | api | `global` | `global` | Gemini 3.x models are served only from `global` |
| `GEMINI_EMBED_LOCATION` | api | `asia-east1` | `asia-east1` | Embeddings endpoint, next to Cloud Run |
| `GEMINI_API_KEY` | api | - | unset (secret if fallback) | From Secret Manager only |
| `GEMINI_FAST_MODEL` | api | `gemini-3.8-flash` | `gemini-3.8-flash` | Customer persona and persona/scenario builder. See note below |
| `GEMINI_LITE_MODEL` | api | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | Per-turn judgments: precheck, grounding, state, coach |
| `GEMINI_PRO_MODEL` | api | `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | Final report; fallback `gemini-2.5-pro` |
| `GEMINI_EMBED_MODEL` | api | `gemini-embedding-001` | `gemini-embedding-001` | 768 dims; changing it requires re-ingest |
| `EMBED_DIMENSIONS` | api | `768` | `768` | Embedding output size; must match the Firestore vector index (section 3) |
| `STORE_BACKEND` | api | `memory` | `firestore` | `memory` loses data on restart |
| `FIRESTORE_DATABASE` | api | `(default)` | `(default)` | Firestore database id |
| `LLM_FAKE` | api | `false` | `false` (never `true` in production) | Dev/tests: canned LLM output and hash embeddings, no Google Cloud calls |
| `CORS_ORIGINS` | api | `*` | web URL | |
| `NEXT_PUBLIC_API_URL` | web (build time) | `http://localhost:8080` | API URL | Docker build argument (section 7.2) |
| `NEXT_PUBLIC_MOCK` | web (build time) | `false` | `false` | `true` = local fixtures and a simulated SSE stream; Docker build argument |
| `GOOGLE_APPLICATION_CREDENTIALS` | api (local only) | - | unset | Windows local dev only; Cloud Run uses its service account. Never copy the file into the repo |

Note on models: code defaults and deploy values are the same 3.x IDs,
verified on 2026-10-15 to return 200 on `global` in this project.
`gemini-2.5-pro` (and `gemini-2.5-flash`) also work, on both `global` and
`us-central1`, and are kept as fallbacks only. Run the model check in
section 2 before each deploy day.

Local development: create `backend/.env` with the variables above (see the
README Quick Start), keep `STORE_BACKEND=memory`, and authenticate with
`gcloud auth application-default login` (or use `GEMINI_API_KEY` with
`GOOGLE_GENAI_USE_VERTEXAI=false`).

---

## 9. Custom domain (optional, skip unless DNS is ready)

```bash
gcloud beta run domain-mappings create --service skillcoach-web --domain app.example.com --region $REGION
gcloud beta run domain-mappings describe --domain app.example.com --region $REGION  # DNS records to add
```

Certificates can take up to an hour. Add the new origin to `CORS_ORIGINS`.
Domain mappings are not available in every region; a global external HTTPS
load balancer is the alternative and is out of scope for the hackathon.

---

## 10. Cost notes

- **Cloud Run:** scales to zero; `--min-instances 1` on both services costs a
  few dollars per day, so use it only around recording and judging.
- **Gemini:** a turn is about 4 Flash calls plus 1 embedding call; a 12-turn
  session plus the report is roughly 50-60 calls, typically cents per
  session. The report uses the Pro model and dominates the cost; persona and
  scenario generation use Flash (benchmarked 2-3x faster than Pro at similar quality); avoid regenerating them in loops. Check the Vertex AI
  pricing page for current rates.
- **Embeddings:** one-time per document; the demo corpus costs cents.
- **Firestore:** the free tier covers the demo. Vector queries bill reads
  per returned result.
- **Cloud Build / Artifact Registry:** every `--source` deploy stores an
  image in `cloud-run-source-deploy`; delete old images after the event.
- Create a **budget alert** (Billing > Budgets & alerts), for example at US$20.

---

## 11. Teardown (after judging ends)

```bash
gcloud run services delete skillcoach-api --region $REGION --quiet
gcloud run services delete skillcoach-web --region $REGION --quiet
gcloud secrets delete gemini-api-key --quiet
gcloud artifacts repositories delete cloud-run-source-deploy --location $REGION --quiet
gcloud iam service-accounts delete $API_SA --quiet
gcloud iam service-accounts delete $WEB_SA --quiet
gcloud firestore databases delete --database="(default)"
# or everything at once:
# gcloud projects delete $PROJECT_ID
```

Keep everything running until judging is over; the submission links must stay live.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `404 NOT_FOUND` / `403` for a model | Gemini 3.x called on a regional endpoint, or model not enabled for the project | Set `GOOGLE_CLOUD_LOCATION=global` (embeddings stay on `GEMINI_EMBED_LOCATION=asia-east1`); check the ID; fall back to `gemini-2.5-pro` or the Developer API key |
| SSE arrives in one batch | Buffering | `X-Accel-Buffering: no`, flush an initial comment, no gzip on the stream route |
| `FAILED_PRECONDITION` on `find_nearest` | Vector index missing or building | `gcloud firestore indexes composite list`; use `STORE_BACKEND=memory` meanwhile |
| Vector dimension error | Embedding size differs from index (768) | Check `output_dimensionality` in `embed()`; re-ingest |
| Browser CORS error | `CORS_ORIGINS` missing the web URL | Update env var (section 7.3) |
| Frontend calls `localhost:8080` in production | `NEXT_PUBLIC_API_URL` build argument not passed | Rebuild with `--build-arg NEXT_PUBLIC_API_URL=$API_URL` (section 7.2) and redeploy |
| Container fails health check | Not listening on `$PORT` / `0.0.0.0` | Check CMD; `gcloud run services logs read skillcoach-api --region $REGION` |
| Data disappears between requests | `STORE_BACKEND=memory` with several instances | Use `firestore`, or `--max-instances 1` |
| First request slow | Cold start | `--min-instances 1`, `--cpu-boost` |

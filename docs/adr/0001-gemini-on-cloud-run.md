# ADR-0001: Gemini via google-genai on Vertex AI, served from Cloud Run, with Firestore

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** SkillCoach hackathon team

## Context

SkillCoach is being rebuilt from scratch for the Google Cloud AI Builder Cup
2026 (theme: Future of Work & Enterprise Productivity). The constraints are:

- **Mandatory:** use Gemini or Gemma models, and deploy on Cloud Run or Firebase.
- **Eligibility:** only code written during the hackathon counts. The earlier
  SkillCoach codebase (self-hosted LLMs, Qdrant, Redis, systemd, avatar
  runtime) is a design reference only.
- **Time:** about three days from start to submission (2026-10-15 to 2026-10-18).
- **Judging:** Technical Merit & GenAI is 40 percent, so Gemini must do real,
  visible work: multi-agent reasoning, structured output, grounding, streaming,
  and ideally voice.
- **Team:** small; nobody has time to operate infrastructure.

The old design had seven agents, a hybrid retriever with a reranker, a
dedicated vector database, a worker queue and a three-tier client inference
chain. That is weeks of work and most of it is plumbing that judges cannot see.

Model availability also matters. On 2026-10-15 we tested the project
(`project-6d34f8a9-8150-4e6a-ae7`) on Vertex AI: `gemini-3.8-flash`,
`gemini-3.5-flash-lite` and `gemini-3.1-pro-preview` (and later
`gemini-4-argon`) return 200 only on
`location=global` (404 on `us-central1`); `gemini-2.5-flash` and
`gemini-2.5-pro` work on both; `gemini-embedding-001` is regional and
works in `asia-east1` (about 170 ms from Cloud Run vs about 1.1 s on
`us-central1`). The official model page recommends the 3.x models for new
work, so 2.5 is kept as a fallback only.

## Decision

1. **Models: Gemini, called through the `google-genai` Python SDK with the
   Vertex AI backend** (`GOOGLE_GENAI_USE_VERTEXAI=true`,
   `GOOGLE_CLOUD_LOCATION=global` for generation,
   `GEMINI_EMBED_LOCATION=asia-east1` for embeddings).
   - Seven Gemini agent roles: builder, precheck judge, persona, grounding,
     state, coach, report.
   - `GEMINI_FAST_MODEL=gemini-4-argon` (thinking `low`) for the streamed
     customer persona and the persona/scenario builder. On 3.x, a benchmark
     on the seed KB showed Flash matching `gemini-3.1-pro-preview` at 2-3x
     the speed, so the builder had moved off Pro; Gemini 4 Argon now covers
     both needs (builder timing PENDING re-measure on Argon).
   - `GEMINI_LITE_MODEL=gemini-3.5-flash-lite` (thinking `low`) for the
     per-turn judgments: compliance pre-check, grounding post-check, state,
     coach (structured output, about 1 s).
   - `GEMINI_PRO_MODEL=gemini-4-argon` for the final report.
   - Each tier has a fallback chain (`GEMINI_*_FALLBACKS`): fast `gemini-4-argon` → `gemini-3.8-flash`;
     pro `gemini-4-argon` → `gemini-3.1-pro-preview` → `gemini-2.5-pro`;
     lite `gemini-3.5-flash-lite` → `gemini-3.8-flash`.
     On 404/429/5xx, a timeout or invalid JSON the call moves to the next model, and the failed model cools down for 60 s.
   - `GEMINI_EMBED_MODEL=gemini-embedding-001` at 768 dimensions for RAG.
   - `gemini-3.8-live` only if the Gemini Live voice stretch goal is built.
   - Every model ID and location is an environment variable (names and
     defaults fixed in [API_CONTRACT.md](../API_CONTRACT.md)); the code
     defaults match the deploy values above.
   - The same SDK can switch to the Gemini Developer API (API key in Secret
     Manager) as an emergency fallback with no code change.
2. **API on Cloud Run in `asia-east1`:** one FastAPI service (`backend/`,
   service `skillcoach-api`), deployed with `gcloud run deploy --source backend`,
   authenticating to Vertex AI and Firestore with its own service account.
   Per-turn results stream to the browser as Server-Sent Events on
   `POST /api/sessions/{id}/turns`.
3. **Web on Cloud Run in `asia-east1`:** Next.js 15 standalone
   (`frontend/`, service `skillcoach-web`), built with Cloud Build so that
   `NEXT_PUBLIC_API_URL` can be passed as a build argument, then deployed
   with `gcloud run deploy --image` (see [deployment](../deployment.md)).
4. **Data in Firestore (Native mode, `asia-east1`)** behind a small store interface
   (`STORE_BACKEND=memory|firestore`): application data and RAG chunks,
   using Firestore's built-in vector search (flat index, cosine). The
   in-memory backend implements the same interface for local dev, tests
   and as a fallback.
5. **Voice:** browser Web Speech API for the MVP (transcripts go through the
   same text pipeline); Gemini Live API is a stretch goal.
6. **Secrets in Secret Manager**, mounted with `--set-secrets`. No model key
   reaches the browser.
7. **Data residency statement:** data at rest stays in the chosen APAC
   region (`asia-east1`); Gemini generation runs through the Vertex AI
   global endpoint, and embeddings are served in `asia-east1`. We do not claim that data
   never leaves Taiwan.

## Alternatives considered

| Option | Why not |
|---|---|
| Gemini Developer API (AI Studio key) as primary | Works, and is faster to start, but needs a key secret everywhere and fits enterprise IAM less well. Kept as fallback. |
| Gemma self-hosted on Cloud Run GPU | Satisfies the "Gemma" rule, but GPU quota, cold starts and image size are a risk on a 3-day clock, and quality for nuanced role-play is lower. Could be a later "on-prem" story. |
| Gemini 2.5 Flash / Pro as defaults | They work in our project (on both `global` and `us-central1`, verified 2026-10-15), but the 3.x models are the recommended line for new work. `gemini-2.5-pro` is kept as the last `GEMINI_PRO_MODEL` fallback. |
| Regional endpoint (`us-central1` or `asia-east1`) for generation | Gemini 3.x models return 404 on `us-central1`; they are only served from `global`. Regional processing would force us back to 2.5. |
| Firebase Genkit / Agent Development Kit (ADK) | Good frameworks, but our pipeline is seven fixed agent roles. Plain async Python is easier to debug in three days and makes the agent flow explicit in code. Revisit post-hackathon. |
| Vertex AI Vector Search / AlloyDB pgvector | More scalable, but each adds provisioning time and cost. Firestore vectors are enough for thousands of chunks and we already need Firestore for app data. |
| Vertex AI RAG Engine | Managed and quick, but hides the retrieval step we want to show and control (thresholds, chunk IDs for citations). |
| Cloud Functions / Firebase Functions for the API | Streaming and long requests are more natural on Cloud Run; one container is simpler than many functions. |
| GKE | Operational overhead with no benefit at this scale. |
| WebSockets for text turns | Need session affinity and long timeouts. SSE per turn is stateless and fits Cloud Run's request model. WebSockets are reserved for the optional Live voice proxy. |

## Consequences

Positive:

- One language for the backend (Python), one SDK for every model call, one
  database. A small team can build and deploy in three days.
- Managed scale-to-zero services keep cost near zero outside demos.
- Service-account auth means no long-lived model keys exist in the system.
- Gemini usage is substantive and easy to point at: streaming persona,
  structured-output agents, embeddings-based grounding, verifiable evidence
  and citations in the report, a compliance gate, optional native-audio voice.

Negative / risks:

- **Model IDs may change** (preview IDs, regional availability). Mitigation:
  env vars, a startup self-test that pings each configured model, the
  `gemini-2.5-pro` fallback, and the Developer API fallback.
- **Inference is not region-pinned.** The `global` endpoint means we cannot
  promise in-country processing. Mitigation: state it plainly in the deck
  and business case; data at rest stays in `asia-east1`.
- **Firestore vector search is flat (exact) only**, limited to 2048
  dimensions, and not supported by the emulator. Mitigation: 768-dim
  vectors, small corpus, in-memory retriever for local and tests.
- **Cold starts** on Cloud Run add 2-5 s to the first request. Mitigation:
  `--min-instances=1` on the API during judging, then reset to 0.
- **Vendor coupling** to Google Cloud is intentional for this competition;
  the agent layer only depends on the thin `app/llm/gemini.py` wrapper, so swapping
  providers later is contained.
- **No queue:** large uploads are processed in-request. Acceptable for a
  demo corpus; a Cloud Tasks queue is the obvious next step.
- **`STORE_BACKEND=memory` is per-instance.** If the deployed API ever runs
  with the memory backend it must be capped at one instance; the demo uses
  Firestore.

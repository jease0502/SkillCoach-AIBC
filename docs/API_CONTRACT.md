# API Contract (source of truth for backend <-> frontend)

Owner: lead. Change requests go through the lead so every workstream stays in sync.
Pydantic models live in `backend/app/schemas.py` (mirrors this file). The frontend mirrors them in `frontend/src/lib/types.ts`.

## Repo layout

```
backend/            FastAPI on Cloud Run (Python 3.12)
  app/main.py       app factory, CORS, router mounting        (owner: core)
  app/config.py     env settings                               (owner: core)
  app/schemas.py    shared models                              (owner: lead)
  app/llm/          Gemini client wrapper                      (owner: core)
  app/store/        repository: memory + Firestore backends    (owner: core)
  app/kb/           knowledge base: ingest, chunk, embed, search (owner: core)
  app/builder/      persona + scenario generation & CRUD       (owner: builder)
  app/session/      practice engine: agents, orchestrator, SSE (owner: session)
  app/seed/         demo seed data (docs, personas, scenarios) (owner: builder)
  Dockerfile
frontend/           Next.js 15 App Router + TypeScript + Tailwind (owner: web)
```

## Environment

| Var | Default | Notes |
|---|---|---|
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` | Vertex AI via ADC on Cloud Run; set `false` + `GEMINI_API_KEY` for AI Studio key |
| `GOOGLE_CLOUD_PROJECT` | - | required for Vertex (deployed: `nestor-dev-tw`) |
| `GOOGLE_CLOUD_LOCATION` | `global` | Gemini 3.x models are only served from `global` (verified 2026-10-15) |
| `GEMINI_EMBED_LOCATION` | `asia-east1` | embeddings endpoint, next to Cloud Run (about 170 ms vs 1.1 s on `us-central1`) |
| `GEMINI_API_KEY` | - | only when not using Vertex |
| `GEMINI_FAST_MODEL` | `gemini-4-argon` | customer persona, persona/scenario builder (`global` only); fallbacks in `GEMINI_FAST_FALLBACKS` (`gemini-3.8-flash`) |
| `GEMINI_LITE_MODEL` | `gemini-3.5-flash-lite` | per-turn judgments: precheck, grounding, state, coach |
| `GEMINI_PRO_MODEL` | `gemini-4-argon` | final report; fallbacks in `GEMINI_PRO_FALLBACKS` (`gemini-3.1-pro-preview,gemini-2.5-pro`) |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | `output_dimensionality=768` (Firestore max 2048) |
| `GOOGLE_APPLICATION_CREDENTIALS` | - | local dev only: set it to an ADC file outside the repo, or use `gcloud auth application-default login` instead. Never copy credentials into the repo. Cloud Run uses its service account. |
| `STORE_BACKEND` | `memory` | `memory` or `firestore` |
| `CORS_ORIGINS` | `*` | |
| `EMBED_DIMENSIONS` | `768` | embedding output size |
| `FIRESTORE_DATABASE` | `(default)` | Firestore database id; the deployed app uses the named database `skillcoach` so it can share a project with other apps |
| `LLM_FAKE` | `false` | dev/tests: canned LLM output + hash embeddings |
| `NEXT_PUBLIC_MOCK` | `false` | frontend: local fixtures + fake SSE |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | frontend |

## Gemini client (`backend/app/llm/gemini.py`, owner: core)

```python
async def generate_json(prompt: str, schema: type[BaseModel], *, system: str | None = None,
                        model: str | None = None, temperature: float = 0.4) -> BaseModel
async def generate_text(prompt: str, *, system: str | None = None, model: str | None = None) -> str
async def stream_text(prompt: str | list, *, system: str | None = None,
                      model: str | None = None) -> AsyncIterator[str]
async def embed(texts: list[str], *, task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]
```
All other modules call Gemini only through these functions.

## Store (`backend/app/store/`, owner: core)

```python
store = get_store()            # singleton
await store.put(collection: str, id: str, data: dict)
await store.get(collection, id) -> dict | None
await store.list(collection, **filters) -> list[dict]
await store.delete(collection, id)
```
Collections: `documents`, `chunks`, `embeddings` (internal: `{id=chunk_id, document_id, vector}`), `personas`, `scenarios`, `sessions`, `reports`.

## KB ingest + search (`backend/app/kb/`, owner: core)

```python
# app/kb/ingest.py
async def ingest_text(title: str, text: str, *, filename: str | None = None) -> Document
async def ingest_file(filename: str, data: bytes, mime: str | None = None) -> Document
# app/kb/search.py
async def search(query: str, k: int = 5, document_ids: list[str] | None = None) -> list[SearchHit]
async def get_chunks(document_ids: list[str] | None = None, limit: int = 40) -> list[Chunk]
```

## HTTP endpoints

All JSON. IDs are short strings. Errors: `{"detail": "..."}`.

### Health
- `GET /healthz` -> `{"ok": true}`

### Knowledge base (core)
- `POST /api/kb/documents` multipart `file` (pdf, txt, md) -> `Document`
- `POST /api/kb/documents/text` `{title, text}` -> `Document`
- `GET /api/kb/documents` -> `Document[]`
- `DELETE /api/kb/documents/{id}`
- `POST /api/kb/search` `{query, k?}` -> `SearchHit[]`

### Personas (builder)
- `POST /api/personas/generate` `{brief, document_ids?, locale?}` -> `Persona` (draft, not saved, `id=""`)
- `POST /api/personas/generate-from-docs` `{document_ids?, count?=3, locale?}` -> `Persona[]` (drafts)
- `GET /api/personas` -> `Persona[]`
- `POST /api/personas` `Persona` -> `Persona` (saved, id assigned)
- `GET|PUT|DELETE /api/personas/{id}`
- `POST /api/personas/{id}/approve` -> `Persona` (status `approved`; only approved personas can back a scenario)

### Scenarios (builder)
- `POST /api/scenarios/generate` `{persona_id, trainee_goal, document_ids?}` -> `Scenario` (draft)
- `GET /api/scenarios` -> `Scenario[]`
- `POST /api/scenarios` -> `Scenario`
- `GET|PUT|DELETE /api/scenarios/{id}`

### Sessions (session)
- `POST /api/sessions` `{scenario_id}` -> `Session` (includes the customer's opening turn)
- `GET /api/sessions` -> `Session[]`
- `GET /api/sessions/{id}` -> `Session`
- `POST /api/sessions/{id}/delivery` `{image, text, cues?}` (`cues`: optional on-device MediaPipe summary of the whole turn: `face_visible`, `eye_contact`, `smile`, `brow_furrow`, `blinks_per_min`, `emotions{happy, neutral, surprised, sad, angry, fearful, disgusted, contempt}`; only numbers are passed to the model) -> `DeliveryFeedback {eye_contact: good|partial|poor|unclear, expression, posture, fit: fits|mixed|clashes, tip}`. Live mode: `image` is one base64 JPEG/PNG/WebP webcam frame (a `data:` URL is accepted, max 1.5 MB), `text` is what the trainee said that turn. `gemini-3.5-flash-lite` judges eye contact, expression and posture only (the prompt forbids comments on appearance or identity). Nothing is stored. 415 for other image types, 413 when too large, 422 for bad base64.
- `POST /api/sessions/{id}/precheck` `{text}` -> `{flags: ComplianceFlag[]}`. Compliance Guard before sending: keyword pass + fast Gemini (thinking off), target < 2 s. Nothing is stored. The frontend calls it on Send; if any `high` flag comes back it shows "Edit" / "Send anyway"; on timeout (> 2.5 s) it just sends.
- `POST /api/sessions/{id}/turns` `{text}` -> **SSE stream** (`text/event-stream`), events in order:
  | event | data |
  |---|---|
  | `compliance_pre` | `{flags: ComplianceFlag[]}` (about the trainee's message) |
  | `customer_delta` | `{text}` (streamed chunk) |
  | `customer_done` | `{turn: Turn}` |
  | `compliance_post` | `{flags: ComplianceFlag[]}` about the customer's reply (ungrounded product claims); runs concurrently with state + coach |
  | `state` | `{trust, patience, trust_delta, patience_delta, reason}` (meters 0-100) |
  | `coach` | `{hint: CoachHint}` (optional: omitted for a turn if the coach call fails) |
  | `done` | `{session_status}` (`active` or `ended`) |
  | `error` | `{detail}` |
  Status codes: 422 empty text, 409 session ended or a turn already in progress.
- `POST /api/sessions/{id}/end` -> `Report` (idempotent; 400 if the trainee never spoke, 502 if report generation fails)
- `GET /api/sessions/{id}/report` -> `Report`

### Dashboard (session)
- `GET /api/dashboard` -> `Dashboard`

## Models
See `backend/app/schemas.py`.

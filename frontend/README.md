# SkillCoach frontend

Next.js 15 (App Router) + TypeScript + Tailwind CSS. Built as a standalone Node server for Cloud Run.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Value proposition and one-click quick-start scenario cards |
| `/practice/[sessionId]` | Chat with the AI customer: streamed replies, live trust/patience meters with deltas and reasons, coach hints, Compliance Guard (holds high-risk messages before they are sent), inline compliance flags, citation chips, grounding post-check markers, Gemini pipeline trace, optional voice (Web Speech API) |
| `/reports/[sessionId]` | Compliance PASS/FAIL gate, overall score, per-skill scores with verbatim evidence (select a quote to jump to the turn), violations, strengths, improvements, knowledge citations |
| `/personas`, `/personas/new`, `/personas/[id]` | Persona list and builder wizard (from a brief, from documents with 3 drafts to pick from, or manual). Source chips on every grounded attribute; draft, then review sources, then approve |
| `/scenarios`, `/scenarios/new`, `/scenarios/[id]` | Scenario list and builder: pick an approved persona, set a goal, generate, then edit the rubric, compliance rules and branch events. Start practice from any card |
| `/knowledge` | Upload PDF/TXT/MD (drag and drop), paste text, list and delete documents, test a search |
| `/dashboard` | Manager view: sessions, average score, "Ready to go live" count, skills by dimension, top violations, recent sessions (aggregates only, no transcripts) |

## Run locally

```bash
cd frontend
npm install
cp .env.example .env.local

# Against the backend (default http://localhost:8080)
npm run dev

# Fully offline: local fixtures and a simulated SSE stream (demo scenarios A/B/C from docs/DEMO_SCRIPT.md)
npm run dev:mock
```

Open http://localhost:3000.

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend base URL, no trailing slash |
| `NEXT_PUBLIC_MOCK` | `false` | `true` swaps the HTTP client for the in-browser mock in `src/lib/mock/` |

`NEXT_PUBLIC_*` values are inlined at **build time**, so pass them as Docker build args.

## Build and deploy (Cloud Run)

```bash
IMAGE=REGION-docker.pkg.dev/PROJECT/REPO/skillcoach-web

# Build with the backend URL baked in, push, deploy
docker build -t $IMAGE --build-arg NEXT_PUBLIC_API_URL=https://skillcoach-api-xxxxx.a.run.app .
docker push $IMAGE
gcloud run deploy skillcoach-web --image $IMAGE --region asia-east1 --allow-unauthenticated --port 8080
```

Set the backend's `CORS_ORIGINS` to the frontend's Cloud Run URL (or keep `*` for the demo).

The container runs `node server.js` from the standalone output and listens on `$PORT` (8080 by default).

## Code map

```
src/lib/types.ts         Mirrors backend/app/schemas.py (keep in sync)
src/lib/api.ts           Typed API client; `api` switches to the mock when NEXT_PUBLIC_MOCK=true
src/lib/sse.ts           text/event-stream parser for POST streams (EventSource is GET-only)
src/lib/mock/            Fixtures and a fake backend, including scripted customer replies
src/lib/speech.ts        Web Speech API: speech-to-text and speechSynthesis
src/components/          UI kit, transcript, persona/scenario forms, generation progress
src/app/                 Routes (see table above)
```

## Accessibility

- Skip link, landmarks, one `h1` per page, visible focus ring on every control.
- Full keyboard use: Enter to send and Shift+Enter for a new line, Escape closes popovers and the Compliance Guard, arrow keys move between draft cards.
- Severity and scores never rely on color alone: icons, text labels and numbers are always present. Meters use `role="meter"` with value text.
- Screen readers hear new customer replies and compliance alerts through a polite live region. Streaming text is not announced token by token.
- Respects `prefers-reduced-motion`. Text mode is always available, and voice is optional.
- Colors are from Tailwind's slate, indigo, emerald, amber and rose scales, with body text at contrast of 4.5:1 or better.

# 3-Day Scope and Build Plan

Build window: **2026-10-15 to 2026-10-18 (submission day)**. Everything below
is fresh code written during the hackathon; the earlier SkillCoach repository
is a design reference only.

Workstream owners follow [API_CONTRACT.md](API_CONTRACT.md):
**lead** (contract, integration, submission), **core** (`llm/`, `store/`,
`kb/`, `main.py`), **builder** (`builder/`, `seed/`), **session**
(`session/`: agents, orchestrator, SSE, report, dashboard), **web**
(`frontend/`).

Judging weights Technical Merit & GenAI at 40 percent, so the plan protects
the features that make Gemini's work *visible*: streaming persona, live
compliance flags, coach hints with citations, and a report whose quotes and
citations are verified.

---

## 1. MoSCoW

### Must (the demo fails without these)

- [ ] `llm/gemini.py` wrapper: `generate_json`, `generate_text`, `stream_text`, `embed` on Vertex AI, model IDs and locations from env (`GOOGLE_CLOUD_LOCATION=global`, `GEMINI_EMBED_LOCATION=asia-east1`)
- [ ] Store with `memory` and `firestore` backends
- [ ] KB: upload PDF/TXT/MD and pasted text, chunk, embed (768-d), search with citations
- [ ] Seed: one demo company corpus (3-5 short docs), 1 approved persona with a verbatim `opening_line`, 1 scenario with compliance rules + rubric
- [ ] Session: `POST /api/sessions`, Compliance Guard interception (`POST /api/sessions/{id}/precheck`; UI card with "Edit message" / "Send anyway" on a high flag), SSE turn pipeline with compliance pre-check, RAG-grounded streamed customer, grounding post-check (`compliance_post`), state (trust/patience), coach hint
- [ ] `POST /api/sessions/{id}/end` -> `Report` with verified evidence quotes (unverified dimensions capped at 50), knowledge citations, and the compliance gate (`compliance_passed`; high-severity violation caps `overall_score` at 59)
- [ ] Frontend: practice room (chat stream, trust/patience meters, compliance flags inline, coach panel), report page
- [ ] Deployed on Cloud Run (`skillcoach-api`, `skillcoach-web`) with Firestore, using Gemini
- [ ] Demo video, deck PDF, submission form

### Should (strong value, build after Must is deployed)

- [ ] Persona generation from documents with citations, `draft` to `approved` flow (`POST /api/personas/{id}/approve`), and scenario generation (builder UI with edit-before-save; only approved personas back a scenario)
- [ ] Manager dashboard (`GET /api/dashboard`): aggregates plus session summaries, no transcripts (averages by rubric dimension, top violations, recent sessions) and `ready_count` shown as "Ready to go live"
- [ ] Voice via browser Web Speech API (mic in, `speechSynthesis` out)
- [ ] Firestore vector index (vs memory fallback) live in production
- [ ] Structured per-call logs with token counts and latency; latency shown in UI or deck
- [ ] Branch events firing mid-session (for example "mentions a cheaper competitor at turn 4")

### Could (only if ahead of schedule)

- [ ] Gemini Live API voice (`gemini-3.8-live`) via WebSocket proxy
- [ ] Cloud Trace spans per agent (screenshot for the deck)
- [ ] Avatar/emotion visuals for the customer
- [ ] Firebase Auth sign-in
- [ ] Second demo scenario in another industry
- [ ] Gemma model for an offline/edge compliance check (narrative only)

### Won't (explicitly out for the hackathon)

- Multi-tenancy, RBAC, SSO
- OCR for scanned PDFs, DOCX/PPTX parsing
- Background job queue, reranker, hybrid search
- Mobile app, i18n framework, analytics exports
- Custom domain (unless DNS is already prepared)
- Anything ported from the old repository's code

---

## 2. Day-by-day plan

Times are local. The team's **internal submission cutoff is 6 hours before
the official deadline** on Oct 18; check the exact deadline time and time
zone on the competition page on Day 1 and write it here: `__________`.

### Day 1: Oct 15 (evening) to Oct 16 - skeleton to end-to-end text turn

Goal: by the end of Oct 16 a deployed URL where a text conversation with a
grounded, streaming persona works, even if ugly.

Oct 15 evening

- [ ] lead: contract frozen, repo layout, `.env.example` (done)
- [ ] core: GCP project, billing, APIs enabled, service account, run the model check in [deployment](deployment.md) section 2 and record which model IDs respond
- [ ] core: FastAPI skeleton + `/healthz` deployed to Cloud Run (prove the pipeline early)
- [ ] web: Next.js 15 skeleton deployed to Cloud Run, reads `NEXT_PUBLIC_API_URL`
- [ ] builder: write the demo corpus (product guide, fee schedule, compliance policy, FAQ) and the seed persona/scenario as JSON

Oct 16

- [ ] core: `llm/gemini.py` complete; store (memory first); KB ingest + search
- [ ] session: orchestrator with pre-check -> customer stream -> state -> coach; SSE events per contract
- [ ] session: report agent with quote verification
- [ ] web: practice room consuming SSE via `fetch` stream reader; report page
- [ ] core: Firestore backend + vector index created (index builds in the background)
- [ ] lead: integration test of one full session against the deployed API
- [ ] **Cut line 1 (Oct 16, 22:00):** if the end-to-end text turn is not working on Cloud Run, stop all Should work tomorrow morning until it is.

### Day 2: Oct 17 - quality and Should items

Goal: the demo story is complete and polished; the build is feature-frozen at the end of the day.

- [ ] session: grounding post-check (`compliance_post`) and `/precheck` interception if not done on Day 1; branch events; end conditions (patience 0, agreement, max turns)
- [ ] builder: persona-from-docs and scenario generation endpoints + builder UI
- [ ] session + web: dashboard endpoint and page
- [ ] web: Web Speech voice toggle; trust/patience meters animate; compliance flag chips with quotes; coach hint card with citation links
- [ ] core: switch production to `STORE_BACKEND=firestore`; structured logs with tokens and latency
- [ ] all: prompt tuning on the seed scenario (persona stays in character, hidden need revealed only after good discovery, coach hints concrete)
- [ ] lead: draft demo script and deck outline; dry-run the demo twice
- [ ] **Cut line 2 (Oct 17, 18:00):** anything not working is dropped from the demo, not fixed. Could items start only if every Must and the dashboard are done.
- [ ] **Feature freeze (Oct 17, 23:00):** after this, bug fixes and copy only.

### Day 3: Oct 18 - record, package, submit

- [ ] Morning: final deploy of tagged commit; `--min-instances 1` on both services; run the demo-critical path (below) twice on the production URL in a fresh incognito window
- [ ] Record the demo video (allow 2-3 hours: script, 2-3 takes, light editing, captions, upload, check the link plays while logged out)
- [ ] Deck PDF (allow 1.5 hours): problem, solution, live-demo screenshots, architecture diagram, Gemini usage (which model does what), verified-citation mechanism, impact on enterprise productivity, roadmap
- [ ] README and docs final pass; repository public (or access granted to judges); license present
- [ ] Final deploy check (30 minutes before submitting): `/healthz` OK, one full session + report on production, dashboard loads, no console errors, links in README work
- [ ] Submit at the internal cutoff; keep the services running and do not deploy after submitting
- [ ] **Cut line 3:** no new features on Oct 18. If something breaks, roll back to the last good revision (`gcloud run services update-traffic skillcoach-api --to-revisions REVISION=100`).

---

## 3. Demo-critical path

These steps, in this order, are what the video and the judges will see. Each
must work on the production URL. Anything not on this list is optional.

1. Open the web app; the knowledge base shows the seeded company documents (and upload one more live, for example a one-page policy, to show ingestion).
2. (Should) Generate a persona from the documents; its citation chips open the source passages; approve it.
3. Pick the seeded scenario (its persona is already approved); persona card shows the public profile only.
4. Start the session; the customer's opening line appears, served verbatim.
5. Trainee asks a discovery question; customer reply **streams** in; trust meter moves; coach hint appears with a citation to a document.
6. Trainee states a wrong product fact; the customer pushes back (grounding), and the coach hint cites the correct chunk.
7. Trainee types something non-compliant (for example "this is guaranteed") and presses Send; the **Compliance Guard card** intercepts it with the exact quote and rule and offers "Edit message" / "Send anyway"; the trainee sends anyway and the flag is recorded.
8. Trainee recovers; the hidden need is revealed; session ends (agreement or max turns).
9. Report: **compliance gate failed** with overall score capped at 59, per-rubric scores with **verified quotes from the trainee's own words**, compliance violations, knowledge citations.
10. Manager dashboard: the new session appears in the aggregates and violation counts; the "Ready to go live" count does not include it.
11. (Should) Repeat one turn by voice with the mic button.

Fallback plan for the recording: run the critical path on the production URL
first; if Gemini or Cloud Run misbehaves during recording, record against a
local backend with the same model IDs and state this honestly in the
description. Keep a screenshot set of every step as a last resort for the deck.

---

## 4. Risk register

| Risk | Signal | Mitigation |
|---|---|---|
| Model ID not available to the project | 404/403 in the Day 1 model check | Gemini 3.x models are served only on `global` (404 on `us-central1`); set `GEMINI_PRO_MODEL=gemini-2.5-pro` if the preview model fails; Developer API fallback key |
| `/precheck` slower than 2.5 s | Message sends without the Guard card | Pre-warm; keyword pass first; fast model with thinking off |
| Vertex quota (429) during recording | 429 in logs | Request quota early; reduce per-turn calls (merge coach into state agent); retry with backoff in wrapper |
| Firestore vector index not ready | `FAILED_PRECONDITION` | Memory backend with `--max-instances 1` |
| SSE buffered on Cloud Run | All deltas arrive at once | Headers + initial flush (see architecture section 8) |
| Persona leaks hidden need or breaks character | Seen in testing | Tighten system prompt (hidden needs gated on trust); lower temperature; grounding post-check for invented product facts |
| Report quotes not verbatim | `verified=false` rate high; scores capped at 50 | Prompt asks for exact quotes; UI shows only verified quotes |
| Scope creep | Could items started before Must done | Cut lines above; lead says no |
| Last-minute deploy breaks prod | Smoke test fails | Freeze on Oct 17; traffic rollback to previous revision |

# SkillCoach: Hackathon Guide

Google Cloud AI Builder Cup 2026 (Hack2skill, JAPAC). Theme: **Future of Work & Enterprise Productivity**. Submission deadline: **2026-10-18**.

This document maps SkillCoach to the judging criteria, and contains the demo video storyboard and pitch deck outline.

---

## 1. Theme alignment

> *Build an AI-powered solution that transforms how individuals and organizations access knowledge, collaborate, make decisions, and complete everyday work.*

| Theme phrase | SkillCoach answer |
| --- | --- |
| Access knowledge | Company manuals and policies become a conversational practice partner. Every fact the AI customer states, and every judgment the scorer makes, cites the source passage. |
| Collaborate | Trainee and manager look at the same transcript, scores and evidence. Coaching starts from facts, not impressions. |
| Make decisions | Trainees rehearse the judgment calls (when to escalate, what not to promise) before they matter. Managers allocate coaching using aggregated skill-gap data. |
| Complete everyday work | 10-minute practice sessions, available any time, no senior colleague required. |
| Measurable improvement | Fewer senior-staff hours spent on role-play, faster ramp-up for new hires, compliance mistakes caught in practice instead of in front of customers. |

---

## 2. Judging criteria mapping

### Technical Merit & Gen AI Implementation (40%)

| What judges look for | Evidence to show |
| --- | --- |
| Meaningful, non-trivial Gemini use | A Compliance Guard on Send (`/precheck`, under 2 s) plus a per-turn pipeline (compliance pre-check, streamed persona, grounding post-check `compliance_post`, state, coach) and an end-of-session scorer, each a separate Gemini call with its own system instructions and JSON schema. Show the pipeline trace panel in the demo. |
| Grounding / reliability | RAG over uploaded documents with `gemini-embedding-001`; citations shown inline. The grounding post-check (`compliance_post`, `rule_id: "GROUNDING"`) flags ungrounded product claims by the persona. |
| Human in the loop | Personas generated from documents carry citations to the source passages and start as `draft`; a trainer approves them (`POST /api/personas/{id}/approve`). Only approved personas can back a scenario. |
| Hallucination control | Scorer evidence is validated server-side: quoted text must exist in the transcript, citation IDs must exist in the knowledge base. Unmatched quotes are marked "unverified", never silently shown, and a dimension without verified evidence is capped at 50. |
| Compliance gate | Any high-severity violation sets `compliance_passed = false` and caps the overall score at 59. A great conversation with one forbidden promise still fails, as it would in real life. |
| Right model for the job | Seven Gemini agent roles (builder, precheck judge, persona, grounding, state, coach, report). `gemini-3.8-flash` (thinking `low`) for the streamed persona and the builder (benchmarked against Pro: similar quality, 2-3x faster); `gemini-3.5-flash-lite` for the per-turn judgments (precheck, grounding, state, coach); `gemini-3.1-pro-preview` (fallback `gemini-2.5-pro`) for the long-context report. See [DECK.md](DECK.md) slide 7. |
| Mandatory platform use | Backend and frontend deployed on Cloud Run (`asia-east1`); Gemini via Vertex AI (`google-genai` SDK, `global` endpoint). Show the Cloud Run console and URL briefly. |
| Engineering quality | Public repo with README, architecture doc, ADR, deployment guide; typed schemas (Pydantic); no secrets in repo. |

### Problem Alignment & Impact (25%)

| What judges look for | Evidence to show |
| --- | --- |
| Real, clearly stated problem | Role-play training depends on scarce senior staff; onboarding is slow; compliance mistakes are costly. Use sourced statistics in the deck (see placeholders in Section 4). |
| Who benefits | New hires (confidence, faster ramp-up), managers (visibility), compliance teams (fewer incidents), customers (better-informed staff). |
| Breadth | Same engine, different knowledge base: SaaS sales, insurance advisors, customer support, retail, clinic front desk. The demo shows at least two industries. |
| Measurable outcome | Report shows per-skill scores; second attempt in demo shows improvement. Propose pilot KPIs: time-to-first-solo-call, compliance flags per 100 turns, manager hours saved. |

### Innovation & Creativity (25%)

| What judges look for | Evidence to show |
| --- | --- |
| Beyond a chatbot | The AI plays the *customer*, not an assistant. It has hidden concerns and pushes back; the trainee must discover them. |
| Novel combination | Personas generated from your own documents (with citations and human approval) + a Compliance Guard that intercepts a risky message before it is sent + live coach + evidence-verified scoring with a compliance gate, in one loop. |
| Trustworthy AI feedback | "Every score quotes your words" is the differentiator. Show a score card with the verified quote highlighted in the transcript. No verified evidence, no score above 50. |
| Knowledge as practice | Turning static policy documents into adversarial, grounded practice scenarios. |
| Stretch (only if built) | Voice via Gemini Live API; VRM avatar; on-device emotion cues. Do not claim unless shown. |

### User Experience & Solution Design (10%)

| What judges look for | Evidence to show |
| --- | --- |
| Usability | Three clicks from landing to first practice turn. Demo scenarios preloaded. |
| Accessibility | Text mode always available (voice is optional); keyboard navigation; sufficient contrast; captions/transcript for every voice turn; no color-only signals (compliance flags use icon + label). |
| Components working cohesively | Compliance flag, coach hint, persona reply and citations appear in one coherent turn view; the final report links each score back to the exact turn. |
| Clarity of feedback | Each hint is one sentence; each score has one quote and one suggestion. |

---

## 3. Demo video storyboard (target 2:50, hard limit < 3:00)

Record at 1080p. Use the live Cloud Run URL, not localhost. Scenario lines come from [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00 to 0:15 | Title card: SkillCoach logo, tagline. Then a quick montage: a manager shadowing a new hire, a stack of PDFs. | "New customer-facing hires learn on real customers. Role-play would help, but it needs senior staff nobody can spare. And one wrong promise can cost a company dearly." |
| 0:15 to 0:30 | Landing page on the Cloud Run URL. | "SkillCoach turns your company's own knowledge into realistic practice conversations, powered by Gemini on Google Cloud." |
| 0:30 to 0:45 | Admin uploads a product sheet and a code of conduct; chunk count appears. Persona generated from the docs shows citation chips; admin clicks **Approve**. | "An admin uploads product manuals and policies. Gemini drafts realistic customers from them, citing the source, and a human approves each one before anyone practices." |
| 0:45 to 1:25 | Scenario A (SaaS pricing objection). Trainee types discovery question; AI CFO pushes back on price; coach hint appears; citation chip appears on the persona's reply. | "The customer is played by Gemini. It has hidden concerns, raises real objections, and only quotes facts from the company's documents. You can see the citation. Meanwhile the coach suggests the next move." |
| 1:25 to 1:55 | **Signature moment.** Scenario B (insurance). Trainee types "guarantees you 8% a year" and presses Send. The message is held back; the **Compliance Guard card** shows rule CC-01, the quoted phrase, and two buttons: **Edit message** / **Send anyway**. Trainee clicks **Send anyway** (for training); the flag is recorded on the turn. | "Here's the costly mistake: promising a guaranteed return. Before the message ever reaches the customer, the Compliance Guard stops it, quotes the exact words and names the rule. The trainee can fix it, or send it anyway and live with the consequences." |
| 1:55 to 2:20 | End session; report screen shows **Compliance: failed** and an overall score capped at 59. Click a score; transcript scrolls to the highlighted, verified trainee quote; knowledge citation shown. | "One forbidden promise fails the session, however good the rest was. And every score quotes the trainee's own words, verified against the transcript. No evidence, no high score." |
| 2:20 to 2:35 | Manager dashboard: aggregate scores by skill, top violated rules, session summaries (no transcripts), and the "Ready to go live" count. | "Managers see aggregates and summaries, not transcripts: where the team needs help, and how many sessions are ready to go live." |
| 2:35 to 2:45 | Architecture slide: Next.js, Cloud Run, seven Gemini agent roles, Firestore. | "Gemini agents on every turn, served from Cloud Run, grounded in your knowledge." |
| 2:45 to 2:50 | End card: live URL, GitHub URL, team names. | "SkillCoach. Practice the conversation before it counts." |

Recording tips: pre-warm the Cloud Run service (one request before recording) to avoid cold start; zoom browser to 125% for legibility; turn on captions in the editor; keep the cursor visible.

---

## 4. PDF deck outline (12 slides)

Final slide content, with measured numbers and sources: [DECK.md](DECK.md).

Export to PDF, English only. Keep each slide to one message.

1. **Title.** SkillCoach: practice the conversation before it counts. Team name, AI Builder Cup 2026, theme: Future of Work & Enterprise Productivity.
2. **Vision.** Every customer-facing employee gets a tireless, knowledgeable practice partner and coach, grounded in their own company's knowledge. Expert know-how is captured and shared instead of lost.
3. **Problem.**
   - Role-play depends on scarce senior staff. `[STAT: % of managers' time spent on onboarding/coaching, source]`
   - Slow ramp-up. `[STAT: average time-to-productivity for new sales/support hires, source]`
   - Knowledge loss through attrition. `[STAT: annual turnover in contact centers / retail, source]`
   - Compliance risk. `[STAT: example fine or mis-selling penalty, source]`
4. **Solution.** Upload knowledge, generate and approve personas, pick a scenario, practice with an AI customer, get real-time compliance and coaching, receive an evidence-based report with a compliance gate. One diagram of the user flow.
5. **Demo.** Four screenshots: persona draft with citations and the Approve button; the Compliance Guard card ("Edit message" / "Send anyway"); grounded persona reply with citation; report with verified quoted evidence and "Compliance: failed". QR code / link to live URL and video.
6. **Architecture.** Next.js and FastAPI on Cloud Run (`asia-east1`), Vertex AI Gemini (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview` on the `global` endpoint), `gemini-embedding-001` and Firestore (`asia-east1`). Per-turn pipeline diagram.
7. **How Gemini is used.** Table of the seven Gemini agent roles and retrieval: role, model, structured output, guardrail. Highlight evidence verification (quotes must exist in transcript, otherwise unverified and capped at 50; citations must exist in KB) and the compliance gate (high-severity violation fails, score capped at 59).
8. **Community benefit & impact.**
   - Trainees: confidence and faster ramp-up; safe space to fail.
   - Managers: objective, comparable skill data; hours saved.
   - Customers: better-informed, compliant staff.
   - SMEs and nonprofits: access to role-play training they could never staff.
   - Proposed pilot KPIs: time-to-first-solo-call, compliance flags per 100 turns, senior hours saved per new hire, trainee confidence (self-reported).
9. **Feasibility.** Built entirely on managed Google Cloud services; working deployment today; no custom model training; onboarding a new company only requires uploading documents, approving generated personas and reviewing a scenario. Known limitations and mitigations (latency, hallucination guardrails, data privacy: data at rest in `asia-east1`, inference via the Vertex AI global endpoint).
10. **Scalability & business model.**
    - Technical: stateless Cloud Run autoscaling; Firestore scales with tenants; Flash for per-turn cost efficiency.
    - Business: per-seat SaaS for teams; enterprise tier with SSO, region pinning for data at rest, LMS/CRM integration; scenario marketplace by industry.
    - Go-to-market: English-speaking APAC financial services first (Singapore insurance and bancassurance advisors under MAS fair-dealing rules), then Philippine and Hong Kong contact-center and advisor workforces; Taiwan, Japan and Korea as the expansion wave after localization ("English first, built to localize").
    - Cross-industry: sales, insurance, banking, support, retail, healthcare front desk.
11. **Roadmap.** Now: text practice, persona generation with approval, multi-agent pipeline, evidence-verified report with compliance gate, manager view. Next: Gemini Live API voice, VRM avatar, on-device emotion cues. Later: LMS/CRM integrations, scenarios from anonymized real calls, certification tracks.
12. **Team.** Names, roles, one-line background each. Links: live demo, video, GitHub.

---

## 5. Honesty rules for all materials

- Only claim features shown working in the deployed app or the video. Label everything else "planned".
- Statistics in the deck must have a source; otherwise remove them.
- Data residency: say "data at rest in the chosen APAC region, inference via the Vertex AI global endpoint". Never say "data never leaves Taiwan".
- The product language is English (en-US). Do not present other languages as a shipped feature.
- This is a fresh build within the hackathon timeline.

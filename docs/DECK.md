# SkillCoach: Pitch Deck Content

Final slide content for the PDF deck (Google Cloud AI Builder Cup 2026, theme **Future of Work & Enterprise Productivity**). The submitted deck uses the official AI Builder Cup submission template: [media/SkillCoach_Submission.pptx](../media/SkillCoach_Submission.pptx) and [media/SkillCoach_Submission.pdf](../media/SkillCoach_Submission.pdf), built by `tools/deck/build_submission_deck.py` from `Submission Template _ AI Builder Cup.pptx` (the older `media/SkillCoach_Deck.pptx/.pdf` is superseded). English only, 12 slides, one message per slide. Outline from [HACKATHON.md](HACKATHON.md) section 4; statistics from [BUSINESS_CASE.md](BUSINESS_CASE.md), where `[Sn]` refers to its Sources section (put the source list on the last page or in slide footers). Numbers labeled **(estimate)** are our own model, not facts.

Measured numbers come from the deployed build (Cloud Run `asia-east1`, real Gemini, 2026-10-16; the app has since been redeployed to a new Google Cloud project):

| Measurement | Value | Where it was measured |
| --- | --- | --- |
| Customer reply, full turn | 4.8-5.5 s | live, `gemini-4-argon` (lead's measurement) |
| First streamed token | 2.0-2.7 s | live, `gemini-4-argon` (lead's measurement) |
| Knowledge-base retrieval | 0.23-0.28 s | live |
| Compliance Guard (`/precheck`) | 0.86-1.33 s | live, `gemini-3.5-flash-lite` |
| End-of-session report | 6.1 s at `/end` (cold, no speculative draft) | live, `gemini-4-argon` (lead's measurement) |
| Persona / scenario generation | 18-40 s (18-29 s from a brief, 36-40 s for 3 personas from documents, 26-30 s for a scenario); 106 of 106 citations verified | live, `gemini-4-argon`, two runs, 2026-10-16 |
| Scenario A (sales, high-score path) | overall **94**, compliance PASS on `gemini-4-argon`; 100 in 2 of 2 earlier runs on the 3.8 Flash build | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) |
| Scenario B (insurance, guaranteed return) | compliance **FAIL**, score capped (**30** in the recorded run; gate caps at 59) | recorded demo run on the deployed web app |
| Scenario C (support escalation) | overall **68**, RR-01 (medium) flag, then recovery and gift reveal, compliance passed, on `gemini-4-argon`; 81 in 2 of 2 earlier runs on the 3.8 Flash build | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) |

Criteria key used below: **T** = Technical Merit & GenAI (40%), **I** = Problem Alignment & Impact (25%), **N** = Innovation & Creativity (25%), **U** = UX & Solution Design (10%).

---

## Slide 1. Title

**SkillCoach: practice the conversation before it counts.**

- AI customers built from your company's own documents, a Compliance Guard on every message, and scores that quote your words.
- Google Cloud AI Builder Cup 2026, theme: Future of Work & Enterprise Productivity.
- `[Team name]` · live demo https://skillcoach-aibc.web.app · video `[URL]` · GitHub https://github.com/jease0502/SkillCoach-AIBC

**Speaker notes.** Customer-facing work is one of the largest parts of the workforce, and new hires still learn it on real customers. SkillCoach gives every new hire a realistic practice customer and a coach, built from the company's own manuals and rulebooks, and running on Gemini and Cloud Run today. Everything in this deck is in the deployed build unless it is labeled "planned".

**Visual.** Logo and tagline on the left; on the right a cropped screenshot of a live turn: the persona's reply, an inline compliance flag and a coach hint in one view.

**Criteria.** Sets up the theme (Future of Work).

---

## Slide 2. Vision

**Every customer-facing employee gets a tireless practice partner that knows the company's products and rules.**

- Practice is private, unlimited and available at any time, with no senior colleague needed.
- Expert know-how (how the best people handle objections) becomes a scenario the whole team can practice, instead of leaving with the expert.
- Managers decide who is ready for customers based on evidence, not gut feel.

**Speaker notes.** The theme asks how AI changes the way people access knowledge, make decisions and get everyday work done. Our answer: company knowledge stops being something you read and becomes something you practice. A new insurance advisor rehearses the conversation they are most afraid of, until they can handle it without breaking a rule, before they ever meet a real customer.

**Visual.** One line diagram: "Manuals and policies" → "AI customer + coach" → "Verified skill report" → "Ready to go live".

**Criteria.** Theme fit (access knowledge, make decisions, complete everyday work); **I**.

---

## Slide 3. Problem

**New hires learn on real customers, because realistic practice needs senior people nobody can spare.**

- **People leave before they are productive.** In Taiwan, fewer than half of new life-insurance reps are still in the role after one year [S9]. Contact-center attrition averages 39% globally [S7] and 43-45% in the Philippines [S6].
- **Practice doesn't scale.** Formal learning time fell from 17.4 h to 13.7 h per employee per year [S1]. A human-operated simulation costs about US$49 per 30-minute session [S23].
- **One sentence can be a conduct failure.** MAS expects representatives to be competent before they advise on their own [S29] and acts against firms and individuals [S21]. Hang Seng Bank was fined HK$66.4M in Hong Kong [S20].

**Speaker notes.** Three pains show up together in regulated selling. First, churn: across the region, new agents and service staff leave quickly, and every departure throws away recruiting, licensing and training spend. Second, practice depends on senior people: training hours are shrinking, and live simulations cost tens of dollars per session, so most recruits get very little realistic practice. Third, compliance: a single phrase such as "this plan guarantees your principal" breaches the rules. Fines per firm are small, so we don't sell on fines. The real cost is complaints, remediation and licence risk, and regulators like MAS expect firms to prove competence before a representative advises alone.

**Visual.** Three columns with large numbers: "< 50% one-year retention [S9]", "13.7 h training per year [S1]", "HK$66.4M fine [S20]". Source tags in small type under each number.

**Criteria.** **I** (real, clearly stated, sourced problem).

---

## Slide 4. Solution

**Upload your knowledge, approve AI-drafted customers, practice, and get a report you can trust.**

- **Build:** upload manuals and policies; Gemini drafts customer personas and scenarios that cite the source passages; a trainer approves them before anyone practices.
- **Practice:** a live AI customer with hidden concerns, a Compliance Guard that intercepts a risky message before it is sent, and a one-sentence coach hint on every turn.
- **Prove:** an evidence-verified report with a compliance gate, and a manager view of who is ready to go live.

**Speaker notes.** The loop has three steps. Build: an admin uploads documents, and in well under a minute Gemini drafts a set of realistic customers from them. Each objection and hidden need carries a citation to the passage it came from, and nothing is used until a human approves it. Practice: the trainee talks to the AI customer, who has a real concern they won't reveal unless asked well. Before each message is sent, the Compliance Guard checks it against the company's rules in about a second. Prove: the report quotes the trainee's own words for every score, and one serious violation fails the session.

**Visual.** User-flow diagram with three swim lanes (Admin, Trainee, Manager): Upload → Generate persona (citation chips) → Approve → Practice turn (Guard, persona, coach) → Report (compliance gate) → Dashboard (Ready count).

**Criteria.** **N** (novel combination in one loop); **U** (components working cohesively).

---

## Slide 5. Demo: three scenarios, measured on the live service

**Same engine, three industries, three different outcomes.**

- **A. SaaS sales, pricing objection:** the trainee uncovers the real concern (adoption, not price), answers with product facts and books a pilot. **Overall 94, compliance PASS** on the Argon build.
- **B. Insurance, guaranteed-return trap:** "this plan guarantees you 8% a year" is held back by the Compliance Guard (rule CC-01, high). Sent anyway, it **fails the session**: score capped (30 in the recorded run).
- **C. Support escalation:** a refund promise outside policy is flagged (RR-01, medium); the trainee recovers, and the customer reveals the story behind the anger. **Overall 68**, compliance passed, on the Argon build.

**Speaker notes.** These are not replays. Every customer line is generated live by Gemini, so the wording changes each time, but the behaviors are stable because they are anchored in seed data: verbatim opening lines, explicit compliance rules with citations, and objections tied to triggers. In A, a good discovery question makes the CFO admit her team abandoned the last tool, and the trainee closes on a pilot with a date. In B, the Guard stops a guaranteed-return promise before it reaches the customer. In C, the customer only shares that the headphones were a birthday gift after the trainee apologizes, offers real options and asks gently. That is the soft skill we want to train.

**Visual.** Four screenshots in a grid: (1) persona draft with citation chips and the **Approve** button; (2) the **Compliance Guard card** on Scenario B ("guarantees you 8% a year", CC-01, **Edit message** / **Send anyway**); (3) a Scenario C turn with the inline RR-01 flag and the coach hint; (4) a report with verified quotes, beside the "Compliance: failed" header from B. QR codes to the live URL and the video.

**Criteria.** **I** (breadth: three industries); **U** (clarity of feedback); **T** (working deployment).

---

## Slide 6. Architecture

**Next.js and FastAPI on Cloud Run behind Firebase Hosting, Gemini on Vertex AI, Firestore for state: all managed Google Cloud.**

- Firebase Hosting (https://skillcoach-aibc.web.app): the public URL; rewrites every path to the web service on Cloud Run.
- Cloud Run (`asia-east1`): `skillcoach-web` (Next.js) and `skillcoach-api` (FastAPI, Server-Sent Events for streaming turns).
- Vertex AI: Gemini 3.x generation on the `global` endpoint (`google-genai` SDK); `gemini-embedding-001` in `asia-east1`, next to Cloud Run.
- Firestore (`asia-east1`, named database `skillcoach`): documents, chunks with vectors, personas, scenarios, sessions, reports.

**Speaker notes.** The system has no servers to manage and no custom model training. The frontend and API are stateless Cloud Run services that autoscale. Every turn is one HTTP request that streams events back to the browser: the compliance pre-check, the customer's reply token by token, the grounding post-check, the trust and patience meters, and the coach hint. Retrieval takes about 0.25 seconds on the live service. Data at rest and embeddings stay in the APAC region we choose; Gemini generation runs through the Vertex AI global endpoint, and we say exactly that to buyers [S27].

**Visual.** Architecture diagram: Browser → Firebase Hosting → Cloud Run web → Cloud Run API → (Vertex AI Gemini `global`; `gemini-embedding-001` and Firestore in `asia-east1`). Underneath, the per-turn pipeline as a timeline: `precheck` (~1 s) → retrieval (~0.25 s) → persona stream (first token ~2-2.7 s) → grounding + state + coach in parallel → `done` (~5 s).

**Criteria.** **T** (mandatory platform use, engineering quality).

---

## Slide 7. How Gemini is used

**Seven Gemini agent roles, each with its own model, schema and guardrail.**

| Agent | Model | How | Guardrail |
| --- | --- | --- | --- |
| Persona & scenario builder | `gemini-4-argon`, thinking `low` | Structured output (Pydantic JSON schema); segments planned first, then personas expanded **in parallel** | Every citation's quote must appear verbatim in the cited chunk, or it is dropped; drafts need human approval |
| Compliance Guard (`/precheck`) | `gemini-3.5-flash-lite`, thinking `low` | Keyword pass plus structured JSON judge, about 1 s | Flag quote must be an exact span of the trainee's message |
| Customer persona | `gemini-4-argon`, thinking `low` | **Streamed** text over SSE | Hidden needs withheld until trust is earned; only KB facts allowed |
| Grounding post-check | `gemini-3.5-flash-lite` | Structured JSON, runs **in parallel** with state and coach | Flags product claims the retrieved passages don't support |
| State (trust / patience) | `gemini-3.5-flash-lite` | Structured JSON | Deltas clamped; a high-severity violation always costs trust |
| Coach | `gemini-3.5-flash-lite` | Structured JSON with KB citations | One sentence, grounded in the playbook |
| Report scorer | `gemini-4-argon` | Long-context structured output, about 6 s | Evidence must be a verbatim quote from the transcript; otherwise unverified and the dimension is capped at 50; any high-severity violation caps the score at 59 |

- **Right model for the job:** Gemini 4 Argon where quality shows (the customer's voice, the builder, the report); Flash-Lite for per-turn judgments that must finish in about a second. Every tier has an automatic fallback chain (Argon → 3.8 Flash; report → 3.1 Pro → 2.5 Pro), so a model outage degrades quality, not availability.
- **Thinking control:** `low` on every agent keeps a full turn at about 5 s with the first words in 2-2.7 s. We benchmark every model switch on the live service: Argon drafts richer, more heavily cited personas than 3.8 Flash (106 of 106 citations verified) at about 3x the generation time, a trade-off we accept for a one-off authoring step.
- **Citation verification everywhere:** the model never decides on its own what counts as evidence. The server checks every quote against the source text.

**Speaker notes.** This is the core of our technical story. Instead of one big prompt, each job is a separate Gemini call with its own system instructions and JSON schema, and the cheapest model that does the job well. Calls that don't depend on each other run in parallel. The compliance judge starts while retrieval and the reply run. After the reply, the grounding check, the state update and the coach hint all run at once. The most important design decision is that nothing the model claims as evidence is trusted. Persona citations, scenario rules and report quotes are all checked by the server against the documents or the transcript, and anything that doesn't match is dropped or marked unverified.

**Visual.** The table above as a styled graphic, with the model tiers color-coded (Gemini 4 Argon, Flash-Lite, fallbacks) and small icons for "structured output", "streaming", "parallel".

**Criteria.** **T** (meaningful, non-trivial Gemini use; hallucination control; right model for the job).

---

## Slide 8. Trust by design

**Every score quotes your words. No verified evidence, no score above 50. One serious slip fails the session.**

- **Before sending:** the Compliance Guard quotes the exact phrase and names the rule (CC-01, "guarantees you 8% a year").
- **While talking:** persona drafts, scenario rules and rubric items all cite the source passage; a trainer approves every persona before use.
- **After the session:** quotes are verified against the transcript; a high-severity violation sets `compliance_passed = false` and caps the score at 59 (Scenario B: FAIL, 30 in the recorded run).

**Speaker notes.** In regulated industries, an AI score nobody can explain is a score nobody will accept, not the trainee, not HR and not the Compliance Officer. So trust is designed in at three points. The compliance gate mirrors real life: a great conversation with one forbidden promise still fails. This kind of explainability is what regional regulators ask for in their AI guidance [S13] and what MAS's competence expectations need as evidence [S29].

**Visual.** Report screenshot: a score card with its verified quote highlighted in the transcript, a citation chip to the Code of Conduct, and the red "Compliance: failed" banner with "capped at 59".

**Criteria.** **N** (trustworthy AI feedback, the differentiator); **T** (hallucination control).

---

## Slide 9. Impact

**Faster ramp, fewer senior hours, compliance mistakes caught in practice instead of in front of customers.**

- **Who benefits:** trainees (a safe place to fail), managers (objective readiness data), compliance teams (violations caught with evidence), customers (better-informed staff), and SMEs and nonprofits that could never staff role-play.
- **AI help lifts novices most:** in a study of 5,179 support agents, AI assistance raised issues resolved per hour by 14% on average and by 34% for novice and low-skilled workers [S3].
- **ROI for a 100-rep team (estimate):** about US$126k a year in value vs about US$40k cost, roughly 3x. Coaching time alone only breaks even; the case rests on ramp and retention, which the pilot measures.

**Speaker notes.** We are careful with impact claims. The evidence that AI assistance helps new workers most is strong and peer-reviewed [S3], and new hires are exactly our users. Our own ROI model is an estimate. We show it with its weak point: if SkillCoach only saved manager time, it would roughly break even. The value comes from faster ramp and lower early attrition, so the pilot is designed to prove or disprove exactly those numbers. Pilot KPIs: time to first solo call, compliance flags per 100 turns, manager hours per recruit, and AI-vs-assessor score agreement.

**Visual.** Left: "+34% for novices [S3]" as a large number. Right: a simple ROI bar (value US$126k vs cost US$40k, labeled "estimate") with the three value lines (manager time US$48k, faster ramp US$62.5k, lower attrition US$15k).

**Criteria.** **I** (who benefits, measurable outcome); theme fit (Future of Work).

---

## Slide 10. Feasibility and scalability

**Working today on managed Google Cloud; onboarding a new company means uploading documents, not writing code.**

- **Feasible now:** deployed on Cloud Run with real Gemini; no custom model training; a new tenant uploads documents, approves generated personas and reviews a scenario.
- **Scales:** stateless Cloud Run autoscaling, Firestore per tenant, Flash-Lite for the per-turn judgments to keep cost down; model cost is well under US$2 per seat per month at 8 sessions per rep **(estimate)**.
- **Honest limits:** live wording varies by run (behavior is anchored in seed rules and triggers); Gemini generation runs on the Vertex AI global endpoint while data at rest and embeddings stay in the APAC region [S27].

**Speaker notes.** Everything shown is running on the live service. The numbers we measured there: about 1 second for the Compliance Guard, about 5 seconds per full turn with the first words in 2 to 3 seconds, and about 6 seconds for the report. On data residency we are deliberately precise: documents, transcripts, scores and embeddings stay in the chosen APAC region, Gemini generation goes through the Vertex AI global endpoint because that is where Gemini 4 Argon and the 3.x models are served, and Vertex AI does not train on customer data [S27]. We never claim that data never leaves a country.

**Visual.** A latency strip from the live service: "Guard ~1 s · first token 2-2.7 s · turn ~5 s · report ~6 s · persona generation 18-40 s". Below it, a small data-residency box: "At rest + embeddings: asia-east1 · Gemini generation: Vertex AI global".

**Criteria.** **T** (engineering quality, platform use); **I** (feasibility).

---

## Slide 11. Market and business model

**Beachhead: insurance and financial advisors in Singapore. English first, built to localize.**

- **Beachhead:** about 19,000 insurance agents in Singapore [S30] sell regulated products in English under MAS fair-dealing rules [S29]. Next: contact centers and advisors in the Philippines and Hong Kong; then Taiwan, Japan and Korea after localization.
- **Category validated, APAC unserved:** Hyperbound raised US$15M [S16] and Second Nature US$22M [S17], both focused on US B2B selling; none is built around regulated-product compliance with verified evidence.
- **Pricing (hypothesis):** paid 8-week pilot US$5k-10k; Team US$25 per active seat per month; Enterprise US$35-45 with SSO, region pinning and LMS integration.

**Speaker notes.** Insurance is where all four pains meet: churn, untested new hires, compliance risk and know-how trapped in senior people, and the buyer already has a training budget line. Singapore lets us sell in English today under a regulator whose expectations map directly to evidence-backed practice. AI role-play itself is not new, so our wedge is specific: documents in, approved personas out, and a compliance gate with verbatim evidence. We price per active seat because agency headcount churns.

**Visual.** APAC map with three waves (Singapore; Philippines and Hong Kong; Taiwan, Japan, Korea), and a small competitor matrix: rows Hyperbound, Second Nature, Mindtickle/Allego, SkillCoach; columns "own-document personas with approval", "compliance gate with verbatim evidence", "APAC data at rest". Cells we cannot source for competitors read "not stated" (our assessment from public positioning, see [BUSINESS_CASE.md](BUSINESS_CASE.md) section 4).

**Criteria.** **I** (who benefits, breadth); **N** (positioning).

---

## Slide 12. Roadmap and team

**Now shipped: text practice, browser voice (Web Speech: speech-to-text input and spoken customer replies), a 3D customer avatar (VRM, lip sync, mood from the trust and patience meters), document-generated personas with approval, multi-agent turns, evidence-verified reports, manager readiness view.**

- **Next (planned):** Gemini Live native voice, on-device emotion cues, more APAC languages.
- **Later (planned):** LMS and CRM integration, scenarios from anonymized real calls, certification tracks, calibration against senior assessors.
- **Team:** `[Name, role, one-line background]` × N · live demo https://skillcoach-aibc.web.app · video `[URL]` · GitHub https://github.com/jease0502/SkillCoach-AIBC

**Speaker notes.** Everything under "Now" is in the deployed build and in the video. Everything else is labeled planned, and the next step is a paid 8-week pilot with a control cohort and pre-agreed KPIs. SkillCoach: practice the conversation before it counts.

**Visual.** Three-column roadmap (Now / Next / Later) with "Now" in solid color and the rest outlined; team photos or initials below; QR codes for the live URL, video and repo.

**Criteria.** **U** (honest scope); theme close.

---

## Appendix: criteria coverage

| Criterion (weight) | Slides |
| --- | --- |
| Technical Merit & GenAI (40%) | 6 Architecture, 7 How Gemini is used, 8 Trust by design, 10 Feasibility |
| Problem Alignment & Impact (25%) | 3 Problem, 5 Demo, 9 Impact, 11 Market |
| Innovation & Creativity (25%) | 4 Solution, 7 How Gemini is used, 8 Trust by design, 11 Market |
| UX & Solution Design (10%) | 4 Solution, 5 Demo, 12 Roadmap |
| Theme: Future of Work | 1, 2, 9 |

Before export: replace the remaining `[...]` placeholders (team name, members, video URL), add the source list ([BUSINESS_CASE.md](BUSINESS_CASE.md) section 12, S1-S30 as cited) as the final page, and take screenshots from the live URL (https://skillcoach-aibc.web.app), not localhost.

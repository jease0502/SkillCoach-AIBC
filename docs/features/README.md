# SkillCoach Feature Set

> **Implementation note:** `backend/app/schemas.py` is authoritative; fields below marked as future are not in the MVP. The specs below describe the full product; the API and models actually built are defined in [API_CONTRACT.md](../API_CONTRACT.md).

This index describes the full product as it would look when complete, and marks what is in scope for the AI Builder Cup 2026 build. The 3-day build plan and cut lines live in [scope-3day.md](../scope-3day.md); system design lives in [architecture.md](../architecture.md).

Priority legend:

- **Must**: required for the 3-day demo. The demo story does not work without it.
- **Should**: build if the Must items are done and stable; each one is independently cuttable.
- **Later**: designed for, not built during the hackathon. Never claimed in the demo or submission.

## End-to-end flow

```
Knowledge Base -> Persona Builder -> Scenario Builder -> Practice Session
                                                          |  per turn: Compliance Guard + Live Coach
                                                          v
                                                        Report -> Manager Dashboard
Admin/Workspace wraps everything (tenancy, roles, settings)
```

## Feature summary

| # | Feature | Priority | Spec |
| --- | --- | --- | --- |
| 1 | Knowledge Base | Must | (in architecture.md) |
| 2 | Persona Builder | Must (core) / Should (portrait, voice preview) | [persona-builder.md](persona-builder.md) |
| 3 | Scenario Builder | Must (core) / Should (quick scenario, timeline) | [scenario-builder.md](scenario-builder.md) |
| 4 | Practice Session | Must (text) / Should (voice) / Shipped (3D avatar) | (in architecture.md, section 9) |
| 5 | Live Coach | Must | (in architecture.md) |
| 6 | Compliance Guard | Must | (in architecture.md) |
| 7 | Report | Must | (in architecture.md) |
| 8 | Manager Dashboard | Should (minimal) / Later (full) | not yet written |
| 9 | Admin / Workspace | Later (single demo workspace for the hackathon) | not yet written |

## 1. Knowledge Base (Must)

A company uploads the material its staff are expected to know and follow: product sheets, FAQs, sales or service playbooks, and conduct or compliance policies (PDF, Markdown, plain text in the MVP; DOCX is future). The backend extracts text, splits it into chunks with stable ids that keep document title and section headings, embeds them with `gemini-embedding-001` (768 dims), and stores them in Firestore with their vectors. Future: document tags (`product`, `playbook`, `policy`) so generation and the Compliance Guard can prioritize policy text, and a PII scan at ingestion that warns before indexing documents that appear to contain customer data. Every other feature cites knowledge by chunk id, and a shared citation popover shows the exact passage. For the demo: upload, chunk, embed, search and citation popover; Later: connectors (Drive, SharePoint), document versioning and re-indexing diffs.

## 2. Persona Builder (Must)

Creates the AI customer the trainee will talk to. A trainer can generate a persona from a one-line brief, let Gemini read the knowledge base and propose three realistic customer segments to choose from, or fill in a form by hand. A persona has demographics, OCEAN personality, communication style, goals, hidden needs with reveal conditions, objections with trigger conditions, knowledge level, difficulty 1 to 5, a trust/patience emotional state machine driven by deterministic turn signals, locale, voice and avatar, and guardrails. Output is produced with Gemini structured output (`response_schema`) and validated server-side; real people and PII are rejected. Personas generated from documents carry citations and start as `draft`; a trainer approves them (`POST /api/personas/{id}/approve`), and only approved personas can back a scenario. The opening line is served verbatim. Must: brief and document generation, edit form, validation, approval, seeded approved personas. Should: Imagen portrait, voice preview. Later: persona test lab and VRM picker. See [persona-builder.md](persona-builder.md).

## 3. Scenario Builder (Must)

Turns a persona into a practice exercise: trainee role and goal, opening context, success criteria, compliance rules, a weighted rubric, a difficulty level, and branch events. The headline capability is generating the compliance rules and rubric from the company's own documents with Gemini, where every rule and rubric dimension carries citations whose quotes are verified to exist in the source chunks before a trainer can approve them. Branch events (for example "the customer mentions a competitor at turn 5 if trust is below 60") use the same small condition language as the persona and are evaluated in code each turn. Must: schema, generation with citation verification, review UI, difficulty and modes, basic events, two seeded scenarios. Should: one-line quick scenario and suggested events. Later: dry runs with a simulated trainee. See [scenario-builder.md](scenario-builder.md).

## 4. Practice Session (Must: text / Should: voice / Shipped: 3D avatar)

The trainee picks a scenario, reads the briefing and talks with the Gemini-played customer. Each trainee turn runs through the per-turn pipeline: Compliance Guard interception on Send (`/precheck`, "Edit message" / "Send anyway" on a high flag), compliance pre-check, persona reply grounded in the knowledge base, a grounding post-check on the persona reply (`compliance_post`), state update and a coach hint. Future: turn analysis signals for a full persona state machine and a director note. The screen shows the transcript, compliance flags inline with icon and label, the coach panel and, in training mode, the customer's mood. Text mode is always available and is the demo baseline. Shipped: voice through the browser Web Speech API (speech-to-text input, spoken customer replies) with transcripts for every voice turn. Shipped: a 3D customer avatar (VRM 1.0 via three.js and `@pixiv/three-vrm`) with idle breathing, blinking, eye contact, lip sync while the reply streams or is spoken, and a facial mood driven by the trust and patience meters; it falls back to the initials avatar without WebGL. Planned: Gemini Live native voice. Later: on-device facial-expression cues feeding the coach. Sessions store a frozen snapshot of the scenario and persona versions for reproducible reports.

## 5. Live Coach (Must)

A `gemini-3.5-flash-lite` agent that watches the conversation from the trainee's side and gives one short, actionable hint for the next turn ("Acknowledge the cost concern before talking about coverage"), citing the playbook passage it relies on. It also emits the turn signals (needs question, empathy, product pitch, objection ignored, and so on) that move the persona's trust and patience meters. Hint frequency and specificity follow the scenario's difficulty, and the coach is switched off in assessment mode. Must: per-turn hint with citation and signals. Later: post-turn "try again" rewind and suggested phrasing alternatives.

## 6. Compliance Guard (Must)

Checks every trainee turn against the scenario's approved compliance rules, using each rule's description, examples and cited policy quote, and returns the violated rule id, severity, the offending span and a compliant rewrite. A post-check on the persona's reply flags ungrounded product claims so the AI customer does not teach wrong facts. In the MVP, severities are `low`, `medium` and `high`; any high-severity violation fails the report's compliance gate (`compliance_passed = false`, overall score capped at 59). Future: a `critical` level, mood changes and branch events driven by violations. Must: pre-check on trainee turns with rule citations, post-check on persona turns. Later: per-company custom severity policies and an audit export for compliance teams.

## 7. Report (Must)

At session end, a long-context `gemini-4-argon` call (fallbacks `gemini-3.1-pro-preview`, `gemini-2.5-pro`) scores the full transcript against the scenario rubric and success criteria. Every score quotes the trainee's own words, and the server verifies each quote exists in the transcript and each citation exists in the knowledge base; anything that fails is shown as "unverified" rather than silently, and a dimension with no verified evidence is capped at 50. The compliance gate (`compliance_passed`) fails on any high-severity violation and caps the overall score at 59. The report shows the overall score and pass/fail, per-dimension scores with evidence, compliance flags with the policy passage, the trust/patience chart annotated with turn signals and branch events, hidden needs that were or were not uncovered, and three concrete things to practice next. Must: scored report with verified evidence and the meter chart. Should: side-by-side comparison with a previous attempt to show improvement. Later: PDF export and LMS integration.

## 8. Manager Dashboard (Should, minimal)

Gives managers aggregated visibility: average scores per rubric dimension, most frequently violated compliance rules, recent session summaries, and a "Ready to go live" count (`Dashboard.ready_count`: ended sessions that passed the compliance gate with an overall score of 80 or more). The dashboard shows aggregates plus session summaries, no transcripts. The value is deciding where to spend coaching time based on evidence rather than impressions. Should (hackathon): one page with a per-skill bar chart, a "top violated rules" list, recent session summaries and the "Ready to go live" count over the demo data. Later: per-trainee views (with trainee consent), pass rates per scenario and report drill-down. Later: cohorts, trends over time, assignments with due dates, and alerts for repeated critical violations.

## 9. Admin / Workspace (Later)

Multi-tenant workspaces with roles (admin, trainer, trainee, viewer), SSO, invitations, data retention settings, per-workspace model and region choices, usage and cost reporting, and audit logs. For the hackathon there is a single demo workspace with a simple role switch (trainer / trainee) in the UI and no real authentication beyond what Cloud Run deployment requires; data model fields (`workspace_id` on every document) are kept so tenancy can be added without a migration.

## Recommended demo cut

The Must subset that tells the full story in a 3-minute video:

1. Upload two or three documents to a knowledge base (Knowledge Base).
2. Click "Find customers in my documents", pick a persona draft, check its citations and approve it (Persona Builder).
3. Click "Generate from documents" in the Scenario Builder; show a compliance rule with its verified citation; approve and publish.
4. Run a text session: one compliance flag with the policy quote, one coach hint, the customer raising a competitor objection via a branch event (Practice Session, Compliance Guard, Live Coach).
5. Open the report: compliance gate result, rubric scores with verified quotes from the trainee, the trust/patience chart, the missed hidden need (Report).

Seeded personas and scenarios exist for every step so a slow or failed live generation never blocks the recording.

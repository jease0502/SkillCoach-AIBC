# SkillCoach Business Case

Why would an enterprise pay for an AI role-play coach? This document answers that as a skeptic would. Every number has a source in the [Sources](#12-sources) section. Anything we modeled ourselves is labeled **(estimate)**.

Context: Google Cloud AI Builder Cup 2026, theme "Future of Work & Enterprise Productivity". Date of analysis: 2026-10-15.

---

## 1. Executive summary

- **Beachhead: English-speaking APAC financial services, starting with Singapore.** The primary segment is insurance agents, financial adviser (FA) representatives and bancassurance advisors in Singapore: a workforce of roughly 19,000 insurance agents [S30] that sells regulated products in English under MAS fair-dealing expectations and Financial Advisers Act (FAA) conduct rules [S29][S21]. A single bad sentence ("this product guarantees your principal") is a conduct failure. Next come the English-speaking contact-center and advisor workforces in the Philippines and Hong Kong. Taiwan, Japan and Korea are the expansion wave once the product is localized: **English first, built to localize.** The economic buyer is the Head of Agency Training or the Chief Distribution Officer. The Chief Compliance Officer co-signs.
- **The acute pain is practice, not content.** Insurers already own the manuals. What they lack is enough realistic, scored practice before a new hire meets a real customer. Today that practice depends on senior staff role-playing with each recruit. It doesn't scale, nobody measures it, and it disappears when those seniors leave. Regional evidence of how costly this is: in Taiwan, fewer than half of newly recruited life-insurance sales reps are still in the role after one year [S9].
- **Fines alone do not justify the budget, and we will not pretend they do.** Regulators across the region do act (MAS penalties on FA firms and individual representatives [S21], HK$66.4M against Hang Seng Bank [S20], about NT$54.9M across 34 cases from Taiwan's Insurance Bureau in 2024 [S11]), but per firm the fines are small. The money is in **ramp time, early attrition and freed coaching hours**. Compliance is what turns a nice-to-have into something a regulated buyer can approve: every score is backed by the trainee's own words and the company's own documents. That supports the MAS expectation that firms only let representatives advise independently after they have shown competence [S29], and the explainability regional regulators ask for in AI guidance [S13].
- **The category is validated, but no one serves it in APAC.** Hyperbound raised US$15M (Sept 2025) [S16] and Second Nature raised US$22M (Oct 2025) [S17]. Mindtickle and Allego ship AI role-play inside their enablement suites [S18][S19]. All of them focus on US B2B/SaaS selling. None is built around regulated-product compliance with verified verbatim evidence and a pass/fail compliance gate, or around persona generation from the customer's own documents with citations and human approval, with data at rest in an APAC region on GCP.
- **ROI hypothesis for a 100-rep team:** about US$126k in annual value against about US$40k in cost, roughly 3x **(estimate)**. The coaching-time saving alone only breaks even. The case depends on ramp and retention gains, so the pilot is designed to prove or kill exactly those numbers.

---

## 2. Target customers and buyer personas

### Who pays and who uses

| Role | In the deal | What they care about | What they need to see |
|---|---|---|---|
| Head of Agency / Sales Training (L&D) | **Economic buyer** (training budget owner) | Time-to-first-sale, cohort pass rate, trainer capacity | Ramp and certification data per cohort |
| Chief Distribution Officer / Head of Agency | Sponsor; owns the sales target | Productive agents, 13-month persistency | Revenue per new agent, early attrition |
| Chief Compliance Officer | **Co-signer, and can veto** | Mis-selling, complaints, fair-dealing outcomes (MAS) / Treating Customers Fairly (TCF), audit trail | Violations caught in practice, with evidence; explainable AI |
| CIO / CISO | Gatekeeper | Data residency, tenant isolation, no training on company data | Region pinning for data at rest, honest disclosure of where inference runs, IAM, logging, DPA |
| Unit / branch manager | Daily user (coach) | Knowing who is not ready, without sitting in every role-play | Team skill-gap dashboard |
| New agent / RM / service rep | Daily user (trainee) | Not looking stupid in front of a real customer; passing certification | Private, unlimited, low-stakes practice with specific feedback |

### Ranked segments

| Rank | Segment | Why it fits | Why not first / risks |
|---|---|---|---|
| **1 (beachhead)** | **Insurance agents, FA representatives and bancassurance advisors in Singapore** | English is the working language, so the English-first MVP fits today. About 19,000 insurance agents [S30]. MAS fair-dealing guidelines expect firms to make sure representatives are competent before they advise on their own, and to supervise fact-finds, needs analyses and recommendations [S29]. MAS takes enforcement action against FA firms and individual representatives [S21]. Regulated selling with explicit forbidden claims (guaranteed returns, unbalanced disclosure). | Long procurement cycles at large insurers. IT security reviews. Smaller absolute headcount than North Asian markets. |
| 2 | English-speaking contact-center and advisor workforces in the Philippines and Hong Kong | Philippine contact centers: 43-45% attrition [S6], 39% globally [S7], huge volume. Hong Kong bank RMs and advisors: strict suitability rules and large penalties (Hang Seng Bank HK$66.4M, Jan 2025 [S20]). | Contact centers: lower willingness to pay per seat and need high-volume voice. HK banks: even stricter IT controls. |
| 3 (expansion wave) | Life insurance and bancassurance in Taiwan, Japan and Korea, after localization | The pains are the same and well documented. In Taiwan, fewer than 50% of new reps are retained after year 1 [S9], disclosure for investment-linked policies is an inspection focus [S12], TCF evaluation is used as a regulatory qualification [S14], and sales-solicitation complaints rose from 90 to 109 (ombudsman cases from 45 to 75) between Q1 2025 and Q1 2026 [S15]. | Needs Mandarin, Japanese or Korean practice, which is roadmap, not MVP. Large insurers, long cycles. |
| 4 | B2B / SaaS sales teams | Proven buyers of this category | Crowded: Hyperbound, Second Nature, Mindtickle already lead. No home advantage for us. |
| 5 | Healthcare front desk, public service, education | Strong social value | Slow budgets. Saved for later "platform" expansion. |

**Why insurance first, and why Singapore:** insurance is the only segment where all four pains show up together: churn, untested new hires, compliance risk, and knowledge trapped in senior people. And the buyer already has a budget line for agent training and licensing. Singapore lets us sell that value in English today, under a regulator (MAS) whose fair-dealing expectations map directly onto evidence-backed practice. North Asian markets have the same pains and bigger cohorts, so they are the second wave once localization is built. The demo should use an investment-linked insurance or fund-selling scenario.

---

## 3. Jobs-to-be-done and pain points

**Core job (trainee):** "Before I talk to a real customer, help me practice the conversation I'm most afraid of until I can handle it without breaking rules."

**Core job (training lead):** "Get every new recruit to a known, verified level of skill and compliance, quickly, without tying up my best people."

| # | Pain | Quantified cost | Source / basis |
|---|---|---|---|
| P1 | **New hires quit before becoming productive** | Regional evidence from Taiwan: fewer than 50% of newly recruited life-insurance reps retained after one year, every year for a decade [S9]. Contact centers: 39% average attrition globally in 2024 [S7], 43-45% in the Philippines [S6]. B2B AEs: about 32% annual turnover [S5]. | Each departure throws away recruitment, licensing and training spend |
| P2 | **Ramp time is long and expensive** | B2B AE ramp is about 4.7-5.7 months (Bridge Group 2024 as reported; figures conflict) [S5]. During ramp, a rep earns base pay or allowance and produces well below quota. | Every month of ramp saved is pure gross margin |
| P3 | **Practice depends on senior people's time** | Formal learning time is shrinking: 17.4 h to 13.7 h per employee per year (ATD, 2023 to 2024) [S1]. Live human-operated simulation costs about US$49 per 30-minute session (Mursion, as reported) [S23]. A unit manager role-playing 2 h/month with each of 10 recruits spends 20 h/month **(estimate)**. | Doesn't scale. Inconsistent. Nothing recorded. |
| P4 | **Training does not stick** | The forgetting curve is real (Ebbinghaus). The popular "80-90% forgotten within 30-90 days" figures are vendor estimates with no primary study, so we do **not** quote them as fact [S24]. The best-known simulation study (PwC, VR soft skills) reports learners trained up to 4x faster than in classroom and up to 275% more confident to act. It was vendor-run on a single course, so we treat it as directional only [S28]. | Lectures and e-learning check completion, not ability |
| P5 | **Mis-selling and conduct risk** | SG: MAS composition penalty against Singlife FA for weak supervision of representatives (2025) [S21]; MAS fair-dealing guidelines on representative competence and supervision [S29]. HK: Hang Seng HK$66.4M [S20]. TW: Insurance Bureau, about NT$54.9M in fines across 34 cases (2024) [S11], and FSC 2H2025 findings on unbalanced disclosure for investment-linked policies [S12]. | The direct fines are small. The real costs are remediation, complaints, TCF ranking, licence actions against individuals, and reputation. |
| P6 | **Knowledge trapped in people** | 42% of institutional knowledge is unique to the individual. Inefficient knowledge sharing costs an average large US firm about US$47M/yr, about US$4.5M of it in onboarding (Panopto 2018, survey-modeled) [S25]. | When a top agent leaves, their objection-handling playbook leaves with them |
| P7 | **Managers can't see readiness** | Only a minority of sales organizations run formal "dynamic" coaching (11.3% in CSO Insights 2017). Formal coaching is associated with about 53.6% vs 44.7% win rates (CSO Insights, via secondary sources) [S26]. | Today, decisions about who is ready for customers are made on gut feel |

Overall spending context: the average organization spends about US$1,254 per employee per year on learning (ATD 2025 report, 2024 data) [S1]. US training expenditure totals about US$102.8B [S2]. Buyers already have this money. SkillCoach has to win a share of an existing line, not create a new one.

---

## 4. Current alternatives and why they fail

| Alternative | What it is | Why it fails for our beachhead |
|---|---|---|
| Senior-agent / manager role-play | The gold standard today | Expensive, inconsistent, limited by schedules, not recorded, and the role-player's bias becomes the standard. Disappears when seniors leave (P6). |
| Classroom + e-learning + licensing exam | Product and regulation lectures, quizzes | Tests recall, not live conversation under pressure. Training hours are shrinking [S1]. |
| Call recording / conversation intelligence (Gong, Chorus) | Analyzes *real* calls after the fact | Learning happens on real customers, so mistakes have already happened. Heavy US focus. In insurance, many sales conversations are face-to-face and never recorded. |
| Human-operated simulations (Mursion) | Actors drive avatars | About US$49+ per session [S23]. Needs scheduling. Doesn't scale to thousands of agents. |
| AI role-play SaaS (Second Nature, Hyperbound, Yoodli) | AI buyer persona, scoring | Built for US English B2B/SaaS discovery and cold calls. Personas are written by hand from generic templates. Scoring is not tied to the customer's regulatory rulebook and does not show verbatim evidence. Data hosting is not APAC-first. |
| Enablement suites (Mindtickle, Allego) | LMS + content + AI role-play module | Strong but heavy. Bought as a whole suite. Allego claims 32 languages [S19], so multilingual support alone is **not** our moat. Compliance grounding is generic. Priced and sold for global enterprise sales organizations, not for insurers' agency channels. |
| Generic chatbot (consumer ChatGPT / Gemini app) | Ad-hoc "pretend to be a customer" | No company knowledge, no rubric, no audit trail, no manager view. Company data leaves governed systems. |

**Honest read:** AI role-play is not novel in itself. A buyer will ask "why not just add the Mindtickle module?" Our answer has to be specific to regulated selling (Section 5), or we lose.

---

## 5. Why us: differentiation

1. **Personas and scenarios generated from the company's own documents.** An admin uploads a product manual or a policy. SkillCoach proposes customer personas with demographics, personality, hidden needs, typical objections, difficulty, voice and avatar. Each generated persona carries citations to the source passages it came from. Personas start as `draft`; the admin reviews and approves them (`draft` to `approved`), and only approved personas can back a scenario. Scenario compliance rules and rubric items carry citations too. The alternative is hand-writing scenarios, which is the main cost of every competitor's rollout.
2. **Compliance-gated scoring with verbatim evidence.** Every turn gets a compliance check before and after. Before a score is accepted, the server checks that every quoted piece of evidence appears word-for-word in the transcript. Evidence that doesn't match is marked unverified and is never shown as fact, and a dimension with no verified evidence is capped at 50. Any high-severity violation fails the compliance gate (`compliance_passed = false`) and caps the overall score at 59, no matter how high the average is. This is exactly the explainability and human-centred fairness the Taiwan FSC's 2024 AI guidelines ask for [S13], and it is what a Compliance Officer needs before signing.
3. **RAG-grounded customers and coaching.** The AI customer asks questions that the real product can answer. Coach hints and the final report cite the company's own manual (document + section). When the knowledge base has no answer, the system says so ("missing") instead of making one up.
4. **English first, built to localize.** The MVP runs in English (en-US), text first. Local terms (product names, regulatory phrases) come from the company's own documents, and every persona has a `locale` field, so additional APAC languages and native-audio voice (Gemini Live API) are roadmap items to validate with pilot customers, not shipped features.
5. **Gemini on Google Cloud, with honest data residency.** Company documents, transcripts and scores are stored at rest in the customer-selected APAC region (for a Singapore customer that would be `asia-southeast1`; the hackathon build uses `asia-east1`). Gemini generation runs through the Vertex AI `global` endpoint, because the Gemini 3.x models we use are served only there; embeddings, Cloud Run and Firestore run in `asia-east1`. Per the Vertex AI data residency page (checked Oct 2026), ML processing guarantees for Google models are listed for Japan (`asia-northeast1`) and Singapore (`asia-southeast1`) among other regions, but **there is no Taiwan column for Gemini ML processing** [S27]. We tell the buyer exactly where processing happens, and we do not claim "data never leaves Taiwan". Regional inference for regulated tenants is a roadmap option, at the cost of using models that are offered regionally. Vertex AI does not use customer data to train foundation models, which goes in the DPA.
6. **Manager view of readiness, not just activity.** The dashboard shows aggregates plus session summaries, no transcripts: average scores by rubric dimension, the most violated compliance rules, and a "Ready to go live" count (sessions that passed the compliance gate with an overall score of 80 or more). Trends over time and per-recruit certification tracks are roadmap items.

Moat over time **(hypothesis)**: a library of compliant personas and rubrics per product type and regulator (e.g. "TW investment-linked policy, FSC disclosure rules"), plus calibration data that matches AI scores to the judgments of each customer's senior assessors.

---

## 6. Why now

- **Real-time voice role-play is now cheap and fast enough.** Native-audio streaming models (Gemini Live API) make a natural spoken customer feasible on an ordinary laptop. A few years ago this needed human actors [S23].
- **Evidence that AI assistance helps novices most.** In a study of 5,179 support agents, AI help raised issues resolved per hour by 14% on average and by 34% for novice and low-skilled workers (NBER working paper; the QJE 2025 version reports 15% on average) [S3]. New agents are exactly that group.
- **Regulators expect competent representatives, explainable AI and fair treatment.** MAS fair-dealing guidelines (May 2024 version) on representative competence and supervision [S29]. Taiwan FSC AI core principles (Oct 2023) and guidelines (June 2024) [S13]. TCF ranking is used as a regulatory qualification [S14]. 2H2025 inspections focused on disclosure for investment-linked products [S12]. MAS is tightening penalties on individuals [S21]. HKMA/SFC fined Hang Seng HK$66.4M [S20].
- **Training time is shrinking** (ATD: 17.4 h to 13.7 h per employee) [S1]. Practice has to be short, on demand and targeted.
- **The category has funding, but it's US-centric.** Hyperbound US$15M (2025) [S16], Second Nature US$22M (2025) [S17]. Gartner predicts that sales organizations with AI-driven enablement will reach 40% faster sales-stage velocity by 2029 [S4]. The window to own the APAC regulated-selling niche is open now.

---

## 7. ROI model: worked example for a 100-rep team

**Scenario:** an APAC insurer's agency channel (for example in Singapore) onboards and supports 100 customer-facing reps per year. Inputs are deliberately conservative: Singapore salaries are higher than the cost assumptions below, which would raise line A. All values are in US$. **Every input below is an assumption (estimate)** unless a source is given. Change them for each customer.

| Input | Value | Basis |
|---|---|---|
| Reps on the platform | 100 | Scenario |
| Manager role-play/coaching time today | 2 h per rep per month | Estimate |
| Share of that drill time moved to SkillCoach | 50% | Estimate (managers keep reviewing reports and doing final certification) |
| Loaded manager cost | US$40/h | Conservative regional estimate (below Singapore levels) |
| Ramp to full productivity | 4 months | Estimate; B2B benchmarks are 4.7-5.7 months [S5] |
| Ramp reduction from structured practice | 0.5 month | Estimate (hypothesis to test in pilot) |
| Contribution of a fully ramped rep | US$2,500/month gross margin | Estimate |
| Productivity during ramp | 50% | Estimate |
| First-year attrition baseline | 50% | Regional evidence: Taiwan reps have below 50% retention at year 1 [S9] |
| Attrition reduction | 5 percentage points (50% to 45%) | Estimate (hypothesis to test) |
| Replacement cost per rep (recruit + licensing + training) | US$3,000 | Estimate; US non-exec recruiting alone averages US$5,475 (SHRM, as reported) [S8] |

**Value per year (estimate)**

| Line | Calculation | Value |
|---|---|---|
| A. Manager time freed | 100 x 2 h x 12 x 50% x US$40 | **US$48,000** |
| B. Faster ramp | 100 x 0.5 month x US$2,500 x 50% | **US$62,500** |
| C. Lower early attrition | 100 x 5% x US$3,000 | **US$15,000** |
| D. Compliance risk reduction | Not monetized. Fines are small per firm [S11]. Value shows up as fewer complaints, TCF ranking and licence protection. | US$0 in model |
| **Total** | | **US$125,500** |

**Cost per year (estimate):** 100 seats x US$25/month x 12 = US$30,000, plus about US$10,000 for onboarding (knowledge ingestion, persona and rubric setup, calibration) = **US$40,000**.

**Result:** about 3.1x return. Payback in about 4 months.

**Sensitivity (where a skeptical CFO will push):**
- With only line A (no ramp or retention gain), value is US$48k against US$40k cost. That is roughly break-even, so **the product cannot be sold as a pure cost cut.**
- If the ramp gain is 0.25 month instead of 0.5, line B falls to US$31k and the total to about US$94k (2.4x).
- Running cost per session **(estimate)**: a 15-20 turn text session uses about 6 model calls per turn (compliance pre/post, persona, coach, scorer, retrieval). With Flash-class models that is on the order of US$0.05-0.20 per session. Voice adds a few cents per minute. At 8 sessions per rep per month, model cost is well under US$2/seat/month, which leaves room for a healthy SaaS margin at US$25.

---

## 8. Pricing hypothesis

| Tier | Price (hypothesis) | Includes |
|---|---|---|
| **Paid pilot** | US$5k-10k flat for 8 weeks, up to 50 seats | Ingestion of up to 20 documents, 5 scenarios, calibration with 2 senior assessors, pilot readout |
| **Team** | US$25/active seat/month (annual), minimum 50 seats | Text + voice practice, document-generated personas, compliance rule pack, manager dashboard |
| **Enterprise** | US$35-45/seat/month or site licence | SSO/SCIM, region pinning for data at rest, audit export, custom rubrics per product line, LMS integration, dedicated tenant |
| Onboarding services | US$10k-30k one-off | Knowledge ingestion, rubric design with Compliance, assessor calibration |

Rationale: we price under US competitors (for example, one third-party report cites Yoodli at about US$600/user/year [S22]; Mursion around US$49 per human-run session [S23]) to fit APAC agency budgets. We charge per *active* seat because agency headcount churns heavily, and buyers resist paying for agents who have already left. An alternative to test: price per *certified recruit* (e.g. US$60-100 per recruit who passes the readiness gate), which ties our revenue to the buyer's main KPI.

---

## 9. Risks, objections and mitigations

| Objection | Why it's real | Mitigation (in product) |
|---|---|---|
| "The AI customer will say things about our product that aren't true." | LLM hallucination teaches the wrong facts | Persona answers grounded in RAG, with chunk-level citations on the reply. Persona rules forbid inventing product facts, and a post-check reviews each reply. Generated personas carry citations and must be approved before any scenario can use them. Retrieval status labels (`retrieved` / `not_needed` / `missing`) are a roadmap item. Sampled hallucination audit is a pilot KPI. |
| "Can I trust the AI score?" | Unexplained scores get rejected by trainees and by HR | Verbatim evidence checking (unmatched quotes marked unverified). Dimensions without verified evidence capped at 50. Compliance acts as a pass/fail gate (high-severity violation fails, overall capped at 59). Calibration against senior assessors with agreement measured (Section 10). Manager overrides with an audit log are a roadmap item. |
| "Employees will feel watched; unions or works councils will object." | Practice data being used in performance reviews kills honest practice | Practice mode is private to the trainee by default. The dashboard shows aggregates plus session summaries (scores, no transcripts) and a "Ready to go live" count; transcripts stay private unless the trainee shares. Retention period and purpose configured per tenant. Camera-based emotion sensing is off by default and runs on-device if used. |
| "Our data can't leave the country / can't train your model." | Financial-sector IT policy | GCP region pinning for data at rest (`asia-east1` in the build). Inference through the Vertex AI global endpoint, disclosed honestly ([S27]: no Taiwan Gemini ML-processing guarantee today). Vertex AI does not train on customer data. Tenant isolation in retrieval and a full audit log are on the roadmap. |
| "Agents won't use it after week 2." | Adoption is the #1 failure of L&D tools | Short (5-10 min) scenarios. Tied to the licensing/certification gate ("you can't go live until you pass"). Manager nudges. Weekly "scenario of the week" taken from real complaint themes. |
| "We already have Mindtickle / Allego." | Incumbents are in the account | Position as the regulated-selling module: document-generated personas plus compliance evidence. Integrate through LMS (SCORM/xAPI completion) instead of replacing. |
| "The ROI is speculative." | It is, until measured | A paid pilot with a control cohort and pre-agreed KPIs (Section 10). We say openly that coaching-time savings alone only break even. |
| Gaming the scorer / prompt injection | Trainees try to "jailbreak" the customer | Pre-turn compliance and injection screening. Persona guardrails against leaking hidden needs. Flagged attempts are logged. |

---

## 10. Pilot success metrics / KPIs

8-week pilot, 2 cohorts: about 40-50 recruits using SkillCoach and a comparable control cohort using existing training.

| Category | KPI | Target (hypothesis) |
|---|---|---|
| Adoption | Practice sessions per active trainee per week | 2 or more |
| Adoption | Weekly active trainees / enrolled | 70% or more |
| Trust | AI vs senior-assessor score agreement (weighted Cohen's kappa on rubric dimensions) | 0.6 or higher |
| Trust | Evidence quotes that match the transcript verbatim (after server check) | 100% of displayed evidence |
| Trust | Persona factual errors vs knowledge base (sampled audit) | Below 2% of turns |
| Skill | Score change from first to fifth attempt on the same scenario | +15 points or more |
| Compliance | Critical compliance flags per session, first week vs last week | Down 50% or more |
| Business (lagging) | Days to first policy / first sale vs control | 10%+ faster |
| Business (lagging) | 90-day retention of cohort vs control | +5 pts |
| Manager | Hours of manager role-play time per recruit vs control | Down 40% or more |
| Satisfaction | Trainee "this prepared me for real customers" (5-pt) | 4.0 or higher |

Decision rule agreed with the buyer before the pilot: convert if trust KPIs are met **and** at least one business KPI beats the control.

---

## 11. Key one-liners for the pitch deck and video

- "Your agents' first difficult customer shouldn't be a real one."
- "Upload your product manual. Get a realistic customer who knows it, and a coach who checks every sentence against your rules."
- "Every score quotes the trainee's own words. No verified evidence, no score above 50."
- "Across APAC, new insurance agents churn fast; in Taiwan fewer than half last a year. SkillCoach gives them unlimited practice before they meet a customer."
- "MAS expects advisers to be competent before they advise on their own. SkillCoach shows the evidence."
- "One serious compliance slip fails the session, however good the rest was, just like in real life."
- "Your best agent's know-how, turned into a persona the whole team can practice against."
- "Built on Gemini and Google Cloud, with your data stored at rest in your APAC region."
- "Managers see who is ready for customers, not who clicked through the e-learning."

---

## 12. Sources

Numbers marked "as reported" come from secondary summaries. We could not check them against the paid or primary report and say so wherever they are used.

- [S1] ATD, *State of the Industry* benchmarks (2024 report for 2023 data: US$1,283/employee, 17.4 h; 2025 report for 2024 data: 13.7 h, about US$1,254/employee). https://www.td.org/content/atd-blog/benchmarks-and-trends-from-the-2025-state-of-the-industry-report ; https://trainingcost.com/atd-state-of-the-industry
- [S2] Training magazine, *2025 Training Industry Report* (US total about US$102.8B; per-learner spend as reported by secondary summary). https://trainingmag.com/2025-training-industry-report/
- [S3] Brynjolfsson, Li, Raymond, *Generative AI at Work*, NBER w31161 (14% average, 34% novices); QJE 2025, doi:10.1093/qje/qjae044. https://www.nber.org/papers/w31161
- [S4] Gartner press release, 2026-04-01, AI-driven sales enablement and 40% faster sales-stage velocity by 2029. https://www.gartner.com/en/newsroom/press-releases/2026-04-01-gartner-predicts-ai-driven-sales-enablement-will-deliver-40-percent-faster-sales-stage-velocity-than-traditional-enablement-methods-by-20291
- [S5] Bridge Group SaaS AE metrics (ramp 4.7-5.7 months, about 32% turnover), as reported. https://www.jiminny.com/blog/saas-sales-benchmarks ; https://stealthagents.com/research/cost-of-hiring-an-account-executive-2026
- [S6] Philippine contact center attrition (45% total in 2022). https://newsbytes.ph/2024/05/28/attrition-rates-in-ph-contact-center-firms-continue-to-go-down/
- [S7] Contact center attrition 2024 (NICE 39% global), as reported. https://stealthagents.com/research/bpo-agent-attrition-statistics-2026
- [S8] SHRM cost-per-hire (US$5,475 average, non-executive), as reported. https://www.outsourceaccelerator.com/glossary/agent-turnover/
- [S9] National Central University thesis citing FSC Insurance Bureau indicators: first-year retention of newly recruited life-insurance sales reps below 50% over ten years. https://etd.lib.ncu.edu.tw/detail/56554d0867235710166b1752acffa4ba
- [S10] LOMA, *Increasing Agent Retention* (illustrative Asian four-year retention). https://loma.org/en/news/marketfacts/2025/increasing-agent-retention-a-leadership-driven-approach
- [S11] Commercial Times (CTEE), Insurance Bureau 2024 sanctions: 34 cases, about NT$54.9M. https://www.ctee.com.tw/news/20250115700472-430301 ; Taipei Times 2024. https://www.taipeitimes.com/News/biz/archives/2024/09/16/2003823832
- [S12] Asia Insurance Review, 26 Mar 2026: FSC 2H2025 findings on non-guaranteed payout disclosure and solicitation irregularities. https://www.asiainsurancereview.com/News/View-NewsLetter-Article/id/94934/Type/eDaily
- [S13] Baker McKenzie / Lee and Li on FSC *Guidelines for the Use of AI in the Financial Industry* (June 2024) and core principles (Oct 2023). https://connectontech.bakermckenzie.com/taiwan-financial-supervisory-commission-has-published-the-guidelines-for-the-application-of-ai-in-the-financial-industry/ ; https://www.leeandli.com/EN/Newsletters/7287.htm
- [S14] Lee and Li on TCF ranking used as a regulatory qualification. https://www.leeandli.com/EN/Newsletters/7498.htm ; Fubon TCF top-25% announcement. https://www.fubon.com/financialholdings/en/news/news_1230821_614478.htm
- [S15] UDN (Q1 2025 vs Q1 2026 insurance solicitation complaints and ombudsman cases). https://udn.com/news/story/7239/9659254 ; CTEE on overall ombudsman case growth. https://www.ctee.com.tw/news/20241211702001-430301
- [S16] Hyperbound US$15M Series A (Sept 2025). https://www.hyperbound.ai/blog/series-a
- [S17] Second Nature US$22M Series B (Oct 2025). https://pulse2.com/second-nature-22-million-series-b-raised-for-expanding-ai-based-sales-and-service-training
- [S18] Mindtickle AI role-play. https://www.mindtickle.com/blog/best-ai-role-play-tools/
- [S19] Allego AI role-play (32 languages claim). https://www.allego.com/ai-sales-coaching
- [S20] HKMA / HK Government press release, Hang Seng Bank HK$66.4M (27 Jan 2025). https://www.hkma.gov.hk/eng/news-and-media/press-releases/2025/01/20250127-4 ; https://www.info.gov.hk/gia/general/202501/27/P2025012700352.htm
- [S21] MAS enforcement actions Q3 2025. https://www.mas.gov.sg/news/media-releases/2025/key-regulatory-and-enforcement-actions-taken-by-mas-in-q3-2025 ; MAS penalties on bank employees (May 2024). https://www.caproasia.com/2024/05/10/singapore-mas-chairman-lawrence-wong-on-increasing-penalties-on-bank-employees-for-mis-selling-poor-advice-7-year-prohibition-order-issued-for-mis-selling-in-the-past-mas-investigates-take/
- [S22] Yoodli pricing (third-party review, anecdotal). https://www.outdoo.ai/blog/yoodli-review-and-pricing ; https://yoodli.ai/pricing
- [S23] Inc., Mursion session cost (about US$49 per 30-minute session). https://www.inc.com/sophie-downes/mursion-virtual-reality-simulation-empathy-workplace-training-learning.html
- [S24] Forgetting-curve claims in sales training (vendor estimates, no primary study). https://customerthink.com/?p=919736
- [S25] Panopto, *Workplace Knowledge and Productivity Report* (2018), via HR Dive. https://www.hrdive.com/news/inefficient-knowledge-sharing-costs-large-us-businesses-47m-a-year/527892/
- [S26] CSO Insights coaching findings, as reported. https://qstream.com/leading-research-firms-emphasize-critical-need-effective-sales-coaching/ ; https://trainingindustry.com/magazine/mar-apr-2020/driving-sales-training-results-through-manager-coaching/
- [S27] Google Cloud, Vertex AI generative AI data residency (checked 2026-10-15). https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency
- [S28] PwC VR soft-skills study (up to 4x faster than classroom, up to 275% more confident; vendor-run, single course). https://www.pwc.com/us/vlearning ; https://www.strategy-business.com/article/Virtual-reality-creates-a-new-environment-for-employee-training
- [S29] MAS, *Guidelines on Fair Dealing: Board and Senior Management Responsibilities for Delivering Fair Dealing Outcomes to Customers* (FAA-G11, May 2024 version), including expectations on representative competence and supervision. https://www.mas.gov.sg/-/media/mas-media-library/fair-dealing-guidelines-30-may-2024.pdf
- [S30] Insurance Business Asia, Singapore insurance agent numbers (about 19,000 since 2015; 19,219 in 2020, per a parliamentary reply), as reported. https://www.insurancebusinessmag.com/asia/news/breaking-news/singapore-insurance-agent-numbers-remain-steady-251457.aspx

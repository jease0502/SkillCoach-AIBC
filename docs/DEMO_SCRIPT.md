# Demo Script: Scenario Cards

Read these lines and the behaviors will trigger. The conversation is a real Gemini call, not a replay, so the customer's **wording varies** every time; the **behavior** listed under "Expected" is what should be stable.

Behaviors are made reliable by four things fixed in the seed data:
1. The **opening line** is served verbatim by the server (`Scenario.opening_line` if set, otherwise `Persona.opening_line`; no model call).
2. **Compliance rules** are explicit `ComplianceRule` entries on the scenario, with citations to the Code of Conduct in the knowledge base, so the pre-check has an unambiguous rule to match.
3. The persona has a **hidden concern** that the coach is instructed to steer toward.
4. The seeded personas are already **approved** (`status: approved`), because only approved personas can back a scenario.

What the live guard does: when the trainee presses **Send**, the UI first calls `POST /api/sessions/{id}/precheck` (target under 2 s, nothing stored). If any high-severity flag comes back, the message is held back and the **Compliance Guard card** shows the rule, the quoted phrase, and **Edit message** / **Send anyway**. If the pre-check times out (over 2.5 s), the message is simply sent.

What the report enforces, for every card:
- **Evidence verification:** every quote in the report is checked against the transcript. Unmatched quotes are shown as unverified, and a dimension with no verified evidence is capped at 50.
- **Compliance gate:** any high-severity violation sets `compliance_passed = false` and caps the overall score at 59.

Before demoing:
- Pre-warm the Cloud Run service (open the app once, run one turn).
- Use **text mode** for reliability; voice is optional/planned.
- Optional opener for the video: generate a persona from the uploaded documents, show its citation chips, and click **Approve** (`POST /api/personas/{id}/approve`). Use the seeded scenarios for the cards below so a slow generation never blocks the recording.
- Run each card end to end once before recording. Lines marked "Verified" were run end to end against the deployed build with real Gemini (cards A and C: 2 live runs each, 2026-10-16); everything else is `TODO: verify`.

---

## Scenario A: B2B SaaS sales, pricing objection (high-score path)

**Knowledge base:** `Acme Analytics product sheet` (Pro plan USD 49/user/month, volume pricing 10% below list for 100+ users, guided onboarding with 78% weekly active users after 90 days, 30-day free pilot for up to 20 users, SOC 2 Type II, TLS 1.2+ / AES-256, 99.9% uptime SLA), `Sales playbook` (acknowledge, clarify, respond with value, confirm).

**Persona:** Dana Kim, CFO of a 200-person logistics company. Busy, numbers-driven. Real concern: her team abandoned the last tool after a few weeks (adoption risk, not price). She raises it when asked what happened with the previous tool.

**Trainee goal:** uncover the real concern and propose a next step.

This is the run that counts toward **ready**: lines 1 and 3 to 6 only. Every answer has to be complete, because Dana follows up on anything left open (encryption, the price gap).

| # | Trainee says | Expected system response |
| --- | --- | --- |
| 1 | *(do nothing)* | Opening line (verbatim): "I have ten minutes. Your quote is 30% higher than the tool we tried last year. Why should I pay more?" Trust 35, patience 60. **Verified** |
| 2 | *Optional detour, skip it for the ready run:* "Our product is the best on the market, so it's worth the price." | Dana: "Every vendor says they're the best. Show me something concrete." Trust drops about 5. **Coach hint:** ask what happened with the previous tool before pitching (cites the Sales playbook). Including this line costs about 20 points on *discovery* (overall 72 to 85, so ready is not guaranteed). **Verified** |
| 3 | "That's fair to ask. Before I answer, what happened with the tool you tried last year?" | Dana reveals the real concern: "Honestly? My team stopped using the last tool after a few weeks... Why would yours be any different?" Trust goes up. Coach hint: address adoption with the pilot and onboarding evidence. **Verified** |
| 4 | "That makes sense, and it's exactly the risk to remove. Every Pro plan includes guided onboarding: two live training sessions for your team leads, ready-made logistics dashboards, and a weekly adoption report. Customers on that program average 78% weekly active users after 90 days, and you can prove it first in a 30-day free pilot. Does that address the adoption concern?" | Dana softens ("the onboarding and pilot sound reasonable") and **asks about security**. No flags. Trust goes up. **Verified** |
| 5 | "On security, we're SOC 2 Type II certified, data is encrypted in transit with TLS 1.2+ and at rest with AES-256, and Pro includes a 99.9% uptime SLA. On price, teams of 100 or more get our published volume pricing, 10 percent below the Pro list price. Could we kick off the pilot with two of your team leads next Tuesday?" | Dana accepts the security answer and **agrees to the pilot**, usually asking for the terms in writing. No PR-01 flag: volume pricing is published. (Say "10 percent below", not "10% off"; the keyword guard treats "N% off" as a discount offer.) **Verified** |
| 6 | "Great. I'll email the pilot terms and our security documentation today: 30 days, up to 20 users, no credit card, and it only converts if you choose to continue. Shall we say Tuesday at 10 a.m. with your two team leads?" | Dana confirms: "Tuesday at 10 a.m. works." Trust ends around 50. **Verified** |
| End | Click **End session** | Report: **Compliance: passed**, no violations. Overall **100** in both live runs (discovery, objection handling, accuracy and closing all 100), with verified quotes from lines 3 to 6. Counts toward ready. **Verified** |

--- | --- | --- |
| 1 | *(do nothing)* | Opening line (verbatim): "I have ten minutes. Your quote is 30% higher than the tool we tried last year. Why should I pay more?" |
| 2 | "Our product is the best on the market, so it's worth the price." | **Coach hint:** acknowledge and ask before pitching (cites the Sales playbook). Persona stays unconvinced. Scorer later marks *objection handling* low, quoting this line. |
| 3 | "That's fair to ask. Before I answer, what happened with the tool you tried last year?" | Persona reveals the hidden concern: the team stopped using it. Coach hint switches to: address adoption with evidence. |
| 4 | "Our Pro plan includes a 30-day free pilot, so your team can prove adoption before you commit." | Persona reply carries a **citation chip** to the product sheet (30-day pilot). Persona softens and asks about security. |
| 5 | "We're SOC 2 Type II certified and offer a 99.9% uptime SLA. Could we set up the pilot with two of your team leads next week?" | Citation to product sheet. Persona agrees to a next step. |
| End | Click **End session** | Report: **Compliance: passed**. High scores for *discovery*, *accuracy*, *closing*; each score quotes lines 3 to 5 (verified) with citations. *Objection handling* shows improvement note referencing line 2 vs line 3. |

---

## Scenario B: Insurance advisor, compliance trap

**Knowledge base:** `Retirement Savings Plan brochure` (variable investment-linked plan; historical average return 5.2%, past performance not indicative of future results; 15-day free-look period), `Code of Conduct` with rules:
- `CC-01` Never promise or imply guaranteed returns on investment-linked products.
- `CC-02` Always disclose that the value of investments can go down as well as up.
- `CC-03` Do not pressure the customer to decide in the same meeting.

**Persona:** Mr. Tan, 63, recently retired, cautious, wants safety. Hidden concern: his savings must cover his wife's medical costs.

| # | Trainee says | Expected system response |
| --- | --- | --- |
| 1 | *(do nothing)* | Opening line (verbatim): "My son said I should invest my retirement money. Can you promise I won't lose any of it?" |
| 2 | "Don't worry, this plan guarantees you 8% a year." | **Signature moment. Compliance Guard intercepts on Send: high severity, rule CC-01.** The message is held back; the card shows the quoted phrase "guarantees you 8% a year", the rule message, and **Edit message** / **Send anyway**. For the demo, click **Send anyway**: the turn is sent, the `compliance_pre` flag is recorded on it, the customer replies, and the report will fail the compliance gate. (Clicking **Edit message** instead returns the text to the input box with nothing sent.) |
| 3 | "You need to sign today, the offer ends tonight." | **Compliance flag: rule CC-03** (pressure, medium severity in the seed): shown inline, no interception card. |
| 4 | "I can't promise that. Historically the plan has averaged 5.2%, but past performance doesn't guarantee future results, and the value can go down as well as up." | No flag. Persona reply carries **citations** to the brochure. Persona asks what happens if he needs money for medical costs. |
| 5 | "That's an important point. May I ask what you'd need that money for, and when?" | Persona reveals hidden concern. Coach hint: consider whether this product suits his liquidity needs; mention the 15-day free-look period (cites brochure). |
| End | Click **End session** | Report: **Compliance: failed** (high-severity CC-01), overall score capped at 59 even though lines 4 and 5 are strong. Violations list quotes lines 2 and 3 and cites CC-01 / CC-03; *accuracy* and *empathy* scores credit lines 4 and 5 with verified quotes. |

---

## Scenario C: Customer support, escalation (medium flag, then recovery)

**Knowledge base:** `Refund & Returns Policy` (RR-01 cash refunds only within 30 days with receipt; RR-02 outside 30 days: store credit at manager discretion or warranty repair; RR-03 escalate to a supervisor if the customer asks, callback the same business day; RR-04 always give a time frame: store credit approved within 2 business days, warranty repair 7 to 10 business days), `Support tone guide` (acknowledge emotion, state what you can do, give a time frame, listen for the story).

**Persona:** Alex Morgan, angry customer; headphones broke on day 41. Hidden concern: they were a birthday gift for a friend, and Alex feels embarrassed. Alex shares this only after an apology, real options and a gentle question.

| # | Trainee says | Expected system response |
| --- | --- | --- |
| 1 | *(do nothing)* | Opening line (verbatim): "These headphones died after a month and a bit. I want my money back. Now." Trust 25, patience 50. **Verified** |
| 2 | "Sure, I'll refund you in full right away." | **Compliance flag RR-01 (medium)** on "I'll refund you in full right away" from the pre-check. It is medium, so there is no interception card; the flag shows inline. Alex is surprised ("Wait, really?"). **Coach hint:** correct the refund promise, offer store credit or a warranty repair with time frames (cites the Refund policy). **Verified** |
| 3 | "I'm sorry, I spoke too soon, and that's on me. I can see how frustrating this is. Since it's past 30 days I can't do a cash refund, but I can request store credit, arrange a warranty repair, or connect you with my supervisor today. Which would you prefer?" | No flag. The retraction feels like a bait-and-switch, so Alex gets angrier and rejects store credit ("You literally just told me you were giving me my money back"). Patience drops. This is the low point; trust stays flat or rises slightly. **Verified** |
| 4 | "Of course. I'm requesting a supervisor callback for you right now, and you'll hear from them today. I'm sorry again for the mixed message earlier. Can I ask, were these for something special?" | **Recovery:** trust keeps rising (+2 to +4), and Alex reveals the story: "They were a birthday present for my friend... it was embarrassing." No flag. **Verified** |
| End | Click **End session** | Report: **Compliance: passed** (the medium RR-01 flag is listed under violations but does not fail the gate). *Policy accuracy* is low and quotes line 2. *Empathy* (100) quotes line 3. *De-escalation* (100) quotes lines 3 and 4. Overall 81 in both live runs (policy accuracy 50 because of line 2). **Verified** |

Alternative line 3 for a tone demo: "Calm down, it's not my fault." This gives a **TONE-01 (low)** flag, Alex demands a manager, and trust falls close to 0. It needs two more good turns to recover, so it is not part of the main path.

--- | --- | --- |
| 1 | *(do nothing)* | Opening line (verbatim): "These headphones died after a month and a bit. I want my money back. Now." |
| 2 | "Sure, I'll refund you in full right away." | **Compliance flag (medium): refund outside the 30-day policy.** Medium severity, so no interception card; the flag shows inline. If the customer's reply repeats an unsupported promise, the grounding post-check (`compliance_post`, `GROUNDING`) flags it; scorer later cites the Refund policy. |
| 3 | "Calm down, it's not my fault." | **Coach hint:** acknowledge emotion first (cites Support tone guide). Persona escalates: "I want to talk to your manager." |
| 4 | "I'm sorry this happened, that's really frustrating. Since it's past 30 days I can't do a cash refund, but I can request store credit or connect you with my supervisor today. Which would you prefer?" | No flag. **Citation** to the Refund policy (store credit, escalation rule). Persona calms down and mentions the gift. |
| End | Click **End session** | Report: *policy accuracy* low for line 2, *empathy* low for line 3, both quoted; *de-escalation* high for line 4 with citations. The medium-severity flag does not fail the compliance gate. |

---

## If something doesn't trigger

- **No Compliance Guard card on Scenario B line 2:** check that the scenario's rules include CC-01 as high severity and the Code of Conduct document is loaded. Retype exactly: "guarantees you 8% a year". If the pre-check took longer than 2.5 s the message is sent without the card; the inline flag still appears. Pre-warm and retry.
- **No citation chip:** the persona answered from general knowledge; retry the turn. If it repeats, check that embeddings finished indexing.
- **Slow first turn:** Cloud Run cold start. Pre-warm before recording.
- **Report shows "unverified" quotes or a score capped at 50:** the model paraphrased instead of quoting. Retype the line exactly as written in the card and end the session again.
- **Scenario cannot be created from a generated persona (409):** approve the persona first.

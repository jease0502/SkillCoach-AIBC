# Feature Spec: Scenario Builder

Status: Draft for the AI Builder Cup 2026 build (3-day scope)
Priority: **Must** (schema, generated rules and rubric with citations, difficulty, basic branch events) / Should (event timeline editor, one-click quick scenario) / Later (dry run with a simulated trainee)
Related: [Persona Builder](persona-builder.md), [Feature index](README.md), [Architecture](../architecture.md)

> **Implementation note:** `backend/app/schemas.py` is authoritative; fields below marked as future are not in the MVP.
>
> - **MVP `Scenario` fields:** `id`, `title`, `description`, `persona_id`, `trainee_goal`, `context` (string), `success_criteria` (list of strings), `compliance_rules` (`id`, `rule`, `severity` `low|medium|high`, `citations`), `rubric` (list of `RubricItem`: `id`, `name`, `description`, `weight` as a float, `citations`), `branch_events` (`id`, `trigger` and `event` as free text), `document_ids`, `difficulty`, `max_turns`, `opening_line` (overrides `Persona.opening_line`; served verbatim), `created_at`.
> - **MVP `Citation`:** `chunk_id`, `document_title`, `quote`.
> - **Severity and gate:** there is no `critical` severity in the MVP. Any `high` violation fails the report's compliance gate (`Report.compliance_passed = false`, `overall_score` capped at 59).
> - **Persona:** the scenario's persona must be `approved` (not "published"); otherwise the API returns `409`.
> - **Future (not in the MVP):** `workspace_id`, `version`, `status`, `summary`, `locale`, `skill_focus`, the `trainee`, `context`, `knowledge`, `difficulty` and `coaching` objects, machine-checkable `success_criteria`, rule `type` / `title` / examples / `origin` / `approved`, rubric `levels` and `pass_score`, Condition-based `when` and typed `action` on branch events, `provenance`, frozen session snapshots, citation `verified` flags.
> - **MVP API:** `POST /api/scenarios/generate` and CRUD on `/api/scenarios` (see [API_CONTRACT.md](../API_CONTRACT.md)). The endpoints in Section 7 are future.

---

## 1. Purpose

A scenario is what a trainee actually picks and practices. It combines:

```
Scenario = Persona + trainee goal + context + success criteria + compliance rules + rubric
           + difficulty + branch events
```

The key value for a company: compliance rules and the scoring rubric are **generated from its own documents, with citations to the exact passages**. A trainer does not write a rubric from scratch; they review and approve one that already points to the policy text. Those same citations later appear in the Compliance Guard flags, the Live Coach hints and the final report, so every judgment the product makes can be traced back to company knowledge.

### Non-goals (for the hackathon)

- Multi-stage curricula (scenario sequences, prerequisites).
- Branching dialogue trees authored by hand. Branch events nudge an LLM persona; they do not script it.
- Scenario marketplace or sharing across workspaces.

---

## 2. Scenario JSON (stored shape)

Stored in Firestore at `workspaces/{workspaceId}/scenarios/{scenarioId}`. At session start the server copies a frozen snapshot of the scenario, persona version and rule set into the session document, so later edits never change an existing report.

### 2.1 Example

```json
{
  "id": "scn_21c9",
  "workspace_id": "ws_demo",
  "version": 2,
  "status": "published",
  "title": "Existing policy, reluctant owner: coverage gap review",
  "summary": "An SME owner who already has a policy agreed to a short call. Discover his real concern before discussing any product.",
  "locale": "en-US",
  "industry": "Insurance / small business",
  "skill_focus": ["needs_discovery", "objection_handling", "compliance"],
  "persona": { "persona_id": "per_7f3a", "pin_version": null },
  "trainee": {
    "role": "Small business insurance advisor",
    "goal": "Get the owner to agree to a coverage gap review using his own numbers.",
    "briefing": "Referred by his accountant. You have 20 minutes. Do not quote premiums before discovery."
  },
  "context": {
    "setting": "Video call, Tuesday afternoon, the owner is between print jobs.",
    "opening_line": "I've got about twenty minutes. I already have insurance, so what's this about?",
    "opener": "persona",
    "max_turns": 16,
    "time_limit_seconds": 900
  },
  "knowledge": { "kb_ids": ["kb_ins"], "persona_can_cite": false },
  "success_criteria": [
    {
      "id": "sc_discovery",
      "description": "Asked about business continuity before presenting any product.",
      "check": { "kind": "llm_judge", "question": "Before any product was described, did the trainee ask at least two questions about the business, its people or its current coverage?" },
      "required": true
    },
    {
      "id": "sc_hidden_need",
      "description": "Uncovered the key-person concern.",
      "check": { "kind": "hidden_need_revealed", "hidden_need_id": "hn_keyperson" },
      "required": true
    },
    {
      "id": "sc_trust",
      "description": "Customer trust at 65 or higher at the end.",
      "check": { "kind": "final_meter_gte", "meter": "trust", "value": 65 },
      "required": false
    },
    {
      "id": "sc_no_critical",
      "description": "No critical compliance violation.",
      "check": { "kind": "no_violation_at_or_above", "severity": "critical" },
      "required": true
    }
  ],
  "compliance_rules": [
    {
      "id": "cr_no_guarantee",
      "title": "No guaranteed claim outcomes",
      "type": "forbidden_claim",
      "severity": "critical",
      "description": "Advisors must not promise that a claim will be paid or state a payout amount as certain.",
      "violation_examples": ["This will definitely cover you if anything happens."],
      "compliant_examples": ["Whether a claim is paid depends on the policy terms; let's look at what is covered."],
      "citations": [
        { "chunk_id": "kb_ins_07#c04", "quote": "Representatives shall not guarantee claim approval or benefit amounts." }
      ],
      "origin": "generated",
      "approved": true
    },
    {
      "id": "cr_disclose_not_advice",
      "title": "Disclose that the call is not tax advice",
      "type": "required_disclosure",
      "severity": "medium",
      "description": "If tax treatment is discussed, the advisor must say it is not tax advice.",
      "applies_when": "Tax or deductions are mentioned",
      "violation_examples": ["You can write all of this off, don't worry."],
      "compliant_examples": ["Premiums may be deductible, but please confirm with your accountant; this isn't tax advice."],
      "citations": [
        { "chunk_id": "kb_ins_07#c09", "quote": "Any discussion of tax treatment must be accompanied by a statement that it does not constitute tax advice." }
      ],
      "origin": "generated",
      "approved": true
    }
  ],
  "rubric": {
    "pass_score": 70,
    "dimensions": [
      {
        "id": "rd_discovery",
        "name": "Needs discovery",
        "weight": 30,
        "description": "Uncovers the customer's situation and real concern before proposing anything.",
        "levels": [
          { "score": 1, "descriptor": "Pitches immediately; no questions about the customer." },
          { "score": 2, "descriptor": "Asks generic questions; does not follow up." },
          { "score": 3, "descriptor": "Asks relevant questions and follows up on at least one answer." },
          { "score": 4, "descriptor": "Uncovers the hidden need and summarizes it back to the customer." }
        ],
        "citations": [
          { "chunk_id": "kb_ins_03#c02", "quote": "Complete a needs analysis before recommending any product." }
        ]
      },
      { "id": "rd_objection", "name": "Objection handling", "weight": 25, "description": "...", "levels": [], "citations": [] },
      { "id": "rd_accuracy",  "name": "Product accuracy",   "weight": 20, "description": "...", "levels": [], "citations": [] },
      { "id": "rd_compliance","name": "Compliance",         "weight": 15, "description": "...", "levels": [], "citations": [] },
      { "id": "rd_rapport",   "name": "Rapport and clarity", "weight": 10, "description": "...", "levels": [], "citations": [] }
    ]
  },
  "difficulty": { "level": 3, "mode": "training", "adaptive": true, "persona_overrides": null },
  "coaching": { "live_hints": true, "hint_every_n_turns": 1, "show_meters_to_trainee": false },
  "branch_events": [
    {
      "id": "ev_competitor",
      "label": "Customer mentions a competitor quote",
      "when": [{ "kind": "turn_gte", "value": 5 }, { "kind": "meter_lt", "meter": "trust", "value": 60 }],
      "min_difficulty": 2,
      "once": true,
      "action": {
        "kind": "inject_objection",
        "text": "Honestly, another broker quoted me less last month.",
        "category": "competitor",
        "resolved_by": ["evidence_provided", "objection_addressed"]
      }
    },
    {
      "id": "ev_time_pressure",
      "label": "Customer runs short on time",
      "when": [{ "kind": "meter_lt", "meter": "patience", "value": 30 }],
      "min_difficulty": 1,
      "once": true,
      "action": { "kind": "director_note", "text": "Say you have five minutes left and ask the trainee to get to the point." }
    },
    {
      "id": "ev_writing",
      "label": "Customer asks for it in writing after a guarantee",
      "when": [{ "kind": "rule_violated", "rule_id": "cr_no_guarantee" }],
      "min_difficulty": 1,
      "once": true,
      "action": { "kind": "director_note", "text": "Ask the trainee to put that promise in an email." }
    }
  ],
  "provenance": {
    "rules_model": "gemini-4-argon",
    "rubric_model": "gemini-4-argon",
    "generated_at": "2026-10-16T10:02:00Z",
    "source_chunk_ids": ["kb_ins_03#c02", "kb_ins_07#c04", "kb_ins_07#c09"]
  },
  "created_at": "2026-10-16T10:02:00Z",
  "updated_at": "2026-10-16T10:15:12Z"
}
```

The rubric dimensions after the first are abbreviated in this example; in a real scenario every dimension has a description and 4 levels.

### 2.2 Field reference

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title`, `summary` | string (max 100 / 300) | yes | Shown on the scenario card to trainees. |
| `locale` | BCP-47 | yes | Must equal the persona's locale (validated). |
| `skill_focus` | list of enum `needs_discovery\|objection_handling\|product_knowledge\|compliance\|closing\|de_escalation\|empathy` | yes | Used for dashboard grouping and as a hint to rubric generation. |
| `persona` | `{ persona_id, pin_version }` | yes | `pin_version: null` means "latest published at session start". |
| `trainee` | `{ role, goal, briefing }` | yes | `goal` is one sentence; `briefing` is what the trainee reads before starting. |
| `context` | object | yes | `setting`, `opening_line`, `opener` enum `persona\|trainee`, `max_turns` 4 to 40, `time_limit_seconds` optional. |
| `knowledge` | `{ kb_ids, persona_can_cite }` | yes | KBs used by the Compliance Guard, Live Coach, scorer and persona retrieval. |
| `success_criteria` | 1 to 6 objects | yes | `check.kind` enum: `llm_judge`, `hidden_need_revealed`, `objection_resolved`, `final_meter_gte`, `no_violation_at_or_above`, `rubric_min` (`dimension_id`, `value`). Machine-checkable kinds are preferred; `llm_judge` is evaluated by the scorer with evidence quotes. |
| `compliance_rules` | 0 to 15 objects | yes | See Section 2.3. |
| `rubric` | object | yes | 3 to 6 dimensions; weights are integers summing to 100; each dimension has 4 levels. `pass_score` 0 to 100. |
| `difficulty` | object | yes | Section 4. |
| `coaching` | object | yes | Live Coach switches. Forced off in assessment mode. |
| `branch_events` | 0 to 8 objects | no | Section 5. |
| `provenance` | object | server | Models used and all chunk ids cited. |

### 2.3 Compliance rule

| Field | Notes |
| --- | --- |
| `type` | enum `forbidden_claim` (must never say), `required_disclosure` (must say when `applies_when`), `restricted_topic` (must deflect, e.g. medical diagnosis), `process_step` (must do before X, e.g. verify identity before discussing account). |
| `severity` | enum `low\|medium\|high\|critical`. `critical` violations fail the session; `high` and `critical` emit the `compliance_violation` turn signal that moves persona meters. |
| `applies_when` | Optional natural-language trigger for disclosures and process steps. |
| `violation_examples`, `compliant_examples` | 1 to 3 each. Passed to the Compliance Guard prompt as few-shot examples; this is the main lever for guard precision. |
| `citations` | 1 or more `{ chunk_id, quote }`. Required for `origin: generated`. |
| `origin` | `generated` or `manual`. Manual rules may have no citation but are labeled "Trainer-authored" in flags and reports. |
| `approved` | A generated rule is inactive until a trainer approves it. |

---

## 3. Auto-generating compliance rules and the rubric from company docs

### 3.1 Pipeline

```
Trainer clicks "Generate from documents"
  1. Retrieve   multi-query embedding search over scenario.knowledge.kb_ids
                queries = trainee.goal, skill_focus labels, and fixed probes:
                "prohibited statements", "must not promise or guarantee",
                "required disclosure", "before recommending", "pricing rules",
                "complaints and escalation", "product limits and exclusions"
                plus all chunks from documents tagged "policy" at upload
                -> dedupe -> cap ~60 chunks / ~40k tokens
  2. Generate   two Gemini calls in parallel (Pro, temperature 0.2):
                  a. RuleSet     (compliance rules)
                  b. RubricDraft (dimensions, levels, success criteria suggestions)
  3. Verify     server checks every citation (3.4)
  4. Review     trainer sees cards with citation chips; approves, edits or deletes
```

The fast tier (`GEMINI_FAST_MODEL`, `gemini-4-argon` with thinking `low`, fallback `gemini-3.8-flash`, on the `global` endpoint) is used. Measured on live `gemini-4-argon` (2026-10-16, two runs, nothing saved): 3 personas from documents in 36-40 s, a scenario in 26-30 s, a persona from a brief in 18-29 s, with every returned citation verified against the source text (106 of 106). That is about 3x slower than `gemini-3.8-flash` (13 s / 11 s / 9 s), with richer, more heavily cited drafts. Only serious problems (no compliance rules extracted when rule sources exist, or fewer than 2 rubric items) trigger a retry.

### 3.2 Chunk formatting in the prompt

```
[kb_ins_07#c04] (Sales Conduct Policy, section 3.2)
Representatives shall not guarantee claim approval or benefit amounts. ...

[kb_ins_03#c02] (Advisor Playbook, Discovery)
Complete a needs analysis before recommending any product. ...
```

Chunk ids are opaque strings created at ingestion (`{doc_id}#c{n}`). The prompt states that the only valid ids are the ones shown.

### 3.3 Structured output schemas (google-genai SDK)

```python
class Citation(BaseModel):
    chunk_id: str
    quote: str            # verbatim span from the chunk, 5 to 40 words

class RuleDraft(BaseModel):
    title: str
    type: Literal["forbidden_claim", "required_disclosure", "restricted_topic", "process_step"]
    severity: Literal["low", "medium", "high", "critical"]
    description: str
    applies_when: str | None = None
    violation_examples: list[str]
    compliant_examples: list[str]
    citations: list[Citation]

class RuleSet(BaseModel):
    rules: list[RuleDraft]

class LevelDraft(BaseModel):
    score: int = Field(ge=1, le=4)
    descriptor: str

class DimensionDraft(BaseModel):
    name: str
    weight: int = Field(ge=5, le=60)
    description: str
    levels: list[LevelDraft]         # exactly 4
    citations: list[Citation]

class CriterionDraft(BaseModel):
    description: str
    kind: Literal["llm_judge", "no_violation_at_or_above", "final_meter_gte"]
    question: str | None = None

class RubricDraft(BaseModel):
    dimensions: list[DimensionDraft]  # 3 to 6
    pass_score: int = Field(ge=0, le=100)
    suggested_success_criteria: list[CriterionDraft]

resp = client.models.generate_content(
    model=settings.gemini_pro_model,
    contents=[build_rules_prompt(scenario, chunks)],
    config=types.GenerateContentConfig(
        system_instruction=RULES_SYSTEM,
        response_mime_type="application/json",
        response_schema=RuleSet,
        temperature=0.2,
        max_output_tokens=8192,
    ),
)
rules: RuleSet = resp.parsed
```

`RULES_SYSTEM` (abridged):

```
You are a compliance analyst. From the company documents below, extract the rules a
front-line employee must follow in the described conversation.

- Only extract rules that are stated or clearly implied in the documents. Do not add
  general industry rules that are not in the text.
- Every rule needs at least one citation: a chunk id shown below and a quote copied
  word for word from that chunk. Never paraphrase inside "quote". Never invent ids.
- Severity: critical = legal or regulatory breach or a promise the company cannot
  keep; high = misleading or materially incomplete; medium = missing required
  disclosure or process step; low = style or best practice.
- Write violation and compliant examples as things an employee would actually say,
  in the scenario's locale.
- Return at most 12 rules, most severe first. Merge duplicates.
```

`RUBRIC_SYSTEM` follows the same pattern: dimensions must reflect the trainee goal and `skill_focus`; level 4 descriptors must be observable in a transcript (no "shows confidence"); weights sum to 100; each dimension cites the playbook or policy passage that defines good practice when one exists (citations may be empty for generic dimensions such as rapport, which are then labeled "General practice").

### 3.4 Citation verification (server, deterministic)

For every citation:

1. `chunk_id` exists in the scenario's KBs. Otherwise drop the citation.
2. `quote` is a substring of the chunk text after normalization (lowercase, collapse whitespace, unify quotes and dashes). If not exact, accept a fuzzy match with token-level similarity of at least 0.9 against a window of the chunk and replace `quote` with the actual text from the chunk.
3. Record `verified: true|false` on the citation.

Then:

- A generated rule with zero verified citations is kept but marked `unverified`, shown with a warning, and cannot be approved until the trainer adds a citation or converts it to `manual`.
- Rubric weights are normalized to sum to 100 (largest remainder rounding) and the trainer is told if normalization changed them by more than 5 points.
- Near-duplicate rules (same type, title similarity above 0.8) are merged, keeping all citations.

This is the same "quotes must exist" rule the scorer uses for transcript evidence, applied to knowledge evidence.

### 3.5 Downstream use

- **Compliance Guard**: receives only approved rules, with examples and the cited quote, and returns `rule_id`, severity, and the offending span of the trainee's turn.
- **Live Coach**: may cite the same chunk ids when suggesting a better phrasing.
- **Scorer and Report**: each dimension score quotes the transcript (validated) and links the rubric dimension's citation, so the trainee sees "what you said" next to "what the policy says".

---

## 4. Difficulty settings

`difficulty.level` (1 to 5) overrides the persona's own difficulty for this scenario and applies the persona presets (initial trust and patience, active objection count, reveal threshold, negative delta multiplier; see the Persona Builder, Section 3.3). It also controls scenario-level knobs:

| Level | Branch events active | Live hints | Hint style | Max turns default |
| --- | --- | --- | --- | --- |
| 1 | `min_difficulty <= 1` | every turn | concrete suggested phrasing | 12 |
| 2 | `<= 2` | every turn | concrete suggestion | 14 |
| 3 | `<= 3` | every turn | direction only, no phrasing | 16 |
| 4 | `<= 4` | every 2 turns | direction only | 18 |
| 5 | all | only after a compliance flag | direction only | 20 |

Other fields:

- `mode`: `training` (hints on, adaptive allowed) or `assessment` (hints off, meters hidden, no adaptation, so results are comparable across trainees).
- `adaptive` (training only): after 2 consecutive strong turns (`objection_addressed` or `evidence_provided`, no negative signal) the next unreleased objection is released early; after 2 consecutive weak turns one pending secondary objection (from a branch event) is dropped and the next hint becomes concrete. Adaptive changes never alter the scoring rubric and are logged in the report.
- `persona_overrides`: optional `{ initial_trust, initial_patience }` for trainers who want a specific starting state.

---

## 5. Branch events

Branch events let a trainer add realistic turns of the conversation without scripting dialogue: the customer mentions a competitor at turn N, gets impatient when patience drops, or reacts to a compliance slip.

### 5.1 Model

| Field | Notes |
| --- | --- |
| `id`, `label` | `label` appears in the report timeline ("Turn 6: Customer mentioned a competitor quote"). |
| `when` | Condition list (ANDed). Uses the shared Condition language from the Persona Builder (Section 4.4) plus two scenario-only kinds: `rule_violated` (`rule_id`) and `violation_at_or_above` (`severity`). |
| `min_difficulty` | Event is active only when `difficulty.level >= min_difficulty`. |
| `once` | Fire at most once (default true). If false, `cooldown_turns` (default 3) applies. |
| `action.kind` | `inject_objection` (adds a new active objection with `text`, `category`, `resolved_by`), `director_note` (one-turn instruction to the persona), `adjust_meter` (`meter`, `delta`), `reveal_hidden_need` (`hidden_need_id`), `end_session` (`reason`, persona closes the call in character). |

### 5.2 Runtime

Events are evaluated by the Director in code, once per trainee turn, after meters are updated and before the persona reply is generated:

```
for ev in scenario.branch_events (in list order):
    if ev inactive for difficulty, or already fired and once, or in cooldown: skip
    if evaluate(ev.when, state, turn):
        apply ev.action           # at most one inject_objection or end_session per turn
        log {turn, event_id, label, action}
```

The resulting objection or note is included in the persona's `director_note` block, so the persona says it in its own voice and style. Fired events are visible to trainers live (if they observe) and to everyone in the report.

### 5.3 Generated suggestions

When rules and rubric are generated, the builder also asks the fast tier for up to 3 suggested events (`BranchEventDraft` schema, same shape as above) grounded in the documents, for example the competitor names or the objection types the playbook mentions. Suggestions start disabled; the trainer enables the ones they want.

---

## 6. Validation

Blocking on publish:

- Persona exists, is published, and has the same locale.
- At least one `required` success criterion. Criteria referencing `hidden_need_id`, `objection_id`, `rule_id` or `dimension_id` point to existing items.
- Rubric: 3 to 6 dimensions, 4 levels each, integer weights summing to 100.
- Every approved generated rule has at least one verified citation.
- Branch event conditions are valid for their `kind`; no more than 8 events; an `end_session` event cannot fire before turn 3.
- No PII in any free-text field (same scanner as the Persona Builder).

Warnings: no compliance rules at all; rubric dimension with no citation; `max_turns` below the number of objections plus 3.

---

## 7. API

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /api/scenarios:generate-rules` | `{ "scenario": partial Scenario }` | `{ "rules": Rule[], "unverified_count" }` |
| `POST /api/scenarios:generate-rubric` | `{ "scenario": partial Scenario }` | `{ "rubric", "suggested_success_criteria", "suggested_events" }` |
| `POST /api/scenarios:quick` (Should) | `{ "brief", "kb_ids", "locale" }` | full draft scenario plus a new persona draft |
| `POST /api/scenarios`, `PUT /api/scenarios/{id}` | `Scenario` | saved scenario |
| `GET /api/scenarios` | | trainer list; trainees get the public card fields only |
| `GET /api/chunks/{chunk_id}` | | chunk text and document metadata for citation popovers |

---

## 8. UI flow (wizard)

Route: `/scenarios/new` (also opened from the Persona Builder with the persona preselected). Six steps; Back/Next; draft autosaved to the server as `status: draft` after step 1.

1. **Basics**: title, summary, locale, skill focus chips, persona picker (cards with public summary and difficulty; "Create new persona" link), knowledge base multi-select.
2. **Trainee and context**: trainee role, goal (one line, required), briefing; setting, opening line, who opens, max turns, optional time limit.
3. **Rules and rubric**: a single "Generate from documents" button (progress text: "Reading 42 passages...", target under 25 s). Two columns:
   - Compliance rules as cards sorted by severity: title, severity badge (icon plus text), description, examples (collapsed), citation chips. Clicking a chip opens the passage in a side panel with the quote highlighted. Actions per card: Approve, Edit, Delete. "Approve all verified" bulk action. Unverified cards show a warning and an "Add citation" picker.
   - Rubric: dimension table with weight inputs (live sum indicator), expandable 4-level descriptors and citations. "Add dimension" for manual ones.
4. **Success criteria**: suggested criteria from generation as toggles, plus "Add criterion" (kind select, then matching inputs). Each criterion has a Required switch.
5. **Difficulty and events**: difficulty slider 1 to 5 with a summary of what changes (from Section 4), mode toggle (training / assessment), adaptive switch. Branch events list: each row shows the label and a readable sentence generated from its condition and action ("When turn is 5 or later and trust is below 60, the customer raises: 'Another broker quoted me less...'"). Add or edit with the same condition builder used in the Persona Builder. Suggested events appear disabled with an Enable button. (Should: a horizontal turn timeline showing turn-based events.)
6. **Review and publish**: read-only summary of everything, validation results (errors block publish), and a "Try it now" button that publishes and starts a practice session as the trainer.

Accessibility: severity and verification state always use icon plus text; all citation popovers are reachable by keyboard; weight inputs announce the running total.

---

## 9. Build plan and acceptance (3-day scope)

**Must**

- `Scenario` model, validation, Firestore persistence, frozen snapshot at session start.
- Rule and rubric generation (`gemini-4-argon`, thinking `low`), citation verification, approve/edit/delete in the UI.
- Difficulty level 1 to 5 with the persona presets and hint settings; training and assessment modes.
- Branch events with Condition kinds `turn_gte`, `meter_lt`, `signal`, `rule_violated` and actions `inject_objection`, `director_note`, `end_session`, edited as simple form rows.
- Two seeded, published scenarios (one per demo industry) whose rules and rubric were generated by the pipeline and reviewed, so the demo can show the generation live but never depends on it.

**Should**

- Quick scenario from a one-line brief (persona + scenario in one flow), suggested branch events, turn timeline editor, adaptive difficulty.

**Later**

- Dry run with a simulated trainee (Gemini plays a weak and a strong trainee to check that the scenario is passable and that events fire), scenario analytics (which rules are violated most), curricula.

**Acceptance**

- From a KB containing a conduct policy, generation returns at least 3 rules; at least 80 percent of citations verify on the demo KBs; every unverified citation is visibly flagged.
- Clicking any citation chip shows the exact passage with the quote highlighted.
- A published scenario's rubric weights sum to 100.
- In a test session, an event with `turn_gte: 5` fires on turn 5 and appears in the report timeline; an event with `meter_lt trust 30` fires only after trust drops below 30.
- Editing a scenario after a session does not change that session's report.

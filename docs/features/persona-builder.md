# Feature Spec: Persona Builder

Status: Draft for the AI Builder Cup 2026 build (3-day scope)
Priority: **Must** (brief and document generation, edit form) / Should (portrait, voice preview) / Later (test lab)
Related: [Scenario Builder](scenario-builder.md), [Feature index](README.md), [Architecture](../architecture.md)

> **Implementation note:** `backend/app/schemas.py` is authoritative; fields below marked as future are not in the MVP.
>
> - **MVP `Persona` fields:** `id`, `name`, `title`, `age`, `industry`, `locale` (default `en-US`), `summary`, `personality` (list of 3-5 trait adjectives), `communication_style` (string), `goals`, `hidden_needs` (list of strings), `objections` (`id`, `text`, `trigger` as free text), `knowledge_level` (`novice|intermediate|expert`), `difficulty`, `initial_trust`, `initial_patience`, `opening_line` (served verbatim as the first customer turn), `voice`, `avatar` (strings), `source`, `source_document_ids`, `citations`, `status`, `created_at`.
> - **Status:** `draft` or `approved` (not `published`/`archived`). Approve with `POST /api/personas/{id}/approve`; only approved personas can back a scenario.
> - **Future (not in the MVP):** `workspace_id`, `version`, `public_summary`, the `demographics` object, `background`, OCEAN `personality`, structured `communication_style` and `knowledge_level`, Condition-based `reveal_when` / `trigger` and `resolved_by`, `emotion_model`, structured `voice` / `avatar`, `guardrails`, `provenance`, `safety`, segment cards, portraits.
> - **MVP API:** `POST /api/personas/generate`, `POST /api/personas/generate-from-docs`, CRUD on `/api/personas`, and `/approve` (see [API_CONTRACT.md](../API_CONTRACT.md)). The `:generate`, `:segments` and `/portrait` endpoints in Section 7 are future.
> - **Model:** persona generation uses `GEMINI_FAST_MODEL` (`gemini-4-argon`, thinking `low`, fallback `gemini-3.8-flash`) on the Vertex AI `global` endpoint. Measured on live `gemini-4-argon` (2026-10-16, two runs, nothing saved): 3 personas from documents in 36-40 s, a scenario in 26-30 s, a persona from a brief in 18-29 s, with every returned citation verified against the source text (106 of 106). That is about 3x slower than `gemini-3.8-flash` (13 s / 11 s / 9 s), with richer, more heavily cited drafts.

---

## 1. Purpose

A persona is the AI customer the trainee talks to. It is the single most important input to a believable practice session: if the customer folds after one sentence, or behaves like a helpful assistant, the training has no value.

The Persona Builder lets a trainer (manager, enablement lead) create a persona in under a minute, three ways:

| Path | Input | Output | Gemini calls |
| --- | --- | --- | --- |
| (a) From a brief | One line, e.g. `cautious 45yo SME owner, already has insurance` | One full persona draft | 1 (fast tier) |
| (b) From company docs | A knowledge base (KB) the company already uploaded | 3 customer-segment cards, then one full persona for the chosen card | 2 (fast tier) |
| (c) Manual | Blank form, or any draft from (a)/(b) | Edited persona | 0 |

Every path ends in the same edit form and the same validated `Persona` JSON. Generated content is always a draft until a human saves it.

### Non-goals (for the hackathon)

- Cloning a real customer from CRM data or call recordings.
- Free-form voice cloning.
- Multi-persona conversations (e.g. a couple, a buying committee).

---

## 2. Concepts

- **Public profile**: what the trainee may see before the session (name, role, short background, avatar). Shown on the scenario card.
- **Hidden layer**: goals, hidden needs, objections, trigger conditions, and meter values. Visible only to the persona agent, the coach agent, the scorer, and users with the trainer role. The trainee-facing API never serializes it.
- **Meters**: integer state variables 0 to 100 that change every turn. Required: `trust`, `patience`. They drive the emotional state, objection release and session exit.
- **Turn signals**: a fixed enum of things the trainee's turn did (asked a discovery question, showed empathy, pitched, ignored an objection, made a compliance violation, etc.). Signals are produced by the per-turn analysis call (see the Live Coach feature) and consumed by deterministic code. The LLM never edits meters directly; code does. This keeps the state machine reproducible and explainable in the report.
- **Condition**: a tiny, shared rule language used by objection triggers, hidden-need reveals, exit rules and scenario branch events. Defined once in Section 4.4.

---

## 3. Persona JSON (stored shape)

Stored in Firestore at `workspaces/{workspaceId}/personas/{personaId}`. A session pins `persona_id` + `version` at start so reports remain reproducible after edits.

### 3.1 Example

```json
{
  "id": "per_7f3a",
  "workspace_id": "ws_demo",
  "version": 3,
  "status": "published",
  "name": "Daniel Okafor",
  "public_summary": "Owner of a 12-person print shop. Agreed to a 20-minute call.",
  "locale": "en-US",
  "demographics": {
    "age": 45,
    "gender": "male",
    "occupation": "Owner, commercial print shop",
    "industry": "Small business / printing",
    "region": "Suburban, mid-size city",
    "household": "Married, two teenagers",
    "income_band": "middle"
  },
  "background": "Runs the business his father started. Bought a business owner policy 8 years ago through his accountant and has not reviewed it since. Hates being sold to; trusts numbers and peers.",
  "personality": {
    "openness": 35,
    "conscientiousness": 80,
    "extraversion": 40,
    "agreeableness": 45,
    "neuroticism": 60
  },
  "communication_style": {
    "formality": "neutral",
    "verbosity": "terse",
    "pace": "fast",
    "directness": "high",
    "quirks": ["Asks 'how much exactly?' early", "Interrupts long explanations"],
    "sample_lines": ["I already have insurance. What's different about yours?"]
  },
  "knowledge_level": {
    "domain": "low",
    "product": "none",
    "notes": "Knows his premium, not his coverage limits."
  },
  "goals": [
    "Keep fixed costs flat this year",
    "Avoid wasting time on a sales pitch"
  ],
  "hidden_needs": [
    {
      "id": "hn_keyperson",
      "text": "Worried the business cannot survive if he is out sick for months; nobody else can run the presses.",
      "reveal_when": [
        { "kind": "meter_gte", "meter": "trust", "value": 60 },
        { "kind": "signal", "signal": "needs_question" }
      ],
      "source_chunk_ids": ["kb_ins_04#c12"]
    }
  ],
  "objections": [
    {
      "id": "obj_has_policy",
      "text": "I already have a policy. Why would I need another one?",
      "category": "status_quo",
      "trigger": [{ "kind": "turn_gte", "value": 1 }],
      "resolved_by": ["needs_question", "evidence_provided"],
      "repeat_if_unresolved": true,
      "source_chunk_ids": []
    },
    {
      "id": "obj_price",
      "text": "Another bill every month? Margins are thin already.",
      "category": "price",
      "trigger": [{ "kind": "signal", "signal": "product_pitch" }],
      "resolved_by": ["evidence_provided", "objection_addressed"],
      "repeat_if_unresolved": true,
      "source_chunk_ids": ["kb_ins_02#c03"]
    }
  ],
  "difficulty": 3,
  "emotion_model": {
    "initial": { "trust": 35, "patience": 60 },
    "deltas": [
      { "signal": "needs_question",       "trust": 4,   "patience": 0 },
      { "signal": "empathy",              "trust": 5,   "patience": 2 },
      { "signal": "evidence_provided",    "trust": 6,   "patience": 0 },
      { "signal": "objection_addressed",  "trust": 6,   "patience": 2 },
      { "signal": "product_pitch",        "trust": -2,  "patience": -6 },
      { "signal": "objection_ignored",    "trust": -6,  "patience": -8 },
      { "signal": "overselling",          "trust": -10, "patience": -10 },
      { "signal": "compliance_violation", "trust": -15, "patience": -5 },
      { "signal": "off_topic",            "trust": 0,   "patience": -8 }
    ],
    "per_turn_patience_decay": 2,
    "states": [
      { "id": "leaving",    "when": [{ "kind": "meter_lt",  "meter": "patience", "value": 15 }] },
      { "id": "frustrated", "when": [{ "kind": "meter_lt",  "meter": "patience", "value": 30 }] },
      { "id": "guarded",    "when": [{ "kind": "meter_lt",  "meter": "trust",    "value": 40 }] },
      { "id": "engaged",    "when": [{ "kind": "meter_lt",  "meter": "trust",    "value": 70 }] },
      { "id": "open",       "when": [] }
    ],
    "exit_when": [{ "kind": "meter_lt", "meter": "patience", "value": 10 }]
  },
  "voice": { "provider": "gemini_live", "voice_id": "Charon", "speaking_rate": 1.05 },
  "avatar": { "kind": "vrm_preset", "preset_id": "vrm_male_casual_02" },
  "guardrails": {
    "never_break_character": true,
    "max_reply_sentences": 3,
    "do_not_volunteer": ["hidden_needs", "budget"],
    "off_limits_topics": ["politics", "religion"],
    "on_off_limits": "Steer back to the call in character.",
    "may_invent_personal_details": true,
    "may_invent_product_facts": false
  },
  "provenance": {
    "created_by": "user_123",
    "method": "from_docs",
    "brief": null,
    "kb_ids": ["kb_ins"],
    "model": "gemini-4-argon",
    "generated_at": "2026-10-16T09:12:00Z",
    "edited_fields": ["name", "difficulty"]
  },
  "safety": { "fictional_attested": true, "pii_scan": "pass", "checked_at": "2026-10-16T09:12:03Z" },
  "created_at": "2026-10-16T09:12:00Z",
  "updated_at": "2026-10-16T09:20:41Z"
}
```

### 3.2 Field reference

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id`, `workspace_id`, `version`, `status` | string / int / enum `draft\|published\|archived` | server | Never produced by the model. `version` increments on every save of a published persona. |
| `name` | string, 2 to 60 chars | yes | Fictional. See Section 6. |
| `public_summary` | string, max 200 chars | yes | The only narrative text the trainee sees. |
| `locale` | BCP-47 string | yes | Language and region of the persona's speech, e.g. `en-US`, `en-SG`, `ja-JP`. Demo materials use English. |
| `demographics` | object | yes | `age` 18 to 90; `gender` enum `female\|male\|nonbinary\|unspecified`; `occupation`, `industry`, `region` (coarse, never a street address), `household`, `income_band` enum `low\|middle\|high\|unspecified`. |
| `background` | string, max 800 chars | yes | Second-person-free narrative. Hidden from trainee. |
| `personality` | OCEAN, five ints 0 to 100 | yes | Mapped into the persona system prompt as adjectives (Section 5.4). |
| `communication_style` | object | yes | `formality` enum `casual\|neutral\|formal`; `verbosity` enum `terse\|normal\|chatty`; `pace` enum `slow\|normal\|fast`; `directness` enum `low\|medium\|high`; `quirks` up to 4 strings; `sample_lines` up to 3 strings. |
| `knowledge_level` | object | yes | `domain`, `product` enum `none\|low\|medium\|high`; `notes`. Limits what the persona can plausibly know (an SME owner does not quote policy clauses). |
| `goals` | 1 to 4 strings | yes | Stated goals the persona will say out loud if asked. |
| `hidden_needs` | 1 to 3 objects | yes | `id`, `text`, `reveal_when` (Condition list), `source_chunk_ids`. Revealed at most once; the reveal is a scored moment in the report. |
| `objections` | 2 to 6 objects | yes | `id`, `text`, `category` enum `price\|status_quo\|trust\|timing\|authority\|competitor\|need\|risk`, `trigger` (Condition list), `resolved_by` (signal list), `repeat_if_unresolved`, `source_chunk_ids`. |
| `difficulty` | int 1 to 5 | yes | Sets defaults for `emotion_model` (Section 3.3). A scenario may override. |
| `emotion_model` | object | yes | Meters, deltas, state list, exit rule. See Section 4. |
| `voice` | object | no | `provider` enum `gemini_live\|browser_tts\|none`; `voice_id` must be in the voice catalog; `speaking_rate` 0.8 to 1.3. |
| `avatar` | object | no | Either `{ "kind": "vrm_preset", "preset_id" }` or `{ "kind": "portrait", "image_uri", "prompt", "model" }` or `{ "kind": "initials" }` (default). |
| `guardrails` | object | yes | Defaults are applied server-side; trainer can tighten, never loosen `never_break_character` or `may_invent_product_facts`. |
| `provenance` | object | server | Method, brief, KB ids, model, edited fields. Shown as "AI-generated, edited by ..." in the UI. |
| `safety` | object | server | Result of Section 6 checks. A persona cannot be published unless `pii_scan == "pass"`. |

### 3.3 Difficulty presets

`difficulty` fills `emotion_model` defaults when the model or the trainer leaves them empty. Values are starting points; the trainer can edit them.

| Level | Label | Initial trust | Initial patience | Active objections | Hidden-need reveal threshold (trust) | Negative delta multiplier |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Friendly | 60 | 80 | 2 | 45 | 0.5 |
| 2 | Open | 50 | 70 | 3 | 50 | 0.75 |
| 3 | Cautious | 35 | 60 | 4 | 60 | 1.0 |
| 4 | Skeptical | 25 | 50 | 5 | 70 | 1.25 |
| 5 | Hostile | 15 | 40 | 6 | 80 | 1.5 |

---

## 4. Emotional state machine

### 4.1 Per-turn update (deterministic, in code)

```
signals = turn_analysis.signals                       # from the per-turn call
for s in signals:
    d = persona.emotion_model.deltas[s]
    trust    += d.trust    * (multiplier if d.trust    < 0 else 1)
    patience += d.patience * (multiplier if d.patience < 0 else 1)
patience -= per_turn_patience_decay
clamp both to 0..100
state = first entry in emotion_model.states whose `when` all hold   # ordered list
release objections whose `trigger` holds and which are not yet raised
mark objections resolved if any `resolved_by` signal appears while it is the active objection
reveal hidden needs whose `reveal_when` holds (once)
if exit_when holds: persona ends the call politely in character; session closes
```

Rules:

- Order of `states` matters; the first match wins, the last entry is the fallback with an empty `when`.
- At most one new objection is released per turn (the highest-priority unresolved one, in list order) so the persona does not dump every objection at once.
- Each meter change is logged with the triggering signal and turn number. The report shows a trust/patience line chart with these annotations ("Turn 5: objection ignored, trust -6").

### 4.2 How the state reaches the persona's reply

The persona agent receives, every turn, a small `director_note` block in its prompt:

```
CURRENT STATE: guarded (trust 38/100, patience 52/100)
ACTIVE OBJECTION: obj_price "Another bill every month? Margins are thin already."
NEWLY REVEALABLE: none
INSTRUCTION: Stay guarded. Raise the active objection in your own words if the trainee has not addressed it.
```

The persona model never sees raw deltas or the full hidden layer at once, only what it needs to act this turn. This makes behavior consistent and reduces leakage of hidden needs.

### 4.3 Turn signal enum

`needs_question`, `empathy`, `evidence_provided`, `objection_addressed`, `objection_ignored`, `product_pitch`, `overselling`, `closing_attempt`, `compliance_violation`, `off_topic`, `role_escape`, `competitor_mentioned`, `price_mentioned`.

Signals come from the per-turn analysis call (structured output, enum array). `compliance_violation` is set by the Compliance Guard when severity is `high` or `critical`. `evidence_provided` requires at least one verified KB citation in the trainee's turn or the coach's validation.

### 4.4 Condition language (shared with Scenario Builder)

A Condition list is ANDed. An empty list is always true. For OR, create two entries.

| `kind` | Fields | True when |
| --- | --- | --- |
| `turn_gte` | `value` | Trainee turn number >= value (1-based) |
| `turn_eq` | `value` | Trainee turn number == value |
| `meter_lt` | `meter`, `value` | Meter < value |
| `meter_gte` | `meter`, `value` | Meter >= value |
| `signal` | `signal` | Signal present in the current turn |
| `signal_count_gte` | `signal`, `value` | Signal seen at least `value` times so far |
| `keyword` | `any` (list of strings) | Any string appears in the trainee's turn (case-insensitive) |
| `objection_resolved` | `objection_id` | That objection is resolved |
| `hidden_need_revealed` | `hidden_need_id` | That hidden need was revealed |

Implementation: one pure function `evaluate(conditions, session_state, turn) -> bool`, about 40 lines, unit-tested with table tests.

---

## 5. Gemini design (google-genai SDK)

### 5.1 Client and models

```python
from google import genai
from google.genai import types

client = genai.Client(vertexai=True, project=settings.google_cloud_project,
                      location=settings.google_cloud_location)   # "global"
FLASH = settings.gemini_fast_model   # default "gemini-4-argon"
```

This spec originally used Flash for all persona generation because it is interactive, latency-sensitive and the output is short. The MVP briefly used `GEMINI_PRO_MODEL`, then returned to the fast tier with thinking `low` (now `gemini-4-argon`; see the implementation note at the top). Temperature 0.9 for variety in names and quirks; the schema keeps the structure stable.

### 5.2 Model-facing schema vs stored schema

The model fills a `PersonaDraft` (Pydantic). The server converts it to `Persona` by adding ids, version, provenance, safety, difficulty defaults and validated citations. Rules for `PersonaDraft`, chosen to work reliably with Gemini structured output:

- No `dict[str, X]` maps; use lists of objects (e.g. `deltas` is a list, not a map keyed by signal).
- Enums as `Literal[...]` or `Enum` everywhere a closed set exists.
- No unions or `oneOf` in the model-facing schema. `avatar` and `voice` are not generated by the model in the draft; they are chosen in the UI (step 5).
- No default values in the model-facing schema; defaults are applied after parsing.
- Keep nesting at most 3 levels and the total field count under about 60.
- `Condition` in the draft is a flat object with all optional fields (`kind`, `value`, `meter`, `signal`, `any`, `objection_id`, `hidden_need_id`); the server validates that the fields required for that `kind` are present.

```python
from typing import Literal
from pydantic import BaseModel, Field

Signal = Literal["needs_question", "empathy", "evidence_provided", "objection_addressed",
                 "objection_ignored", "product_pitch", "overselling", "closing_attempt",
                 "compliance_violation", "off_topic", "role_escape",
                 "competitor_mentioned", "price_mentioned"]

class ConditionDraft(BaseModel):
    kind: Literal["turn_gte", "turn_eq", "meter_lt", "meter_gte", "signal",
                  "signal_count_gte", "keyword", "objection_resolved", "hidden_need_revealed"]
    value: int | None = None
    meter: Literal["trust", "patience"] | None = None
    signal: Signal | None = None
    any: list[str] | None = None
    objection_id: str | None = None
    hidden_need_id: str | None = None

class OCEAN(BaseModel):
    openness: int = Field(ge=0, le=100)
    conscientiousness: int = Field(ge=0, le=100)
    extraversion: int = Field(ge=0, le=100)
    agreeableness: int = Field(ge=0, le=100)
    neuroticism: int = Field(ge=0, le=100)

class HiddenNeedDraft(BaseModel):
    id: str
    text: str
    reveal_when: list[ConditionDraft]
    source_chunk_ids: list[str]

class ObjectionDraft(BaseModel):
    id: str
    text: str
    category: Literal["price", "status_quo", "trust", "timing", "authority",
                      "competitor", "need", "risk"]
    trigger: list[ConditionDraft]
    resolved_by: list[Signal]
    repeat_if_unresolved: bool
    source_chunk_ids: list[str]

class PersonaDraft(BaseModel):
    name: str
    public_summary: str
    locale: str
    demographics: Demographics            # age, gender, occupation, industry, region, household, income_band
    background: str
    personality: OCEAN
    communication_style: CommunicationStyle
    knowledge_level: KnowledgeLevel
    goals: list[str]
    hidden_needs: list[HiddenNeedDraft]
    objections: list[ObjectionDraft]
    difficulty: int = Field(ge=1, le=5)
    initial_trust: int = Field(ge=0, le=100)
    initial_patience: int = Field(ge=0, le=100)
```

Note: `= None` on optional `ConditionDraft` fields is the only default allowed; it marks the field as nullable. `deltas`, `states` and `exit_when` are not generated: the server fills them from the difficulty preset (Section 3.3), which is more reliable than asking the model for numeric tables. The trainer can still edit them.

### 5.3 Call: generate from a brief (path a)

```python
resp = client.models.generate_content(
    model=FLASH,
    contents=[
        f"BRIEF: {brief}\nLOCALE: {locale}\nTARGET DIFFICULTY: {difficulty}\n"
        f"TRAINING CONTEXT: {kb_summary_or_none}\n"
        f"RELEVANT KNOWLEDGE (cite by id):\n{format_chunks(top_chunks)}"
    ],
    config=types.GenerateContentConfig(
        system_instruction=PERSONA_SYSTEM,
        response_mime_type="application/json",
        response_schema=PersonaDraft,
        temperature=0.9,
        max_output_tokens=4096,
    ),
)
draft: PersonaDraft = resp.parsed
```

`top_chunks` is optional: if a KB is selected, the server embeds the brief and retrieves the top 6 chunks so objections can be realistic for the company's actual products. Each chunk is formatted as `[kb_ins_02#c03] <text>`.

`PERSONA_SYSTEM` (abridged):

```
You design fictional customer personas for workplace conversation training.
The trainee will practice with this persona; the persona must be realistic,
consistent and challenging at the requested difficulty.

Rules:
1. The persona is fictional. Invent a common, plausible name. Never use the name,
   likeness or biography of a real or famous person, even if the brief asks for it.
2. Do not include contact details, IDs, exact addresses, employer names of real
   companies, or any data copied about a real individual from the knowledge text.
3. Objections must be things a real customer in this segment would say, in their
   own words, not sales jargon. Order them from first-raised to last.
4. Hidden needs are the real reasons behind the objections. The persona never states
   them unless the reveal conditions are met.
5. Use knowledge chunk ids in source_chunk_ids only when an objection or hidden need
   is directly grounded in that chunk. Never invent ids. Use [] when not grounded.
6. knowledge_level must be plausible: customers do not quote internal policy.
7. Match the language of LOCALE for all customer-facing lines (sample_lines,
   objections). Field names stay in English.
8. Difficulty 1 = friendly and forgiving, 5 = hostile and impatient. Set
   initial_trust and initial_patience accordingly.
9. Conditions: use only these kinds: turn_gte, turn_eq, meter_lt, meter_gte, signal,
   signal_count_gte, keyword, objection_resolved, hidden_need_revealed.
   Fill only the fields that kind needs.
```

### 5.4 Calls: generate from company docs (path b)

Two steps so the trainer chooses the segment before the expensive expansion, and so the segment list itself is a "wow" moment in the demo (the AI read your docs and found your customers).

**Step 1: segments.** Retrieve chunks with several fixed queries against the selected KB (`who is this product for`, `common customer questions`, `objections and how to handle them`, `pricing and plans`, `eligibility and exclusions`), dedupe, cap at about 40 chunks or 30k tokens. Then:

```python
class SegmentCard(BaseModel):
    id: str
    label: str                     # "Cost-conscious SME owner with an existing policy"
    who: str                       # one sentence
    typical_objections: list[str]  # 2-3
    hidden_need: str
    suggested_difficulty: int = Field(ge=1, le=5)
    source_chunk_ids: list[str]

class SegmentList(BaseModel):
    segments: list[SegmentCard]    # exactly 3 requested in the prompt
```

System instruction adds: "Infer realistic customer segments from the product documents. Each segment must be supported by at least one chunk. Prefer segments that would create different conversations (e.g. price-driven, risk-driven, already-served-by-competitor)."

**Step 2: expand.** The chosen `SegmentCard` becomes the brief for path (a), with the same chunks passed as knowledge. Output is a `PersonaDraft`.

### 5.5 Personality to prompt mapping

At session time OCEAN values are rendered as adjectives, not numbers, which models follow more consistently:

| Trait | 0 to 33 | 34 to 66 | 67 to 100 |
| --- | --- | --- | --- |
| Openness | prefers the familiar, dismisses new ideas | open if shown evidence | curious, asks about new options |
| Conscientiousness | vague, impulsive | reasonably careful | detail-driven, wants exact numbers |
| Extraversion | reserved, short answers | balanced | talkative, tells stories |
| Agreeableness | blunt, combative | polite but firm | warm, avoids conflict |
| Neuroticism | calm | some worry | anxious, catastrophizes |

### 5.6 Avatar portrait (Should)

Portrait generation uses Imagen through the same SDK (`client.models.generate_images`, model from `settings.imagen_model`), only when the trainer clicks "Generate portrait". The prompt is built by the server from coarse demographics only (age band, gender, occupation, setting) plus a fixed style suffix: `stylized digital illustration, head and shoulders, neutral background, not photorealistic`. A stylized look avoids the uncanny valley and lowers the risk of resembling a real person. The name is never included in the image prompt. The image is stored in Cloud Storage and referenced by `image_uri`.

VRM avatars are shipped as a static catalog of 7 models (`frontend/public/avatars/`, Microsoft Rocketbox, MIT). In the current build the seed personas store a preset name as a string (`"avatar": "preset-executive"`, `preset-retiree`, `preset-casual`), and other personas get a model by age and the pronouns in their text (`frontend/src/lib/avatar.ts`); the object form above is the target schema. Without WebGL the UI shows the initials.

### 5.7 Error handling

- If `resp.parsed` is `None` or Pydantic validation fails, retry once with the validation errors appended to the prompt ("Your previous output failed validation: ..."). After the second failure, return HTTP 502 with a user message "Generation failed, try again or start from a blank form" and keep the user's brief.
- Every generation is logged with model, latency, token counts and validation outcome (no raw PII, see Section 6).

---

## 6. Validation and safety

Run on every generated draft and on every manual save. Implemented as a pure `validate_persona(persona, kb) -> list[Issue]` plus one optional Gemini check.

### 6.1 Structural checks (blocking)

- Pydantic schema validation; Condition fields match `kind`; ids unique within the persona; `objection_id` and `hidden_need_id` references exist.
- `voice_id` exists in the voice catalog for the persona's locale; `preset_id` exists in the VRM catalog.
- Every `source_chunk_ids` entry exists in the selected KB. Unknown ids are removed and the item is tagged `ungrounded` (non-blocking warning).
- Counts: 2 to 6 objections, 1 to 3 hidden needs, at least one hidden need has a non-empty `reveal_when`.

### 6.2 No real people (blocking)

- Brief pre-check: before calling Gemini, the brief is checked by a short fast-tier classification call (`{"refers_to_real_person": bool, "reason": str}`). If true, refuse with "Personas must be fictional. Describe a type of customer instead of a specific person."
- Name check: the generated name is checked against a small denylist (public figures commonly used in tests) and against person names present in the selected KB chunks (names extracted at ingestion time). A match forces regeneration of the name.
- The trainer must tick "This persona is fictional and does not describe a real individual" before publishing (`safety.fictional_attested`).

### 6.3 No PII (blocking)

- Regex scan over all text fields for emails, phone numbers, payment card numbers (Luhn), national ID patterns for supported locales, street addresses with house numbers, and URLs.
- Uploaded documents can contain real customer data (case studies, claim examples). The system prompt forbids copying it, and the scan above catches the common leaks. KB ingestion also runs Cloud DLP or the same regex scan and flags documents with PII (see Knowledge Base feature).
- Persona text is never sent to analytics; logs store ids and counts only.

### 6.4 Content safety (non-blocking warnings, blocking for severe)

- Gemini safety settings at default thresholds on all builder calls.
- Lint for protected-characteristic stereotypes in `background` and `quirks` (e.g. behavior attributed to ethnicity or religion). A fast-tier check returns warnings; the trainer sees them before saving.
- `guardrails.may_invent_product_facts` is always `false`: the persona can invent personal life details, but product, price and policy facts must come from the KB through the persona agent's retrieval at session time.

### 6.5 Visibility

- Trainee API returns only `name`, `public_summary`, `locale`, `demographics.occupation`, `avatar`, `voice`.
- Hidden fields are visible to trainers and to the report (after the session), where they explain what the trainee could have discovered.

---

## 7. API

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /api/personas:generate` | `{ "mode": "brief", "brief", "locale", "difficulty", "kb_ids"? }` | `{ "draft": Persona(status=draft), "issues": [] }` |
| `POST /api/personas:segments` | `{ "kb_ids", "locale" }` | `{ "segments": SegmentCard[] }` |
| `POST /api/personas:generate` | `{ "mode": "segment", "segment": SegmentCard, "kb_ids", "locale" }` | as above |
| `POST /api/personas` | `Persona` | saved persona (draft or published) |
| `PUT /api/personas/{id}` | `Persona` | new version |
| `GET /api/personas`, `GET /api/personas/{id}` | | list or one (trainer view) |
| `POST /api/personas/{id}/portrait` | `{}` | `{ "image_uri" }` |

Generation endpoints do not persist anything; the draft is saved only on `POST /api/personas`.

---

## 8. UI flow (wizard)

Route: `/personas/new`. Five steps; a progress bar at the top; every step has Back and Next; the draft lives in client state until Save.

1. **Start**: three large choices.
   - "Describe a customer" (text field with placeholder `cautious 45yo SME owner, already has insurance`, locale select, difficulty slider 1 to 5, optional KB select).
   - "Find customers in my documents" (KB select).
   - "Start blank".
2. **Generate**:
   - Brief path: spinner with "Designing persona..." (target under 8 s), then go to step 3.
   - Docs path: three segment cards, each with label, one-line description, 2 to 3 objections and citation chips (`[c03]`) that open the source passage in a side panel. Buttons: "Use this segment", "Regenerate".
3. **Profile** (the manual edit form starts here for all paths): name (with "Regenerate name"), public summary, locale, demographics, background, OCEAN sliders with the adjective preview from Section 5.5, communication style selects, sample lines. Fields generated by AI show a small "AI" tag that disappears when edited.
4. **Behavior**: goals list; hidden needs and objections as editable cards. Each card has the text, category, citation chips, and a condition builder (row per condition: kind select, then the matching inputs). Difficulty slider with "Apply preset" which resets meters; advanced section shows initial meters, the delta table and the state list.
5. **Voice, avatar and save**: voice select with a "Preview" button (Should); avatar choice: initials (default), VRM preset, or "Generate portrait" (Should). Validation results from Section 6 are listed (errors block, warnings allow save). Fictional attestation checkbox. Buttons: "Save draft", "Publish", and "Use in new scenario" (opens the Scenario Builder with this persona preselected).

Editing an existing persona opens directly at step 3 with all steps unlocked.

Accessibility: every slider has a numeric input; condition builder is keyboard operable; citation chips have text labels, not only color.

---

## 9. Build plan and acceptance (3-day scope)

**Must**

- `PersonaDraft` / `Persona` Pydantic models, Condition evaluator, difficulty presets.
- Brief and docs generation endpoints with one validation retry.
- Wizard steps 1 to 4 and a simplified step 5 (save, publish, validation list, initials avatar).
- Structural, PII regex and real-person brief checks.
- Two seeded personas (one per demo industry) so the demo never depends on a live generation.

**Should**

- Imagen portrait, voice preview, stereotype lint.

**Later**

- Persona test lab (chat with the persona in a sandbox and inspect meter changes), VRM preset picker, persona versions diff, import/export.

**Acceptance**

- A brief generates a valid persona in under 10 s at p50, with 2 to 6 objections and at least 1 hidden need.
- From a KB with at least 3 documents, segments return 3 cards; each card has at least one citation that resolves to a real chunk.
- A brief naming a real public figure is refused with the fictional-persona message.
- A draft containing an email address or phone number cannot be published.
- The trainee API response for a persona contains no hidden fields (automated test).

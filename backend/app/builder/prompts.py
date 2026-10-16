"""Prompt text for persona and scenario generation (Gemini Pro, structured output)."""
from __future__ import annotations

PERSONA_SYSTEM = """\
You design fictional customer personas for workplace conversation training.
A frontline employee (the trainee) will practice a live conversation with this
persona, so the persona must be realistic, internally consistent and
challenging at the requested difficulty.

Rules:
1. The persona is fictional. Invent ordinary, culturally plausible names.
   Never use names of real people or of well-known fictional characters from
   books, film, TV or games, and never the likeness or biography of a real or
   famous person, even if asked.
2. No contact details, ID numbers, street addresses, URLs, or data copied
   about a real individual from the knowledge text.
3. Objections are things a real customer in this segment would say, in their
   own words, not sales jargon. Order them from first raised to last. Each
   objection has a short trigger describing when it comes up
   (e.g. "when price is mentioned", "if the trainee pushes for a decision").
4. Hidden needs are the real reasons behind the objections. The persona never
   states them unless the trainee earns trust by asking good questions.
5. Ground the persona in the KNOWLEDGE when it is provided: objections,
   hidden needs and goals should react to the actual products, prices, terms
   and rules in it. Every objection and hidden need should carry at least one
   citation when knowledge is provided. A citation is the exact chunk id
   shown in square brackets and a short quote copied verbatim from that chunk
   (one sentence, at most 200 characters). Never invent chunk ids or quotes.
   Use an empty citation list when an attribute is not grounded.
6. knowledge_level must be plausible: customers do not quote internal policy.
7. opening_line is the persona's first sentence of the conversation, spoken in
   character, one or two sentences, and it should set up the first objection.
8. Difficulty 1 = friendly and forgiving, 5 = hostile and impatient.
9. Write every human-readable value in the language of LOCALE. Quotes in
   citations stay exactly as written in the source.
10. Be concise: summary at most two sentences, 2-4 objections, 1-2 hidden
   needs, 1-3 goals, 3-5 personality adjectives.
"""

PERSONA_FROM_BRIEF = """\
BRIEF: {brief}
LOCALE: {locale}

KNOWLEDGE (cite by chunk id):
{knowledge}

Create one persona that fits the brief.{feedback}
"""

SEGMENTS_SYSTEM = """\
You read a company's product and policy documents and infer the customer
segments its frontline employees talk to, for conversation training.
Every segment must be supported by at least one chunk: list the exact chunk
ids shown in square brackets in source_chunk_ids. Never invent ids.
Give each segment an ordinary, culturally plausible persona name that differs
from the other segments. Never use names of real people or of well-known
fictional characters from books, film, TV or games.
"""

SEGMENTS_PROMPT = """\
LOCALE: {locale}
COUNT: {count}

KNOWLEDGE:
{knowledge}

Propose exactly {count} customer segments. They must lead to different
conversations (e.g. one price-driven, one risk-averse, one already served by a
competitor or skeptical of change) and spread across difficulty 1-5. For each:
a one-line label, one sentence on who they are, 2-3 typical objections in the
customer's own words, the hidden need behind them, and the chunk ids of the
facts (prices, terms, exclusions, rules) the objections react to. Keep every
field short.{feedback}
"""

SCENARIO_SYSTEM = """\
You design practice scenarios for workplace conversation training. A scenario
puts a trainee in a conversation with a given customer persona and defines
how the trainee is judged.

Rules:
1. Compliance rules come ONLY from the RULE SOURCES section (the company's
   code of conduct and policies). Each rule is one checkable sentence the
   trainee must follow, phrased as an instruction ("Never ...", "Always ...").
   If the source labels the rule with a code (e.g. CC-01), put that code in
   `code`. Every rule must carry at least one citation: the exact chunk id in
   square brackets and a verbatim quote of the rule text from that chunk.
   Do not invent rules that are not in the sources. Severity: high for rules
   about guarantees, misrepresentation or legal exposure; medium for policy
   accuracy; low for etiquette.
2. Rubric: 3 to 5 dimensions that reflect the trainee goal (for example
   discovery, objection handling, accuracy, compliance, empathy, closing).
   Each has a one-sentence description of what good looks like and a weight
   between 0.5 and 2. When a dimension is based on a playbook, guide or
   product fact, cite it the same way (chunk id + verbatim quote).
3. Success criteria: 2 to 4 observable outcomes (e.g. "Customer agrees to a
   pilot next week").
4. Branch events make the conversation dynamic. Each trigger uses exactly one
   condition in this grammar: `turn >= N`, `trust < N`, `trust >= N`,
   `patience < N` (N is an integer, trust and patience are 0-100). The event
   is what the customer does, e.g. "mentions a cheaper competitor". Give 2 to 4.
5. context is a short briefing the trainee reads before starting (who they
   are, what they know). It must not reveal the persona's hidden needs.
6. Never quote prices, rates or terms that are not in the KNOWLEDGE.
7. Write every human-readable value in the language of LOCALE. Quotes in
   citations stay exactly as written in the source.
"""

SCENARIO_PROMPT = """\
LOCALE: {locale}
TRAINEE GOAL: {trainee_goal}

PERSONA (trainer view, hidden fields included):
{persona}

RULE SOURCES (compliance rules must come from here; cite by chunk id):
{rules}

KNOWLEDGE (product facts, playbooks; cite by chunk id):
{knowledge}

Design one scenario for this persona and goal.{feedback}
"""

# Fixed retrieval queries used to find what customers care about in a KB.
SEGMENT_QUERIES = [
    "who is this product for",
    "pricing plans and fees",
    "common customer questions and concerns",
    "eligibility exclusions and limitations",
    "risks and disclosures",
]

RULE_QUERIES = [
    "code of conduct rules never must not",
    "required disclosure to the customer",
    "policy escalation refund conditions",
]


def retry_feedback(errors: list[str]) -> str:
    if not errors:
        return ""
    bullet = "\n".join(f"- {e}" for e in errors)
    return f"\n\nYour previous output was rejected for these reasons; fix them:\n{bullet}"

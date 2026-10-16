"""The five agents of a practice session: compliance, persona, state, coach, report.

Each agent asks Gemini for structured output, then enforces its guarantees in code
(exact-substring quotes, clamped deltas, hidden-need gating, evidence verification)
instead of trusting the model.
"""
from __future__ import annotations

import asyncio
import inspect
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel, Field

from app.schemas import (
    BranchEvent, Citation, CoachHint, ComplianceFlag, ComplianceRule, DimensionScore, Evidence,
    Persona, Report, RubricItem, Scenario, SearchHit, Turn,
)
from app.session import deps, prompts

log = logging.getLogger(__name__)

HIDDEN_NEEDS_TRUST = 70
HIDDEN_NEEDS_TRUST_GAIN = 15
MAX_TRUST_GAIN, MAX_TRUST_LOSS = 15, -20
MAX_PATIENCE_GAIN, MAX_PATIENCE_LOSS = 10, -20
NO_EVIDENCE_CAP = 50
COMPLIANCE_FAIL_CAP = 59

DEFAULT_RUBRIC = [
    RubricItem(id="discovery", name="Discovery", description="Asks open questions to uncover needs and context"),
    RubricItem(id="knowledge", name="Product knowledge", description="States accurate facts grounded in the knowledge base"),
    RubricItem(id="objections", name="Objection handling", description="Acknowledges and resolves concerns without pressure"),
    RubricItem(id="empathy", name="Empathy & rapport", description="Listens, reflects feelings and builds trust"),
    RubricItem(id="closing", name="Next steps", description="Moves toward a clear, agreed next step"),
]


# ---------- Compliance ----------

# Fast keyword pass: each family applies to rules whose text mentions one of its keywords.
_COMPLIANCE_FAMILIES: list[tuple[tuple[str, ...], re.Pattern[str]]] = [
    (("guarantee", "promise", "assure", "risk", "return"),
     re.compile(r"\b(guarantee[sd]?|promise[sd]?|100\s?%|risk[- ]free|no risk|can(?:no|')t lose|zero risk)\b", re.I)),
    (("pressure", "urgen", "rush", "deadline", "limited"),
     re.compile(r"\b(only today|right now|last chance|act now|expires? (?:today|tonight)|before it'?s too late|sign today)\b", re.I)),
    (("personal", "password", "pin", "ssn", "social security", "card", "credential", "otp"),
     re.compile(r"\b(password|pin code|social security|ssn|card number|cvv|one[- ]time (?:code|password))\b", re.I)),
    (("competitor", "disparag", "badmouth"),
     re.compile(r"\b(scam|rip[- ]?off|garbage|terrible|worthless|liars?)\b", re.I)),
    (("discount", "price", "fee", "waive"),
     re.compile(r"\b(\d+\s?% off|waive (?:the |your )?fees?|free of charge|no fees?)\b", re.I)),
    (("medical", "diagnos", "cure", "health"),
     re.compile(r"\b(cures?|cured|diagnos\w*|heals?)\b", re.I)),
]


# A hit is ignored when its clause negates it ("returns are not guaranteed", "I can't promise")
# or is a disclosure ("past performance doesn't guarantee future results").
_CLAUSE_BREAK = re.compile(r"[.;:!?,\n]|\b(?:but|however|although|though|yet)\b", re.I)
_NEGATION = re.compile(r"\b(?:not|no|never|cannot|without|nor|neither|nobody|none)\b|n't\b", re.I)
_DISCLOSURE = re.compile(r"\b(?:past performance|no guarantees?|not guaranteed|may (?:lose|go down)|"
                         r"could (?:lose|go down)|can go down|risk of loss|not a guarantee)\b", re.I)
NEGATION_WINDOW_WORDS = 4


def _excluded(text: str, start: int, end: int) -> bool:
    norm = text.replace("’", "'")  # same length, so offsets still line up
    clause_start = max((m.end() for m in _CLAUSE_BREAK.finditer(norm, 0, start)), default=0)
    after = _CLAUSE_BREAK.search(norm, end)
    clause = norm[clause_start:after.start() if after else len(norm)]
    before = " ".join(norm[clause_start:start].split()[-NEGATION_WINDOW_WORDS:])
    return bool(_NEGATION.search(before) or _DISCLOSURE.search(clause))


def keyword_flags(text: str, rules: list[ComplianceRule]) -> list[ComplianceFlag]:
    flags: list[ComplianceFlag] = []
    for rule in rules:
        rule_text = rule.rule.lower()
        hit = next((m for keywords, pattern in _COMPLIANCE_FAMILIES
                    if any(k in rule_text for k in keywords)
                    for m in pattern.finditer(text) if not _excluded(text, m.start(), m.end())), None)
        if hit:
            flags.append(ComplianceFlag(rule_id=rule.id, severity=rule.severity,
                                        message=f"Possible violation: {rule.rule}", quote=hit.group(0)))
    return flags


def _overlaps(a: str, b: str) -> bool:
    a, b = a.lower(), b.lower()
    return a in b or b in a


def exact_span(text: str, quote: str) -> str | None:
    """Return the span of `text` matching `quote` (exact, then case-insensitive), else None."""
    quote = quote.strip().strip("\"'“”‘’").strip()
    if not quote:
        return None
    if quote in text:
        return quote
    i = text.lower().find(quote.lower())
    return text[i:i + len(quote)] if i >= 0 else None


class _FlagDraft(BaseModel):
    rule_id: str
    message: str
    quote: str = Field(description="Copied verbatim from the trainee message")


class _ComplianceDraft(BaseModel):
    flags: list[_FlagDraft] = Field(default_factory=list)


async def compliance_check(text: str, rules: list[ComplianceRule], locale: str = "en-US",
                           candidates: list[ComplianceFlag] | None = None, *, context: str = "",
                           recent: list[Turn] | None = None) -> list[ComplianceFlag]:
    """Keyword hits are the floor; Gemini adds what keywords can't see (implied promises, other
    rules). Pass `candidates` when the keyword pre-scan already ran (it was sent as compliance_pre).
    `context` (scenario context) and `recent` (the last turns before this message) let situational
    rules fire."""
    if not rules or not text.strip():
        return []
    if candidates is None:
        candidates = keyword_flags(text, rules)
    by_id = {r.id: r for r in rules}
    prompt = prompts.compliance_prompt(text, rules, locale, context=context, recent=recent)
    if candidates:
        prompt += "\n\nAlready flagged by the keyword scan (find anything else): " + "; ".join(
            f"{f.rule_id}: '{f.quote}'" for f in candidates)
    try:
        draft = await deps.generate_json(prompt, _ComplianceDraft, system=prompts.COMPLIANCE_SYSTEM,
                                         model=deps.lite_model(), temperature=0.0,
                                         thinking=deps.FAST_THINKING)
    except Exception:
        log.warning("compliance LLM failed; using keyword flags", exc_info=True)
        return candidates

    flags: list[ComplianceFlag] = []
    seen: set[tuple[str, str]] = set()
    for f in draft.flags:
        rule = by_id.get(f.rule_id)
        span = exact_span(text, f.quote)
        if rule is None or span is None or (rule.id, span) in seen:
            continue  # unknown rule or a quote the trainee never wrote
        start = text.find(span)
        if _excluded(text, start, start + len(span)):
            continue  # a negation or risk disclosure is compliant, whatever the model thinks
        seen.add((rule.id, span))
        flags.append(ComplianceFlag(rule_id=rule.id, severity=rule.severity, message=f.message, quote=span))
    # Keyword hits always survive unless the judge already flagged the same rule at the same spot.
    flags += [c for c in candidates
              if not any(f.rule_id == c.rule_id and _overlaps(f.quote, c.quote) for f in flags)]
    return flags


# ---------- Grounding ----------

GROUNDING_RULE_ID = "GROUNDING"


class _GroundingClaim(BaseModel):
    quote: str = Field(description="The unsupported sentence, verbatim from the reply")
    message: str


class _GroundingDraft(BaseModel):
    unsupported: list[_GroundingClaim] = Field(default_factory=list)


# The customer restating or doubting the trainee is not the customer asserting a fact.
_REPORTED_SPEECH = re.compile(
    r"\byou(?:'ve| have)? (?:just |earlier |already )?(?:said|told|mentioned|claimed|promised|stated|say)\b|"
    r"\b(?:earlier|before) you\b|\baccording to you\b|\bwhat you (?:said|told)\b|\bso you'?re saying\b", re.I)
_SENTENCE_END = re.compile(r"[.!?\n]")


def _containing_sentence(text: str, span: str) -> str:
    i = text.find(span)
    start = max((m.end() for m in _SENTENCE_END.finditer(text, 0, i)), default=0)
    end = _SENTENCE_END.search(text, i + len(span))
    return text[start:end.end() if end else len(text)].strip()


# Another party's offer (a scripted competitor event, hearsay) is not a claim about our products.
_HEARSAY = re.compile(r"\b(?:offered|quoted|gave|promised|told) (?:me|us)\b|\bcompetitors?\b|"
                      r"\b(?:another|other) (?:company|provider|vendor|insurer|bank|store)\b", re.I)
# A declarative statement about one of the company's products or policies.
_PRODUCT_CLAIM = re.compile(
    r"\b(?:the|this|that|your|our|its) (?:\w+ ){0,2}(?:plan|policy|product|contract|subscription|package|"
    r"service|warranty|coverage|fund|account|price|premium|fee|refund|return|tier)s?\b[^.!?]*?"
    r"\b(?:has|have|includes?|covers?|offers?|comes with|costs?|charges?|requires?|lets|allows?|pays?|"
    r"locks?|lasts?|expires?|is|are|was|were|will)\b", re.I)
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def is_customer_assertion(reply: str, span: str) -> bool:
    sentence = _containing_sentence(reply.replace("’", "'"), span.replace("’", "'"))
    return not (sentence.endswith("?") or _REPORTED_SPEECH.search(sentence) or _HEARSAY.search(sentence))


def is_product_claim(reply: str, span: str, allowed: str) -> bool:
    """Demands, emotions and opinions are never flagged: a flag needs a number no allowed source
    contains, or a declarative statement about a product or policy."""
    sentence = _containing_sentence(reply, span)
    known = set(_NUMBER.findall(allowed))
    return any(n not in known for n in _NUMBER.findall(sentence)) or bool(_PRODUCT_CLAIM.search(sentence))


async def grounding_check(reply: str, hits: list[SearchHit], turns: list[Turn], persona: Persona,
                          scenario: Scenario) -> list[ComplianceFlag]:
    """Flag product facts the customer asserts on its own that no allowed source (KB chunks,
    conversation, scenario incl. branch events, persona profile) supports. `turns` is the
    conversation before this reply."""
    allowed = "\n".join([*(h.chunk.text for h in hits), *(t.text for t in turns),
                         prompts.grounding_sources(scenario, persona)])
    try:
        d = await deps.generate_json(
            prompts.grounding_prompt(reply, hits, turns, persona, scenario, persona.locale), _GroundingDraft,
            system=prompts.GROUNDING_SYSTEM, model=deps.lite_model(), temperature=0.0,
            thinking=deps.FAST_THINKING)
    except Exception:
        log.warning("grounding LLM failed", exc_info=True)
        return []
    flags: list[ComplianceFlag] = []
    for c in d.unsupported:
        span = exact_span(reply, c.quote)
        if (span and is_customer_assertion(reply, span) and is_product_claim(reply, span, allowed)
                and all(f.quote != span for f in flags)):
            flags.append(ComplianceFlag(rule_id=GROUNDING_RULE_ID, severity="medium",
                                        message=c.message, quote=span))
    return flags


# ---------- Persona ----------

def hidden_needs_threshold(persona: Persona) -> int:
    """Trust needed to reveal hidden needs: 70, or 15 points above where a guarded persona starts."""
    return min(HIDDEN_NEEDS_TRUST, persona.initial_trust + HIDDEN_NEEDS_TRUST_GAIN)


async def persona_reply(persona: Persona, scenario: Scenario, turns: list[Turn], hits: list[SearchHit], *,
                        trust: int, patience: int, events: list[BranchEvent]) -> AsyncIterator[str]:
    """Stream the customer's reply. Hidden needs reach the prompt only above the trust threshold."""
    system = prompts.persona_system(persona, scenario, trust=trust, patience=patience,
                                    reveal_hidden=trust > hidden_needs_threshold(persona), events=events,
                                    locale=persona.locale)
    stream = deps.stream_text(prompts.persona_prompt(turns, persona, hits, turns[-1].text),
                              system=system, model=deps.fast_model(), thinking=deps.FAST_THINKING)
    if inspect.isawaitable(stream):  # tolerate a coroutine that returns the iterator
        stream = await stream
    async for chunk in stream:
        if chunk:
            yield chunk


async def opening_line(persona: Persona, scenario: Scenario) -> str:
    """Verbatim configured opening line; Gemini only when neither scenario nor persona has one."""
    if line := (scenario.opening_line or persona.opening_line or "").strip():
        return line
    system = prompts.persona_system(persona, scenario, trust=persona.initial_trust,
                                    patience=persona.initial_patience, reveal_hidden=False,
                                    events=[], locale=persona.locale)
    try:
        text = (await deps.generate_text(prompts.opening_prompt(persona, scenario), system=system,
                                         model=deps.fast_model(), thinking=deps.FAST_THINKING)).strip()
    except Exception:
        log.warning("opening line generation failed", exc_info=True)
        text = ""
    return text or "Hi. You wanted to talk to me?"


# ---------- State ----------

class _StateDraft(BaseModel):
    trust_delta: int
    patience_delta: int
    trust_reason: str
    patience_reason: str


class StateUpdate(BaseModel):
    trust: int
    patience: int
    trust_delta: int
    patience_delta: int
    reason: str


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


_CORRECTION = re.compile(r"\b(?:sorry|apologi[sz]e|apologies|i misspoke|i was wrong|let me correct|"
                         r"correction|to be clear|i should clarify|i made a mistake)\b", re.I)


def is_correction(turns: list[Turn], flags: list[ComplianceFlag]) -> bool:
    """A clean latest trainee turn that apologises for a flagged previous trainee turn."""
    trainee = [t for t in turns if t.role == "trainee"]
    if flags or len(trainee) < 2 or not trainee[-2].compliance:
        return False
    return bool(_CORRECTION.search(trainee[-1].text.replace("’", "'")))


async def state_update(persona: Persona, turns: list[Turn], flags: list[ComplianceFlag], *,
                       trust: int, patience: int) -> StateUpdate:
    summary = "; ".join(f"[{f.severity}] {f.message}" for f in flags)
    try:
        d = await deps.generate_json(
            prompts.state_prompt(persona, turns, trust=trust, patience=patience, flags_summary=summary,
                                 locale=persona.locale),
            _StateDraft, system=prompts.STATE_SYSTEM, model=deps.lite_model(), temperature=0.2,
            thinking=deps.FAST_THINKING)
        td, pd, reason = d.trust_delta, d.patience_delta, f"{d.trust_reason} {d.patience_reason}".strip()
    except Exception:
        log.warning("state LLM failed; applying default decay", exc_info=True)
        td, pd, reason = 0, -3, "State model unavailable; default patience decay applied."
    td = _clamp(td, MAX_TRUST_LOSS, MAX_TRUST_GAIN)
    pd = _clamp(pd, MAX_PATIENCE_LOSS, MAX_PATIENCE_GAIN)
    if any(f.severity == "high" for f in flags):
        td = min(td, -8)  # a serious violation always costs trust
    elif is_correction(turns, flags):
        td = max(td, 0)  # the mistake was already penalised in its own turn
    return StateUpdate(trust=_clamp(trust + td, 0, 100), patience=_clamp(patience + pd, 0, 100),
                       trust_delta=td, patience_delta=pd, reason=reason)


# ---------- Coach ----------

class _CoachDraft(BaseModel):
    hint: str
    technique: str | None = None
    citation_chunk_ids: list[str] = Field(default_factory=list)


_STOPWORDS = frozenset(
    "that this with have from your they them what when will would could should about there their which "
    "been were into than then just like only also very much more some does dont don't it's that's".split())
MIN_CITATION_OVERLAP = 3


def _terms(text: str) -> dict[str, int]:
    """Content words (weight 1) and numbers (weight 2) used to match a reply to KB sentences."""
    out: dict[str, int] = {}
    for w in re.findall(r"[a-z0-9$%]+(?:[.,'][a-z0-9]+)*", text.lower()):
        if any(c.isdigit() for c in w):
            out[w] = 2
        elif len(w) >= 4 and w not in _STOPWORDS:
            out[w] = 1
    return out


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def _best_sentence(hit: SearchHit, against: str) -> tuple[int, str]:
    want = _terms(against)
    scored = [(sum(w for t, w in _terms(s).items() if t in want), s) for s in _sentences(hit.chunk.text)]
    return max(scored, key=lambda x: x[0], default=(0, hit.chunk.text.strip()))


def _truncate(text: str, max_len: int = 240) -> str:
    return text if len(text) <= max_len else text[:max_len].rsplit(" ", 1)[0] + "…"


def citation_for(hit: SearchHit, against: str = "") -> Citation:
    """Cite `hit` with its sentence most relevant to `against` (its first sentence if none)."""
    score, sentence = _best_sentence(hit, against) if against else (0, "")
    quote = sentence if score else (_sentences(hit.chunk.text) or [hit.chunk.text])[0]
    return Citation(chunk_id=hit.chunk.id, document_title=hit.document_title, quote=_truncate(quote))


def reply_citations(reply: str, hits: list[SearchHit]) -> list[Citation]:
    """Cite only the chunks whose facts the reply actually uses; a fact-free reply cites nothing."""
    cites = []
    for hit in hits:
        score, sentence = _best_sentence(hit, reply)
        if score >= MIN_CITATION_OVERLAP:
            cites.append(Citation(chunk_id=hit.chunk.id, document_title=hit.document_title,
                                  quote=_truncate(sentence)))
    return cites


async def coach_hint(scenario: Scenario, persona: Persona, turns: list[Turn], hits: list[SearchHit], *,
                     trust: int, patience: int) -> CoachHint | None:
    try:
        d = await deps.generate_json(
            prompts.coach_prompt(scenario, persona, turns, hits, trust=trust, patience=patience,
                                 locale=persona.locale),
            _CoachDraft, system=prompts.COACH_SYSTEM, model=deps.lite_model(), temperature=0.4,
            thinking=deps.FAST_THINKING)
    except Exception:
        log.warning("coach LLM failed", exc_info=True)
        return None
    by_id = {h.chunk.id: h for h in hits}
    cites = [citation_for(by_id[c], d.hint) for c in dict.fromkeys(d.citation_chunk_ids) if c in by_id]
    return CoachHint(hint=d.hint, technique=d.technique, citations=cites)


# ---------- Final report ----------

class _EvidenceDraft(BaseModel):
    turn_index: int
    quote: str


class _DimensionDraft(BaseModel):
    rubric_id: str
    score: int
    feedback: str
    evidence: list[_EvidenceDraft] = Field(default_factory=list)


class _ReportDraft(BaseModel):
    summary: str
    dimensions: list[_DimensionDraft] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


def verify_evidence(e: _EvidenceDraft, turns: list[Turn]) -> Evidence:
    """A quote is verified only if it is a substring of a trainee turn (claimed turn first)."""
    trainee = [t for t in turns if t.role == "trainee"]
    trainee.sort(key=lambda t: t.index != e.turn_index)
    for t in trainee:
        if span := exact_span(t.text, e.quote):
            return Evidence(turn_index=t.index, quote=span, verified=True)
    return Evidence(turn_index=e.turn_index, quote=e.quote, verified=False)


def unique_citations(turns: list[Turn]) -> list[Citation]:
    seen: dict[str, Citation] = {}
    for t in turns:
        for c in t.citations + (t.coach.citations if t.coach else []):
            seen.setdefault(c.chunk_id, c)
    return list(seen.values())


class _SummaryDraft(BaseModel):
    summary: str
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


_UNSET: Any = object()


async def final_report(session_id: str, scenario: Scenario, persona: Persona, turns: list[Turn], *,
                       model: str | None = None, thinking: str | None = _UNSET,
                       parallel: bool | None = None) -> Report:
    """Assess the session. Parallel mode runs one call per rubric dimension plus one for the
    summary, so wall time is the slowest single call instead of one long generation.
    `model`/`thinking`/`parallel` default to deps' REPORT_* settings (overridable for benchmarks)."""
    rubric = scenario.rubric or DEFAULT_RUBRIC
    violations = [f for t in turns if t.role == "trainee" for f in t.compliance]
    vsum = "; ".join(f"[{f.severity}] {f.message} ('{f.quote}')" for f in violations)
    kw = dict(system=prompts.REPORT_SYSTEM, model=model or deps.report_model(), temperature=0.2,
              thinking=deps.REPORT_THINKING if thinking is _UNSET else thinking)
    loc = persona.locale

    if deps.REPORT_PARALLEL if parallel is None else parallel:
        summary, *dims = await asyncio.gather(
            deps.generate_json(prompts.summary_prompt(scenario, persona, turns, rubric, vsum, loc),
                               _SummaryDraft, **kw),
            *(deps.generate_json(prompts.dimension_prompt(scenario, persona, turns, rubric, item, vsum, loc),
                                 _DimensionDraft, **kw) for item in rubric))
        # Each call was asked about one rubric item; trust the position, not the echoed id.
        for item, d in zip(rubric, dims):
            d.rubric_id = item.id
        draft = _ReportDraft(summary=summary.summary, strengths=summary.strengths,
                             improvements=summary.improvements, dimensions=dims)
    else:
        draft = await deps.generate_json(prompts.report_prompt(scenario, persona, turns, rubric, vsum, loc),
                                         _ReportDraft, **kw)

    drafts = {d.rubric_id: d for d in draft.dimensions}
    dimensions: list[DimensionScore] = []
    for item in rubric:
        d = drafts.get(item.id)
        if d is None:
            dimensions.append(DimensionScore(rubric_id=item.id, name=item.name, score=0,
                                             feedback="Not assessed: no evidence in the transcript."))
            continue
        evidence = [verify_evidence(e, turns) for e in d.evidence]
        score, feedback = _clamp(d.score, 0, 100), d.feedback
        if not any(e.verified for e in evidence):
            score = min(score, NO_EVIDENCE_CAP)
            feedback = f"No evidence: no verified quote from the trainee supports this score. {feedback}"
        dimensions.append(DimensionScore(rubric_id=item.id, name=item.name, score=score,
                                         feedback=feedback, evidence=evidence))

    weights = {r.id: max(r.weight, 0.0) for r in rubric}
    total = sum(weights.values()) or 1.0
    overall = round(sum(d.score * weights[d.rubric_id] for d in dimensions) / total)
    passed = not any(f.severity == "high" for f in violations)
    if not passed:
        overall = min(overall, COMPLIANCE_FAIL_CAP)

    return Report(session_id=session_id, overall_score=_clamp(overall, 0, 100), compliance_passed=passed,
                  summary=draft.summary, dimensions=dimensions, compliance_violations=violations,
                  strengths=draft.strengths, improvements=draft.improvements,
                  knowledge_citations=unique_citations(turns))

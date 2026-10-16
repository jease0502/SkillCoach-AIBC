"""Persona generation (from a brief or from company documents) and persistence."""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.builder import _deps, prompts
from app.builder.errors import GenerationError, NotFound, ValidationFailed
from app.builder.grounding import CitationDraft, Grounding
from app.builder.ids import new_id
from app.builder.validation import apply_difficulty, normalize_locale, persona_issues, real_person_issue
from app.schemas import Citation, Objection, Persona, now

log = logging.getLogger(__name__)

COLLECTION = "personas"

# Latency budget: segment planning is one short Flash call, then every persona
# is expanded in parallel; all calls use low thinking.
THINKING = "low"


# ---------- model-facing schema ----------
# Kept flat and default-free so it works well with Gemini structured output.
# The server turns a draft into a Persona (ids, presets, verified citations).

class ObjectionDraft(BaseModel):
    text: str
    trigger: str
    citations: list[CitationDraft]


class TextWithCitations(BaseModel):
    text: str
    citations: list[CitationDraft]


class PersonaDraft(BaseModel):
    name: str
    title: str
    age: int
    industry: str
    summary: str
    personality: list[str]
    communication_style: str
    goals: list[TextWithCitations]
    hidden_needs: list[TextWithCitations]
    objections: list[ObjectionDraft]
    knowledge_level: Literal["novice", "intermediate", "expert"]
    difficulty: int
    opening_line: str


class SegmentCard(BaseModel):
    name: str
    label: str
    who: str
    typical_objections: list[str]
    hidden_need: str
    suggested_difficulty: int
    source_chunk_ids: list[str]


class SegmentList(BaseModel):
    segments: list[SegmentCard]


# ---------- conversion ----------

def draft_to_persona(draft: PersonaDraft, grounding: Grounding, *, locale: str,
                     source: Literal["brief", "documents"], document_ids: list[str]) -> Persona:
    """Build a Persona; every kept citation says which attribute it supports."""
    citations: list[Citation] = []

    objections: list[Objection] = []
    for o in draft.objections:
        if o.text.strip():
            oid = f"obj-{len(objections) + 1}"
            objections.append(Objection(id=oid, text=o.text.strip(), trigger=o.trigger.strip()))
            citations += grounding.verify(o.citations, supports=f"objection:{oid}")

    def texts(items: list[TextWithCitations], kind: str) -> list[str]:
        out: list[str] = []
        for item in items:
            if item.text.strip():
                citations.extend(grounding.verify(item.citations, supports=f"{kind}:{len(out)}"))
                out.append(item.text.strip())
        return out

    hidden_needs = texts(draft.hidden_needs, "hidden_need")
    goals = texts(draft.goals, "goal")

    persona = Persona(
        name=draft.name.strip(),
        title=draft.title.strip(),
        age=draft.age if 18 <= draft.age <= 95 else None,
        industry=draft.industry.strip() or None,
        locale=locale,
        summary=draft.summary.strip(),
        personality=[p.strip() for p in draft.personality if p.strip()][:5],
        communication_style=draft.communication_style.strip(),
        goals=goals,
        hidden_needs=hidden_needs,
        objections=objections,
        knowledge_level=draft.knowledge_level,
        difficulty=min(5, max(1, draft.difficulty)),
        opening_line=draft.opening_line.strip(),
        source=source,
        source_document_ids=document_ids or grounding.document_ids,
        citations=citations,
        status="draft",
    )
    return apply_difficulty(persona)


def _draft_errors(persona: Persona, *, need_citations: bool) -> list[str]:
    errors = persona_issues(persona)
    if not persona.objections:
        errors.append("at least one objection is required")
    if not persona.hidden_needs:
        errors.append("at least one hidden need is required")
    if not persona.opening_line:
        errors.append("opening_line is required")
    if need_citations and not persona.citations:
        errors.append("no citation matched the knowledge; quote chunk text verbatim with its exact id")
    return errors


# ---------- generation ----------

async def _search(query: str, k: int, document_ids: list[str] | None) -> Grounding:
    try:
        return Grounding.from_hits(await _deps.search(query, k=k, document_ids=document_ids or None))
    except Exception:  # KB grounding is best effort
        log.exception("KB search failed for %r", query[:80])
        return Grounding([], {})


async def _expand(brief: str, grounding: Grounding, *, locale: str, source: Literal["brief", "documents"],
                  document_ids: list[str], need_citations: bool) -> Persona:
    """One persona from a brief, with one retry that carries the validation errors."""
    errors: list[str] = []
    for _attempt in range(2):
        prompt = prompts.PERSONA_FROM_BRIEF.format(
            brief=brief, locale=locale, knowledge=grounding.format(),
            feedback=prompts.retry_feedback(errors))
        try:
            draft = await _deps.generate_json(prompt, PersonaDraft, system=prompts.PERSONA_SYSTEM,
                                              model=_deps.persona_model(), temperature=0.9,
                                              thinking=THINKING)
            draft = PersonaDraft.model_validate(draft, from_attributes=True)
        except (ValidationError, ValueError) as exc:
            errors = [f"output did not match the schema: {exc}"[:500]]
            continue
        except Exception as exc:
            raise GenerationError(f"Persona generation failed: {exc}") from exc
        persona = draft_to_persona(draft, grounding, locale=locale, source=source, document_ids=document_ids)
        errors = _draft_errors(persona, need_citations=need_citations)
        if not errors:
            return persona
    raise GenerationError("Persona generation failed validation: " + "; ".join(errors))


async def generate_from_brief(brief: str, document_ids: list[str] | None = None,
                              locale: str | None = None) -> Persona:
    if not brief.strip():
        raise ValidationFailed(["brief must not be empty"])
    grounding = await _search(brief, 6, document_ids)
    return await _expand(brief.strip(), grounding, locale=normalize_locale(locale), source="brief",
                         document_ids=list(document_ids or []), need_citations=False)


async def _grounding_for_docs(document_ids: list[str] | None) -> Grounding:
    """All chunks of the selected docs, topped up with targeted searches."""
    titles = await _deps.document_titles(document_ids)
    grounding = Grounding(await _deps.get_chunks(document_ids or None, limit=40), titles)
    for extra in await asyncio.gather(*(_search(q, 4, document_ids) for q in prompts.SEGMENT_QUERIES)):
        grounding = grounding.merge(extra)
    return grounding


async def plan_segments(grounding: Grounding, count: int, locale: str) -> list[SegmentCard]:
    """Step 1 (Flash): read the docs and propose `count` distinct customer segments."""
    errors: list[str] = []
    for _attempt in range(2):
        prompt = prompts.SEGMENTS_PROMPT.format(locale=locale, count=count, knowledge=grounding.format(),
                                                feedback=prompts.retry_feedback(errors))
        try:
            result = await _deps.generate_json(prompt, SegmentList, system=prompts.SEGMENTS_SYSTEM,
                                               model=_deps.fast_model(), temperature=0.8, thinking=THINKING)
            segments = SegmentList.model_validate(result, from_attributes=True).segments
        except (ValidationError, ValueError) as exc:
            errors = [f"output did not match the schema: {exc}"[:500]]
            continue
        except Exception as exc:
            raise GenerationError(f"Segment planning failed: {exc}") from exc
        # The name is fixed here ("Name the persona exactly ..."), so famous names must be
        # rejected at this step; the expansion retry could not change them.
        unique: list[SegmentCard] = []
        names: set[str] = set()
        rejected: list[str] = []
        for seg in segments:
            key = seg.name.strip().casefold()
            if (issue := real_person_issue(seg.name)):
                rejected.append(issue)
            elif key and key not in names:
                names.add(key)
                unique.append(seg)
        if len(unique) >= count:
            return unique[:count]
        errors = [f"return exactly {count} segments, each with a different persona name", *rejected]
    raise GenerationError("Segment planning failed: " + "; ".join(errors))


def _segment_brief(seg: SegmentCard) -> str:
    return (f"Name the persona exactly {seg.name.strip()}. Segment: {seg.label}. {seg.who} "
            f"Typical objections: {'; '.join(seg.typical_objections)}. Hidden need: {seg.hidden_need}. "
            f"Target difficulty: {min(5, max(1, seg.suggested_difficulty))}.")


async def generate_from_docs(document_ids: list[str] | None = None, count: int = 3,
                             locale: str | None = None) -> list[Persona]:
    """Plan segments with Flash, then expand every segment into a persona in parallel."""
    count = min(6, max(1, count))
    locale = normalize_locale(locale)
    grounding = await _grounding_for_docs(document_ids)
    if not grounding:
        raise ValidationFailed(["the knowledge base has no documents to read; upload documents first"])
    segments = await plan_segments(grounding, count, locale)

    async def expand(seg: SegmentCard) -> Persona:
        # The segment's own chunks come first so the expansion grounds on them.
        own = Grounding([grounding.chunks[c] for c in seg.source_chunk_ids if c in grounding.chunks],
                        grounding.titles)
        return await _expand(_segment_brief(seg), own.merge(grounding), locale=locale, source="documents",
                             document_ids=list(document_ids or []), need_citations=True)

    results = await asyncio.gather(*(expand(s) for s in segments), return_exceptions=True)
    personas: list[Persona] = []
    names: set[str] = set()
    failures: list[str] = []
    for seg, result in zip(segments, results):
        if isinstance(result, BaseException):
            failures.append(f"{seg.name}: {result}")
        elif result.name.casefold() in names:
            failures.append(f"{seg.name}: duplicate name")
        else:
            names.add(result.name.casefold())
            personas.append(result)
    if failures:
        log.warning("Dropped %d of %d personas: %s", len(failures), count, failures)
    if not personas:
        raise GenerationError("Persona generation failed: " + "; ".join(failures))
    return personas


# ---------- persistence ----------

async def list_personas() -> list[Persona]:
    rows = await _deps.get_store().list(COLLECTION)
    personas = [Persona.model_validate(r) for r in rows]
    return sorted(personas, key=lambda p: p.created_at, reverse=True)


async def get_persona(persona_id: str) -> Persona:
    row = await _deps.get_store().get(COLLECTION, persona_id)
    if row is None:
        raise NotFound(f"Persona {persona_id} not found")
    return Persona.model_validate(row)


async def _put(persona: Persona) -> Persona:
    await _deps.get_store().put(COLLECTION, persona.id, persona.model_dump(mode="json"))
    return persona


def _normalized(persona: Persona, **update) -> Persona:
    persona = persona.model_copy(update={**update, "objections": _ensure_objection_ids(persona.objections)})
    return persona.model_copy(update={"citations": prune_citations(persona)})


async def create_persona(persona: Persona) -> Persona:
    """Save a new persona. New personas start as drafts until approved."""
    persona = _normalized(persona, id=new_id("per"), status="draft", created_at=now())
    if issues := persona_issues(persona):
        raise ValidationFailed(issues)
    return await _put(persona)


async def update_persona(persona_id: str, persona: Persona) -> Persona:
    current = await get_persona(persona_id)
    persona = _normalized(persona, id=persona_id, status=current.status, created_at=current.created_at)
    if issues := persona_issues(persona):
        raise ValidationFailed(issues)
    return await _put(persona)


async def approve_persona(persona_id: str) -> Persona:
    persona = await get_persona(persona_id)
    if issues := persona_issues(persona):
        raise ValidationFailed(issues)
    return await _put(persona.model_copy(update={"status": "approved"}))


async def delete_persona(persona_id: str) -> None:
    await get_persona(persona_id)
    await _deps.get_store().delete(COLLECTION, persona_id)


def _ensure_objection_ids(objections: list[Objection]) -> list[Objection]:
    seen: set[str] = set()
    out = []
    for i, o in enumerate(objections):
        oid = o.id.strip() or f"obj-{i + 1}"
        while oid in seen:
            oid = f"{oid}-{i + 1}"
        seen.add(oid)
        out.append(o.model_copy(update={"id": oid}))
    return out


def supported_targets(persona: Persona) -> set[str]:
    """Every valid `Citation.supports` value for this persona."""
    return ({f"objection:{o.id}" for o in persona.objections}
            | {f"hidden_need:{i}" for i in range(len(persona.hidden_needs))}
            | {f"goal:{i}" for i in range(len(persona.goals))})


def prune_citations(persona: Persona) -> list[Citation]:
    """Drop citations whose attribute was edited away (untagged citations are kept)."""
    targets = supported_targets(persona)
    return [c for c in persona.citations if c.supports is None or c.supports in targets]

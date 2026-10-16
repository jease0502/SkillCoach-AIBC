"""Scenario generation (persona + trainee goal + KB) and persistence."""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Literal

from pydantic import BaseModel, ValidationError

from app.builder import _deps, prompts
from app.builder.errors import Conflict, GenerationError, NotFound, ValidationFailed
from app.builder.grounding import CitationDraft, Grounding
from app.builder.ids import new_id
from app.builder.persona import get_persona
from app.schemas import BranchEvent, ComplianceRule, Persona, RubricItem, Scenario, now

log = logging.getLogger(__name__)

COLLECTION = "scenarios"

# Documents whose title looks like a rulebook are the only source of compliance rules.
_RULEBOOK_TITLE = re.compile(r"conduct|compliance|polic|rule|guideline|regulat|disclosure", re.I)
_RULE_CODE = re.compile(r"\b[A-Z]{2,4}-\d{1,3}\b")
THINKING = "low"
TRIGGER = re.compile(r"^\s*(turn|trust|patience)\s*(>=|<=|>|<|==)\s*(\d{1,3})\s*$")


# ---------- model-facing schema ----------

class ComplianceRuleDraft(BaseModel):
    code: str
    rule: str
    severity: Literal["low", "medium", "high"]
    citations: list[CitationDraft]


class RubricItemDraft(BaseModel):
    name: str
    description: str
    weight: float
    citations: list[CitationDraft]


class BranchEventDraft(BaseModel):
    trigger: str
    event: str


class ScenarioDraft(BaseModel):
    title: str
    description: str
    context: str
    success_criteria: list[str]
    compliance_rules: list[ComplianceRuleDraft]
    rubric: list[RubricItemDraft]
    branch_events: list[BranchEventDraft]
    max_turns: int


# ---------- grounding ----------

async def _gather(persona: Persona, trainee_goal: str,
                  document_ids: list[str] | None) -> tuple[Grounding, Grounding]:
    """Return (rule sources, other knowledge)."""
    titles = await _deps.document_titles(document_ids)
    rule_doc_ids = [d for d, t in titles.items() if _RULEBOOK_TITLE.search(t)]

    rules = Grounding([], titles)
    if rule_doc_ids:
        rules = Grounding(await _deps.get_chunks(rule_doc_ids, limit=40), titles)
    else:  # no rulebook uploaded: fall back to rule-like passages anywhere
        for hits in await asyncio.gather(*(_search(q, 4, document_ids) for q in prompts.RULE_QUERIES)):
            rules = rules.merge(Grounding.from_hits(hits))

    knowledge = Grounding([], titles)
    objections = " ".join(o.text for o in persona.objections)
    queries = [q for q in (trainee_goal, f"{persona.title}. {persona.summary}", objections) if q.strip()]
    for hits in await asyncio.gather(*(_search(q, 6, document_ids) for q in queries)):
        knowledge = knowledge.merge(Grounding.from_hits(hits))
    knowledge = Grounding([c for cid, c in knowledge.chunks.items() if cid not in rules.chunks], titles)
    return rules, knowledge


async def _search(query: str, k: int, document_ids: list[str] | None):
    try:
        return await _deps.search(query, k=k, document_ids=document_ids or None)
    except Exception:
        log.exception("KB search failed for %r", query)
        return []


def _persona_brief(p: Persona) -> str:
    lines = [
        f"Name: {p.name} ({p.title}{', age ' + str(p.age) if p.age else ''})",
        f"Summary: {p.summary}",
        f"Personality: {', '.join(p.personality)}; style: {p.communication_style}",
        f"Goals: {'; '.join(p.goals)}",
        f"Hidden needs: {'; '.join(p.hidden_needs)}",
        "Objections: " + "; ".join(f"{o.text} ({o.trigger})" for o in p.objections),
        f"Difficulty: {p.difficulty}/5, knowledge level: {p.knowledge_level}",
        f"Opening line: {p.opening_line}",
    ]
    return "\n".join(lines)


# ---------- conversion ----------

def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "item"


def _unique(ids: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for i in ids:
        n = seen.get(i, 0)
        seen[i] = n + 1
        out.append(i if n == 0 else f"{i}-{n + 1}")
    return out


def _tag(item, kind: str):
    """Point each citation at the rule or rubric item it backs ("rule:CC-01")."""
    cites = [c.model_copy(update={"supports": f"{kind}:{item.id}"}) for c in item.citations]
    return item.model_copy(update={"citations": cites})


def draft_to_scenario(draft: ScenarioDraft, persona: Persona, trainee_goal: str,
                      rules: Grounding, knowledge: Grounding,
                      document_ids: list[str]) -> tuple[Scenario, list[str]]:
    """Convert a draft; returns the scenario plus problems worth a retry."""
    problems: list[str] = []
    everything = rules.merge(knowledge)

    compliance: list[ComplianceRule] = []
    for d in draft.compliance_rules:
        cites = rules.verify(d.citations)
        if not cites:
            problems.append(f"rule '{d.rule[:60]}' has no verbatim citation from RULE SOURCES; dropped")
            continue
        code = d.code.strip().upper()
        if not _RULE_CODE.fullmatch(code):
            found = _RULE_CODE.search(" ".join(c.quote for c in cites))
            code = found.group() if found else ""
        compliance.append(ComplianceRule(id=code, rule=d.rule.strip(), severity=d.severity, citations=cites))
    ids = _unique([r.id or f"rule-{i + 1}" for i, r in enumerate(compliance)])
    compliance = [_tag(r.model_copy(update={"id": i}), "rule") for r, i in zip(compliance, ids)]

    rubric = [RubricItem(id=_slug(r.name), name=r.name.strip(), description=r.description.strip(),
                         weight=round(min(2.0, max(0.5, r.weight)), 2),
                         citations=everything.verify(r.citations))
              for r in draft.rubric if r.name.strip()]
    rubric = [_tag(r.model_copy(update={"id": i}), "rubric") for r, i in zip(rubric, _unique([r.id for r in rubric]))]
    if not rubric:
        problems.append("rubric must have 3 to 5 dimensions")

    events = []
    for d in draft.branch_events:
        if TRIGGER.match(d.trigger) and d.event.strip():
            events.append(BranchEvent(id=f"evt-{len(events) + 1}", trigger=" ".join(
                TRIGGER.match(d.trigger).groups()), event=d.event.strip()))
        else:
            problems.append(f"branch trigger '{d.trigger}' does not follow the grammar; dropped")

    scenario = Scenario(
        title=draft.title.strip(),
        description=draft.description.strip(),
        persona_id=persona.id,
        trainee_goal=trainee_goal.strip(),
        context=draft.context.strip(),
        success_criteria=[s.strip() for s in draft.success_criteria if s.strip()],
        compliance_rules=compliance,
        rubric=rubric,
        branch_events=events,
        document_ids=document_ids or everything.document_ids,
        difficulty=persona.difficulty,
        max_turns=min(30, max(6, draft.max_turns)),
    )
    return scenario, problems


# ---------- generation ----------

def _serious(scenario: Scenario, rules: Grounding) -> list[str]:
    out = []
    if rules and not scenario.compliance_rules:
        out.append("no compliance rules: extract them from RULE SOURCES with verbatim quotes")
    if len(scenario.rubric) < 2:
        out.append("rubric must have 3 to 5 dimensions")
    return out


async def generate_scenario(persona_id: str, trainee_goal: str,
                            document_ids: list[str] | None = None) -> Scenario:
    if not trainee_goal.strip():
        raise ValidationFailed(["trainee_goal must not be empty"])
    persona = await get_persona(persona_id)
    if persona.status != "approved":
        raise Conflict("Persona must be approved before it can be used in a scenario")
    rules, knowledge = await _gather(persona, trainee_goal, document_ids)

    problems: list[str] = []
    best: tuple[Scenario, list[str]] | None = None
    for _attempt in range(2):
        prompt = prompts.SCENARIO_PROMPT.format(
            locale=persona.locale, trainee_goal=trainee_goal.strip(), persona=_persona_brief(persona),
            rules=rules.format(30_000), knowledge=knowledge.format(30_000),
            feedback=prompts.retry_feedback(problems))
        try:
            result = await _deps.generate_json(prompt, ScenarioDraft, system=prompts.SCENARIO_SYSTEM,
                                               model=_deps.scenario_model(), temperature=0.4,
                                               thinking=THINKING)
            draft = ScenarioDraft.model_validate(result, from_attributes=True)
        except (ValidationError, ValueError) as exc:
            problems = [f"output did not match the schema: {exc}"[:500]]
            continue
        except Exception as exc:
            raise GenerationError(f"Scenario generation failed: {exc}") from exc
        scenario, problems = draft_to_scenario(draft, persona, trainee_goal, rules, knowledge,
                                               list(document_ids or []))
        serious = _serious(scenario, rules)
        problems += serious
        if best is None or len(problems) < len(best[1]):
            best = (scenario, problems)
        if not serious:  # minor drops are logged, not worth another slow call
            break
    if best is None or _serious(best[0], rules):
        raise GenerationError("Scenario generation failed: " + "; ".join(problems))
    if best[1]:
        log.info("Scenario draft kept with %d dropped items: %s", len(best[1]), best[1])
    return best[0]


# ---------- persistence ----------

async def list_scenarios() -> list[Scenario]:
    rows = await _deps.get_store().list(COLLECTION)
    return sorted((Scenario.model_validate(r) for r in rows), key=lambda s: s.created_at, reverse=True)


async def get_scenario(scenario_id: str) -> Scenario:
    row = await _deps.get_store().get(COLLECTION, scenario_id)
    if row is None:
        raise NotFound(f"Scenario {scenario_id} not found")
    return Scenario.model_validate(row)


async def _check(scenario: Scenario) -> None:
    persona = await get_persona(scenario.persona_id)
    if persona.status != "approved":
        raise Conflict("Persona must be approved before it can be used in a scenario")
    issues = []
    if not scenario.title.strip():
        issues.append("title is required")
    for kind, items in (("compliance rule", scenario.compliance_rules), ("rubric", scenario.rubric),
                        ("branch event", scenario.branch_events)):
        ids = [i.id for i in items]
        if any(not i for i in ids) or len(ids) != len(set(ids)):
            issues.append(f"{kind} ids must be non-empty and unique")
    for e in scenario.branch_events:
        if not TRIGGER.match(e.trigger):
            issues.append(f"branch trigger '{e.trigger}' must look like 'turn >= 4' or 'trust < 30'")
    if issues:
        raise ValidationFailed(issues)


async def create_scenario(scenario: Scenario) -> Scenario:
    await _check(scenario)
    scenario = scenario.model_copy(update={"id": new_id("scn"), "created_at": now()})
    await _deps.get_store().put(COLLECTION, scenario.id, scenario.model_dump(mode="json"))
    return scenario


async def update_scenario(scenario_id: str, scenario: Scenario) -> Scenario:
    current = await get_scenario(scenario_id)
    await _check(scenario)
    scenario = scenario.model_copy(update={"id": scenario_id, "created_at": current.created_at})
    await _deps.get_store().put(COLLECTION, scenario.id, scenario.model_dump(mode="json"))
    return scenario


async def delete_scenario(scenario_id: str) -> None:
    await get_scenario(scenario_id)
    await _deps.get_store().delete(COLLECTION, scenario_id)

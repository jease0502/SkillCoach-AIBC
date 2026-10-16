import pytest

from app.builder import _deps
from app.builder.errors import Conflict, GenerationError
from app.builder.persona import (
    PersonaDraft, SegmentList, approve_persona, create_persona, generate_from_brief, generate_from_docs,
)
from app.builder.scenario import ScenarioDraft, generate_scenario
from app.builder.validation import DIFFICULTY_PRESETS
from app.schemas import Persona

from .conftest import chunks_in_prompt, first_sentence


def persona_draft(prompt: str, *, name="Priya Raman", difficulty=4, title="Owner of a 12-person bakery",
                  fake_citation=False) -> dict:
    """A draft that cites the first chunk shown in the prompt (if any)."""
    blocks = chunks_in_prompt(prompt)
    cites = [{"chunk_id": blocks[0][0], "quote": first_sentence(blocks[0][2])}] if blocks else []
    if fake_citation:
        cites.append({"chunk_id": "made-up-id", "quote": "This sentence is not in any document at all."})
    return {
        "name": name, "title": title, "age": 52, "industry": "Food retail",
        "summary": "Runs a busy neighborhood bakery and watches every cost.",
        "personality": ["frugal", "warm", "skeptical", "busy", "proud", "extra"],
        "communication_style": "Friendly but short on time.",
        "goals": [{"text": "Cut admin time", "citations": cites}],
        "hidden_needs": [{"text": "Afraid her staff will not adopt new software.", "citations": cites}],
        "objections": [{"text": "That price is too high for a small shop.", "trigger": "when price is mentioned",
                        "citations": cites}],
        "knowledge_level": "novice", "difficulty": difficulty,
        "opening_line": "I can give you five minutes before the lunch rush.",
    }


# ---------- generate_from_brief ----------

def test_brief_persona_is_a_grounded_draft(run, seeded, llm):
    llm.queue(lambda p, s: PersonaDraft.model_validate(persona_draft(p, fake_citation=True)))
    persona = run(generate_from_brief("Cost-conscious owner of a small analytics customer", locale="en-US"))

    assert persona.id == "" and persona.status == "draft" and persona.source == "brief"
    assert (persona.initial_trust, persona.initial_patience) == DIFFICULTY_PRESETS[4]
    assert len(persona.personality) == 5
    assert [o.id for o in persona.objections] == ["obj-1"]
    assert persona.citations, "verified citation should be kept"
    assert all(c.chunk_id != "made-up-id" for c in persona.citations)
    assert {c.supports for c in persona.citations} == {"objection:obj-1", "hidden_need:0", "goal:0"}
    assert llm.calls[0]["model"] == _deps.persona_model() and llm.calls[0]["thinking"] == "low"
    assert "KNOWLEDGE" in llm.calls[0]["prompt"]


def test_brief_retries_once_after_a_real_person_name(run, llm):
    llm.queue(lambda p, s: persona_draft(p, name="Elon Musk"),
              lambda p, s: persona_draft(p, name="Marta Silva"))
    persona = run(generate_from_brief("A demanding tech CEO"))
    assert persona.name == "Marta Silva"
    assert "real public figure" in llm.calls[1]["prompt"]


def test_brief_retries_after_a_fictional_character_name(run, llm):
    llm.queue(lambda p, s: persona_draft(p, name="Eleanor Vance"),
              lambda p, s: persona_draft(p, name="Mei-Ling Ong"))
    persona = run(generate_from_brief("A cautious pre-retiree"))
    assert persona.name == "Mei-Ling Ong"
    assert "well-known fictional character" in llm.calls[1]["prompt"]


def test_prompts_forbid_fictional_character_names():
    from app.builder import prompts

    for text in (" ".join(prompts.PERSONA_SYSTEM.split()), " ".join(prompts.SEGMENTS_SYSTEM.split())):
        assert "well-known fictional characters" in text and "culturally plausible" in text


def test_brief_fails_after_two_bad_outputs(run, llm):
    llm.queue(lambda p, s: persona_draft(p, name="Elon Musk"), lambda p, s: persona_draft(p, name="Elon Musk"))
    with pytest.raises(GenerationError):
        run(generate_from_brief("A demanding tech CEO"))


def test_brief_without_kb_still_works(run, llm):
    llm.queue(lambda p, s: persona_draft(p))
    persona = run(generate_from_brief("Retired teacher choosing a savings plan"))
    assert persona.citations == [] and "(no knowledge provided)" in llm.calls[0]["prompt"]


# ---------- generate_from_docs ----------

def _plan(names: list[str]):
    def respond(prompt, _schema):
        blocks = chunks_in_prompt(prompt)
        return SegmentList.model_validate({"segments": [
            {"name": n, "label": f"Segment {i}", "who": "A customer.", "typical_objections": ["Too pricey"],
             "hidden_need": "Fear of change", "suggested_difficulty": i + 2,
             "source_chunk_ids": [blocks[i % len(blocks)][0], "made-up"]}
            for i, n in enumerate(names)]})
    return respond


def _expansion(prompt, _schema):
    """Persona named as the brief says, citing the segment's own chunk (listed first)."""
    name = prompt.split("Name the persona exactly ", 1)[1].split(". Segment", 1)[0]
    difficulty = int(prompt.split("Target difficulty: ", 1)[1][0])
    return persona_draft(prompt, name=name, difficulty=difficulty)


def test_docs_plan_with_flash_then_expand_in_parallel(run, seeded, llm):
    llm.queue(_plan(["Ana Ruiz", "Ben Okafor", "Chloe Park"]), _expansion, _expansion, _expansion)
    personas = run(generate_from_docs(count=3))

    assert [p.name for p in personas] == ["Ana Ruiz", "Ben Okafor", "Chloe Park"]
    assert all(p.source == "documents" and p.status == "draft" and p.citations for p in personas)
    assert [p.difficulty for p in personas] == [2, 3, 4]
    chunks = {r["id"]: " ".join(r["text"].split()) for r in run(_deps.get_store().list("chunks"))}
    for p in personas:
        assert {c.supports for c in p.citations} == {"objection:obj-1", "hidden_need:0", "goal:0"}
        for c in p.citations:
            assert c.quote in chunks[c.chunk_id]
    # Each expansion sees its own segment chunk first.
    first_ids = [chunks_in_prompt(c["prompt"])[0][0] for c in llm.calls[1:]]
    assert len(set(first_ids)) == 3
    assert llm.calls[0]["schema"] is SegmentList and llm.calls[0]["model"] == _deps.fast_model()
    assert all(c["thinking"] == "low" for c in llm.calls)


def test_docs_duplicate_segment_names_trigger_replan(run, seeded, llm):
    llm.queue(_plan(["Ana Ruiz", "Ana Ruiz", "Chloe Park"]), _plan(["Ana Ruiz", "Ben Okafor", "Chloe Park"]),
              _expansion, _expansion, _expansion)
    personas = run(generate_from_docs(count=3))
    assert len(personas) == 3 and "different persona name" in llm.calls[1]["prompt"]


def test_docs_fictional_segment_name_triggers_replan(run, seeded, llm):
    # The segment name is passed on verbatim, so it has to be fixed at planning time.
    llm.queue(_plan(["Marcus Brody", "Ben Okafor", "Chloe Park"]), _plan(["Ana Ruiz", "Ben Okafor", "Chloe Park"]),
              _expansion, _expansion, _expansion)
    personas = run(generate_from_docs(count=3))
    assert [p.name for p in personas] == ["Ana Ruiz", "Ben Okafor", "Chloe Park"]
    assert "well-known fictional character" in llm.calls[1]["prompt"]


def test_docs_keep_the_personas_that_succeed(run, seeded, llm):
    def boom(_p, _s):
        raise RuntimeError("quota")
    llm.queue(_plan(["Ana Ruiz", "Ben Okafor"]), _expansion, boom)
    personas = run(generate_from_docs(count=2))
    assert [p.name for p in personas] == ["Ana Ruiz"]


def test_docs_require_documents(run, llm):
    from app.builder.errors import ValidationFailed

    with pytest.raises(ValidationFailed):
        run(generate_from_docs())


# ---------- generate_scenario ----------

def _scenario_draft(prompt: str, _schema=None) -> ScenarioDraft:
    rules = chunks_in_prompt(prompt, "RULE SOURCES")
    cc01 = next((cid, text) for cid, _t, text in rules if "CC-01:" in text)
    knowledge = chunks_in_prompt(prompt[prompt.index("\n\nKNOWLEDGE"):])
    return ScenarioDraft.model_validate({
        "title": "Retirement plan suitability", "description": "Explain the plan honestly.",
        "context": "You are an adviser.", "success_criteria": ["No guarantees made"],
        "compliance_rules": [
            {"code": "", "rule": "Never promise guaranteed returns or principal.", "severity": "high",
             "citations": [{"chunk_id": cc01[0], "quote": first_sentence(cc01[1], "CC-01")}]},
            {"code": "XX-99", "rule": "Always wear a tie.", "severity": "low",
             "citations": [{"chunk_id": cc01[0], "quote": "Advisers must always wear a tie."}]},
        ],
        "rubric": [
            {"name": "Compliance", "description": "No guarantees.", "weight": 5,
             "citations": [{"chunk_id": cc01[0], "quote": first_sentence(cc01[1], "CC-01")}]},
            {"name": "Accuracy", "description": "Correct facts.", "weight": 1,
             "citations": [{"chunk_id": knowledge[0][0], "quote": first_sentence(knowledge[0][2])}]},
            {"name": "Empathy", "description": "Kind.", "weight": 0.1, "citations": []},
        ],
        "branch_events": [{"trigger": "trust >= 60", "event": "Mentions medical costs."},
                          {"trigger": "when he feels rushed", "event": "Leaves."}],
        "max_turns": 99,
    })


def test_scenario_requires_an_approved_persona(run, seeded, llm):
    draft = run(create_persona(Persona(name="Lee Wong", title="Retiree", summary="Careful saver.")))
    with pytest.raises(Conflict):
        run(generate_scenario(draft.id, "Explain the plan"))
    assert llm.calls == []


def test_scenario_rules_come_from_the_code_of_conduct(run, seeded, llm):
    llm.queue(_scenario_draft)
    docs = {d["title"]: d["id"] for d in run(_deps.get_store().list("documents"))}
    insurance_docs = [docs["Retirement Savings Plan brochure"], docs["Code of Conduct"]]

    s = run(generate_scenario("persona-mr-tan", "Explain the plan without guarantees", insurance_docs))

    assert [r.id for r in s.compliance_rules] == ["CC-01"]  # fabricated rule dropped, code recovered
    assert s.compliance_rules[0].citations[0].document_title == "Code of Conduct"
    assert [r.id for r in s.rubric] == ["compliance", "accuracy", "empathy"]
    assert [r.weight for r in s.rubric] == [2.0, 1.0, 0.5]
    assert s.rubric[1].citations and s.rubric[2].citations == []
    assert [(e.id, e.trigger) for e in s.branch_events] == [("evt-1", "trust >= 60")]
    assert s.max_turns == 30 and s.persona_id == "persona-mr-tan" and s.difficulty == 2
    assert s.document_ids == insurance_docs
    prompt = llm.calls[0]["prompt"]
    rule_section = prompt[prompt.index("RULE SOURCES"):prompt.index("\n\nKNOWLEDGE")]
    assert "(Code of Conduct)" in rule_section and "(Retirement Savings Plan brochure)" not in rule_section
    assert len(llm.calls) == 1  # minor drops do not cost a second call
    assert llm.calls[0]["model"] == _deps.scenario_model() and llm.calls[0]["thinking"] == "low"
    assert {c.supports for c in s.compliance_rules[0].citations} == {"rule:CC-01"}
    assert {c.supports for c in s.rubric[1].citations} == {"rubric:accuracy"}


def test_scenario_retries_when_no_rule_is_grounded(run, seeded, llm):
    def ungrounded(prompt, schema):
        d = _scenario_draft(prompt).model_dump()
        d["compliance_rules"] = d["compliance_rules"][1:]  # only the fabricated rule
        return ScenarioDraft.model_validate(d)
    llm.queue(ungrounded, _scenario_draft)
    s = run(generate_scenario("persona-mr-tan", "Explain the plan"))
    assert [r.id for r in s.compliance_rules] == ["CC-01"]
    assert "no compliance rules" in llm.calls[1]["prompt"]


def test_approve_then_generate(run, seeded, llm):
    p = run(create_persona(Persona(name="Lee Wong", title="Retiree", summary="Careful saver.")))
    assert p.status == "draft" and p.id.startswith("per_")
    approved = run(approve_persona(p.id))
    assert approved.status == "approved"
    llm.queue(_scenario_draft)
    s = run(generate_scenario(p.id, "Explain the plan"))
    assert s.compliance_rules and s.id == ""

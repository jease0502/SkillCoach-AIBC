from app.builder import _deps
from app.schemas import Persona, Scenario


def _all_chunks(run):
    rows = run(_deps.get_store().list("chunks"))
    return {r["id"]: r for r in rows}


def test_seed_loads_documents_personas_scenarios(seeded):
    assert seeded == {"documents": 6, "personas": 3, "scenarios": 3}


def test_seed_is_idempotent(run, seeded):
    from app.seed import load

    run(load())
    store = _deps.get_store()
    assert len(run(store.list("documents"))) == 6
    assert len(run(store.list("personas"))) == 3


def test_every_seed_citation_points_at_a_real_chunk(run, seeded):
    chunks = _all_chunks(run)
    store = _deps.get_store()
    citations = []
    for row in run(store.list("personas")):
        citations += Persona.model_validate(row).citations
    for row in run(store.list("scenarios")):
        s = Scenario.model_validate(row)
        for rule in s.compliance_rules:
            assert rule.citations, f"{s.id}/{rule.id} has no citation"
            citations += rule.citations
        for item in s.rubric:
            citations += item.citations
    assert len(citations) > 20
    for c in citations:
        assert c.chunk_id in chunks
        assert c.document_title
        text = " ".join(chunks[c.chunk_id]["text"].split())
        assert " ".join(c.quote.split()) in text


def test_seed_personas_are_approved_with_verbatim_opening_lines(run, seeded):
    store = _deps.get_store()
    personas = {r["id"]: Persona.model_validate(r) for r in run(store.list("personas"))}
    assert all(p.status == "approved" and p.source == "seed" for p in personas.values())
    assert personas["persona-mr-tan"].opening_line == (
        "My son said I should invest my retirement money. Can you promise I won't lose any of it?")
    assert personas["persona-dana-kim"].opening_line.startswith("I have ten minutes.")
    assert personas["persona-alex-morgan"].opening_line.endswith("I want my money back. Now.")


def test_insurance_scenario_catches_guaranteed_principal(run, seeded):
    s = Scenario.model_validate(run(_deps.get_store().get("scenarios", "scenario-insurance-compliance")))
    rules = {r.id: r for r in s.compliance_rules}
    assert {"CC-01", "CC-02", "CC-03"} <= rules.keys()
    cc01 = rules["CC-01"]
    assert cc01.severity == "high"
    assert "guaranteed principal" in cc01.rule
    assert any("guarantees you 8% a year" in c.quote for c in cc01.citations)
    assert all(c.document_title == "Code of Conduct" for c in cc01.citations)
    assert set(s.document_ids) == {d["id"] for d in run(_deps.get_store().list("documents"))
                                   if d["title"] in ("Retirement Savings Plan brochure", "Code of Conduct")}


def test_seed_citations_say_what_they_support(run, seeded):
    store = _deps.get_store()
    tan = Persona.model_validate(run(store.get("personas", "persona-mr-tan")))
    assert {c.supports for c in tan.citations} == {"objection:obj-safety", "hidden_need:0", "hidden_need:1"}
    s = Scenario.model_validate(run(store.get("scenarios", "scenario-insurance-compliance")))
    for rule in s.compliance_rules:
        assert {c.supports for c in rule.citations} == {f"rule:{rule.id}"}
    for item in s.rubric:
        assert all(c.supports == f"rubric:{item.id}" for c in item.citations)

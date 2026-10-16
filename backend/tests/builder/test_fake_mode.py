"""LLM_FAKE=true must give valid, grounded drafts so offline dev and frontend mocks work.

These tests use the real `_deps.generate_json` (no FakeLLM), i.e. the same
path the app takes with LLM_FAKE=true.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.builder import _deps
from app.builder.routes import router
from app.builder.scenario import TRIGGER


@pytest.fixture
def client(seeded):
    assert _deps.llm_fake()
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _chunk_texts(run):
    return {r["id"]: " ".join(r["text"].split()) for r in run(_deps.get_store().list("chunks"))}


def _assert_grounded(citations, chunks):
    for c in citations:
        assert c["chunk_id"] in chunks and c["document_title"]
        assert " ".join(c["quote"].split()).strip("*_`") in chunks[c["chunk_id"]].replace("**", "")


def test_fake_generate_from_docs_returns_valid_cited_personas(client, run):
    r = client.post("/api/personas/generate-from-docs", json={"count": 3})
    assert r.status_code == 200, r.text
    personas = r.json()
    assert len(personas) == 3
    assert len({p["name"] for p in personas}) == 3
    chunks = _chunk_texts(run)
    for p in personas:
        assert p["status"] == "draft" and p["source"] == "documents"
        assert p["objections"] and p["hidden_needs"] and p["opening_line"]
        assert p["citations"] and all(c["supports"] for c in p["citations"])
        _assert_grounded(p["citations"], chunks)


def test_fake_generate_from_brief(client):
    r = client.post("/api/personas/generate", json={"brief": "A cautious retiree asking about safety"})
    assert r.status_code == 200, r.text
    assert r.json()["objections"]


def test_fake_generate_scenario_has_cited_rules_and_valid_triggers(client, run):
    r = client.post("/api/scenarios/generate",
                    json={"persona_id": "persona-mr-tan", "trainee_goal": "Explain the plan without overpromising"})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["compliance_rules"] and len(s["rubric"]) >= 2
    chunks = _chunk_texts(run)
    for rule in s["compliance_rules"]:
        assert rule["citations"] and {c["supports"] for c in rule["citations"]} == {f"rule:{rule['id']}"}
        _assert_grounded(rule["citations"], chunks)
    assert all(TRIGGER.match(e["trigger"]) for e in s["branch_events"])


def test_fake_path_works_for_freshly_generated_and_approved_persona(client):
    created = client.post("/api/personas/generate-from-docs", json={"count": 1}).json()[0]
    saved = client.post("/api/personas", json=created).json()
    client.post(f"/api/personas/{saved['id']}/approve")
    r = client.post("/api/scenarios/generate", json={"persona_id": saved["id"], "trainee_goal": "Close a pilot"})
    assert r.status_code == 200, r.text

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.builder.routes import router


@pytest.fixture
def client(seeded):
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


PERSONA = {"name": "Lee Wong", "title": "Retiree", "summary": "Careful saver.",
           "objections": [{"id": "", "text": "Is it safe?", "trigger": "at the start"},
                          {"id": "", "text": "Fees?", "trigger": "when price is mentioned"}]}


def test_persona_crud_and_approval(client):
    assert len(client.get("/api/personas").json()) == 3

    created = client.post("/api/personas", json={**PERSONA, "status": "approved"}).json()
    assert created["status"] == "draft"  # approval only through /approve
    assert [o["id"] for o in created["objections"]] == ["obj-1", "obj-2"]
    pid = created["id"]

    updated = client.put(f"/api/personas/{pid}", json={**created, "summary": "Very careful saver."}).json()
    assert updated["summary"] == "Very careful saver." and updated["created_at"] == created["created_at"]

    assert client.post(f"/api/personas/{pid}/approve").json()["status"] == "approved"
    assert client.put(f"/api/personas/{pid}", json=created).json()["status"] == "approved"

    assert client.delete(f"/api/personas/{pid}").json() == {"ok": True}
    assert client.get(f"/api/personas/{pid}").status_code == 404


def test_persona_with_pii_is_rejected(client):
    r = client.post("/api/personas", json={**PERSONA, "summary": "Call me on 0912-345-678."})
    assert r.status_code == 422
    assert "summary contains a phone number" in r.json()["detail"]


def test_scenario_crud_requires_approved_persona(client):
    scenario = client.get("/api/scenarios/scenario-insurance-compliance").json()
    draft_persona = client.post("/api/personas", json=PERSONA).json()

    r = client.post("/api/scenarios", json={**scenario, "persona_id": draft_persona["id"]})
    assert r.status_code == 409

    created = client.post("/api/scenarios", json={**scenario, "title": "Copy"}).json()
    assert created["id"].startswith("scn_") and created["title"] == "Copy"

    bad = {**created, "branch_events": [{"id": "e1", "trigger": "whenever", "event": "x"}]}
    assert client.put(f"/api/scenarios/{created['id']}", json=bad).status_code == 422

    assert len(client.get("/api/scenarios").json()) == 4
    assert client.delete(f"/api/scenarios/{created['id']}").json() == {"ok": True}
    assert client.get(f"/api/scenarios/{created['id']}").status_code == 404


def test_generate_errors_map_to_http(client, llm):
    llm.queue(lambda p, s: (_ for _ in ()).throw(RuntimeError("quota exceeded")))
    r = client.post("/api/personas/generate", json={"brief": "Busy CFO"})
    assert r.status_code == 502 and "quota exceeded" in r.json()["detail"]

    r = client.post("/api/scenarios/generate", json={"persona_id": "nope", "trainee_goal": "x"})
    assert r.status_code == 404


def test_editing_away_an_objection_prunes_its_citations(client):
    tan = client.get("/api/personas/persona-mr-tan").json()
    tan["objections"] = [o for o in tan["objections"] if o["id"] != "obj-safety"]
    updated = client.put("/api/personas/persona-mr-tan", json=tan).json()
    assert "objection:obj-safety" not in {c["supports"] for c in updated["citations"]}
    assert {"hidden_need:0", "hidden_need:1"} <= {c["supports"] for c in updated["citations"]}

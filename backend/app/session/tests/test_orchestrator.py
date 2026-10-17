"""Orchestrator tests with a fake LLM, an in-memory store and a canned KB.

Run from backend/: python -m pytest app/session/tests
"""
from __future__ import annotations

import asyncio
import json
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.schemas import (
    BranchEvent, Chunk, ComplianceFlag, ComplianceRule, Objection, Persona, RubricItem, Scenario, SearchHit, Turn,
)
from app.session import agents, deps, orchestrator, routes
from app.store import MemoryStore

TRAINEE_1 = "Hi Dana, I can guarantee you will save 30% on fees. What matters most to you?"
TRAINEE_2 = "Tell me more about how your team handles payroll today."


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.persona_systems: list[str] = []
        self.compliance_quote = "guarantee you will save"
        self.trust_delta, self.patience_delta = 5, -3
        self.report_evidence = [
            {"turn_index": 1, "quote": "What matters most to you?"},       # real
            {"turn_index": 1, "quote": "I deeply understand your pain"},   # invented
        ]
        self.fail_compliance = False
        self.coach_started = asyncio.Event()
        self.stream_started = asyncio.Event()
        self.grounding_claims = 2

    async def generate_json(self, prompt, schema, *, system=None, model=None, temperature=0.4, thinking=None,
                            images=None):
        name = schema.__name__
        self.calls.append({"kind": name, "model": model, "thinking": thinking, "prompt": prompt, "images": images})
        if name == "DeliveryFeedback":
            return schema(eye_contact="good", expression="calm, friendly", posture="upright, centred",
                          fit="fits", tip="Keep looking at the camera while you explain the risk.")
        if name == "_ComplianceDraft":
            if self.fail_compliance:
                raise RuntimeError("gemini down")
            # The judge must not block the customer stream: wait until the stream has started.
            await asyncio.wait_for(self.stream_started.wait(), timeout=2)
            return schema.model_validate({"flags": [
                {"rule_id": "no-guarantee", "message": "Promised a specific outcome.", "quote": self.compliance_quote},
                {"rule_id": "no-guarantee", "message": "Hallucinated.", "quote": "returns are certain"},
                {"rule_id": "unknown-rule", "message": "Unknown rule.", "quote": "Hi"},
            ]})
        if name == "_GroundingDraft":
            return schema.model_validate({"unsupported": [
                {"quote": "that sounds too good to be true.", "message": "Not a product fact; should be ignored"},
                {"quote": "Your plan covers floods.", "message": "Invented sentence, not in the reply"},
            ][:self.grounding_claims]})
        if name == "_StateDraft":
            # Waits for the coach to start: deadlocks (and times out) unless both run concurrently.
            await asyncio.wait_for(self.coach_started.wait(), timeout=2)
            return schema(trust_delta=self.trust_delta, patience_delta=self.patience_delta,
                          trust_reason="Asked a good question.", patience_reason="Normal decay.")
        if name == "_CoachDraft":
            self.coach_started.set()
            return schema(hint="Ask about their current payroll provider.", technique="SPIN: situation question",
                          citation_chunk_ids=["c1", "not-a-real-chunk"])
        dims = {
            "discovery": {"rubric_id": "discovery", "score": 80, "feedback": "Good open question.",
                          "evidence": self.report_evidence},
            "accuracy": {"rubric_id": "accuracy", "score": 90, "feedback": "Accurate.",
                         "evidence": [{"turn_index": 1, "quote": "never said this"}]},
        }
        summary = {"summary": "Solid discovery, risky promise.",
                   "strengths": ["Open questions"], "improvements": ["Avoid guarantees"]}
        if name == "_ReportDraft":  # single-call mode: the model skips "closing"
            return schema.model_validate({**summary, "dimensions": list(dims.values())})
        if name == "_SummaryDraft":
            return schema.model_validate(summary)
        if name == "_DimensionDraft":
            rubric_id = re.search(r"Assess ONLY rubric_id=(\S+)", prompt).group(1)
            return schema.model_validate(dims.get(rubric_id) or {
                "rubric_id": "echoed-wrong-id", "score": 0, "feedback": "Nothing to go on."})
        raise AssertionError(f"unexpected schema {name}")

    async def generate_text(self, prompt, *, system=None, model=None, thinking=None):
        self.calls.append({"kind": "text", "model": model, "thinking": thinking})
        return "Hello, I'm busy, what is this about?"

    async def stream_text(self, prompt, *, system=None, model=None, thinking=None):
        self.calls.append({"kind": "stream", "model": model, "thinking": thinking})
        self.persona_systems.append(system)
        self.stream_started.set()
        for chunk in ["Well, ", "that sounds ", "too good to be true."]:
            yield chunk


async def fake_kb(query, k=5, document_ids=None):
    return [SearchHit(chunk=Chunk(id="c1", document_id="d1", index=0,
                                  text="Payroll Plus reduces fees by up to 20% for teams under 50."),
                      document_title="Payroll Plus pricing", score=0.9)]


@pytest.fixture
def llm(monkeypatch) -> FakeLLM:
    fake = FakeLLM()
    store = MemoryStore()
    monkeypatch.setattr(deps, "generate_json", fake.generate_json)
    monkeypatch.setattr(deps, "generate_text", fake.generate_text)
    monkeypatch.setattr(deps, "stream_text", fake.stream_text)
    monkeypatch.setattr(deps, "kb_search", fake_kb)
    monkeypatch.setattr(deps, "get_store", lambda: store)
    monkeypatch.setattr(deps, "fast_model", lambda: "fast-model")
    monkeypatch.setattr(deps, "pro_model", lambda: "pro-model")
    monkeypatch.setattr(deps, "report_model", lambda: "pro-model")
    monkeypatch.setattr(deps, "lite_model", lambda: "lite-model")
    monkeypatch.setattr(deps, "llm_fake", lambda: False)
    monkeypatch.setattr(deps, "REPORT_PARALLEL", True)
    monkeypatch.setattr(deps, "SPECULATIVE_REPORTS", False)
    orchestrator._locks.clear()
    orchestrator._verdicts.clear()
    orchestrator._drafts.clear()
    return fake


def run(coro):
    return asyncio.run(coro)


async def seed(*, trust=40, patience=70, max_turns=12, persona_line="", scenario_line=None,
               branch_events=None) -> Scenario:
    persona = Persona(id="p1", name="Dana", title="Owner of a 12-person bakery", summary="Busy owner.",
                      personality=["skeptical", "direct"], hidden_needs=["Worried about cash flow in winter"],
                      initial_trust=trust, initial_patience=patience, opening_line=persona_line, status="approved")
    scenario = Scenario(id="s1", title="Payroll upsell", description="Pitch Payroll Plus.", persona_id="p1",
                        trainee_goal="Book a demo", max_turns=max_turns, opening_line=scenario_line,
                        compliance_rules=[ComplianceRule(id="no-guarantee", rule="Never guarantee savings or returns",
                                                         severity="high")],
                        rubric=[RubricItem(id="discovery", name="Discovery", description="Asks questions"),
                                RubricItem(id="accuracy", name="Accuracy", description="Correct facts"),
                                RubricItem(id="closing", name="Closing", description="Next steps")],
                        branch_events=branch_events or [])
    store = deps.get_store()
    await store.put("personas", "p1", persona.model_dump(mode="json"))
    await store.put("scenarios", "s1", scenario.model_dump(mode="json"))
    return scenario


async def turn(session_id: str, text: str, *, expect_error: bool = False) -> list[tuple[str, dict]]:
    events = [e async for e in orchestrator.run_turn(session_id, text)]
    errors = [d for n, d in events if n == "error"]
    if not expect_error:  # surfaces e.g. a signature mismatch between orchestrator and agents
        assert not errors, f"turn failed: {errors}"
    return events


# ---------- Turn pipeline ----------

def test_full_turn_runs_every_real_agent_end_to_end(llm):
    """Only the LLM/KB/store seam is faked: orchestrator -> agents -> prompts -> deps run for real,
    so any signature drift between them fails here (deploy 00003 regression)."""
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        events = await turn(s.id, TRAINEE_1)
        report = await orchestrator.end_session(s.id)
        return events, report
    events, report = run(go())
    assert {n for n, _ in events} == {"compliance_pre", "customer_delta", "customer_done",
                                      "compliance_post", "state", "coach", "done"}
    assert {c["kind"] for c in llm.calls} == {"text", "stream", "_ComplianceDraft", "_GroundingDraft",
                                              "_StateDraft", "_CoachDraft", "_DimensionDraft", "_SummaryDraft"}
    assert report.dimensions and report.summary

def test_turn_emits_events_in_contract_order(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        events = await turn(s.id, TRAINEE_1)
        return s, events, (await orchestrator.load_record(s.id)).session
    s, events, saved = run(go())

    names = [n for n, _ in events]
    assert names[:5] == ["compliance_pre", "customer_delta", "customer_delta", "customer_delta", "customer_done"]
    assert sorted(names[5:8]) == ["coach", "compliance_post", "state"]  # completion order
    assert names[8:] == ["done"]
    data = dict(events)
    assert data["customer_done"]["turn"]["text"] == "Well, that sounds too good to be true."
    assert data["done"]["session_status"] == "active"
    # High-severity violation forces a trust loss even though the model said +5.
    assert data["state"]["trust"] == 40 - 8 and data["state"]["patience"] == 67
    # Coach citations keep only chunk ids that were actually retrieved.
    assert [c["chunk_id"] for c in data["coach"]["hint"]["citations"]] == ["c1"]

    assert [t.role for t in saved.turns] == ["customer", "trainee", "customer"]
    assert saved.turns[2].coach is not None and saved.turns[2].trust == 32


def test_compliance_prescan_first_then_judge_verdict_with_reply(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        events = dict(await turn(s.id, TRAINEE_1))
        return events, (await orchestrator.load_record(s.id)).session
    events, saved = run(go())
    # compliance_pre is the instant keyword pre-scan...
    assert [f["quote"] for f in events["compliance_pre"]["flags"]] == ["guarantee"]
    # ...and the LLM judge (which ran while the reply streamed; FakeLLM would otherwise time out
    # and fall back to the keyword quote) is authoritative: exact quotes and known rules only.
    final = events["customer_done"]["trainee_compliance"]
    assert len(final) == 1
    assert final[0]["quote"] == "guarantee you will save" and final[0]["quote"] in TRAINEE_1
    assert final[0]["severity"] == "high"  # severity comes from the rule, not the model
    assert [f.quote for f in saved.turns[1].compliance] == ["guarantee you will save"]


def test_models_and_thinking_levels_per_agent(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_1)
        await orchestrator.end_session(s.id)
    run(go())
    used = {c["kind"]: (c["model"], c["thinking"]) for c in llm.calls}
    assert used["_ComplianceDraft"] == ("lite-model", "low")
    assert used["stream"] == ("fast-model", "low")
    assert used["_StateDraft"] == ("lite-model", "low")
    assert used["_CoachDraft"] == ("lite-model", "low")
    assert used["_GroundingDraft"] == ("lite-model", "low")
    assert used["_DimensionDraft"] == ("pro-model", None)  # default thinking
    assert used["_SummaryDraft"] == ("pro-model", None)


def test_done_reports_turn_timing(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        return dict(await turn(s.id, TRAINEE_2))["done"]["timing_ms"]
    timing = run(go())
    assert {"kb", "first_delta", "reply", "compliance", "compliance_post", "state", "coach", "total"} <= timing.keys()
    assert timing["first_delta"] <= timing["total"]


def test_compliance_falls_back_to_keyword_pass(llm):
    llm.fail_compliance = True
    rules = [ComplianceRule(id="no-guarantee", rule="Never guarantee savings or returns", severity="high")]
    flags = run(agents.compliance_check(TRAINEE_1, rules))
    assert [(f.rule_id, f.quote) for f in flags] == [("no-guarantee", "guarantee")]


def test_hidden_needs_only_revealed_above_trust_threshold(llm):
    async def go(trust):
        await seed(trust=trust)
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_2)
    run(go(60))
    run(go(85))
    low, high = llm.persona_systems
    assert "cash flow" not in low
    assert "cash flow" in high


def test_state_and_coach_run_concurrently(llm):
    # FakeLLM's state call blocks until the coach call starts; sequential execution would time out.
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        return dict(await turn(s.id, TRAINEE_2))
    # A timeout would surface as the fallback "default decay" reason instead of the model's.
    assert run(go())["state"]["reason"] == "Asked a good question. Normal decay."


def test_session_ends_at_max_turns(llm):
    async def go():
        await seed(max_turns=2)
        s = await orchestrator.create_session("s1")
        first = dict(await turn(s.id, TRAINEE_2))["done"]["session_status"]
        second = dict(await turn(s.id, TRAINEE_2))["done"]["session_status"]
        with pytest.raises(orchestrator.SessionError) as exc:
            await orchestrator.validate_turn(s.id, "one more")
        return first, second, exc.value.status
    assert run(go()) == ("active", "ended", 409)


def test_session_ends_when_patience_runs_out(llm):
    llm.patience_delta = -20
    async def go():
        await seed(patience=10)
        s = await orchestrator.create_session("s1")
        return dict(await turn(s.id, TRAINEE_2))
    data = run(go())
    assert data["state"]["patience"] == 0
    assert data["done"]["session_status"] == "ended"


def test_failed_turn_emits_error_and_is_not_saved(llm, monkeypatch):
    async def broken(*a, **k):
        raise RuntimeError("boom")
        yield ""
    monkeypatch.setattr(deps, "stream_text", broken)

    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        events = await turn(s.id, TRAINEE_2, expect_error=True)
        return events, (await orchestrator.load_record(s.id)).session
    events, saved = run(go())
    assert events[-1][0] == "error"
    assert len(saved.turns) == 1


def test_branch_event_fires_once_when_trigger_holds(llm):
    events = [BranchEvent(id="b1", trigger="turn >= 2", event="mentions a cheaper competitor")]
    async def go():
        await seed(branch_events=events)
        s = await orchestrator.create_session("s1")
        for _ in range(3):
            await turn(s.id, TRAINEE_2)
    run(go())
    hits = ["cheaper competitor" in p for p in llm.persona_systems]
    assert hits == [False, True, False]


def test_trigger_grammar():
    v = {"turn": 4, "trust": 25, "patience": 50}
    assert orchestrator.trigger_holds("turn >= 4 and trust < 30", v) is True
    assert orchestrator.trigger_holds("patience > 60", v) is False
    assert orchestrator.trigger_holds("when price is mentioned", v) is None


def hit(cid: str, score: float) -> SearchHit:
    return SearchHit(chunk=Chunk(id=cid, document_id="d", index=0, text=cid), document_title="Doc", score=score)


def test_kb_hits_filtered_by_absolute_and_relative_threshold():
    # Measured with gemini-embedding-001 for "refund window?": Refunds 0.707, Shipping 0.624.
    kept = orchestrator.relevant_hits([hit("refunds", 0.707), hit("shipping", 0.624), hit("faq", 0.66)])
    assert [h.chunk.id for h in kept] == ["refunds", "faq"]
    assert orchestrator.relevant_hits([hit("weak", 0.58)]) == []
    # Fake hash embeddings: relative cut only, so demos still show citations.
    fake = orchestrator.relevant_hits([hit("a", 0.35), hit("b", 0.31), hit("c", 0.2)], absolute=False)
    assert [h.chunk.id for h in fake] == ["a", "b"]


def test_compliance_post_drops_invented_quotes_and_opinions(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        events = dict(await turn(s.id, TRAINEE_2))
        return events, (await orchestrator.load_record(s.id)).session
    events, saved = run(go())
    # The model flagged an opinion ("that sounds too good to be true.") and a sentence the customer
    # never said: neither is an unsupported product claim.
    assert events["compliance_post"]["flags"] == []
    assert saved.turns[2].compliance == []


# ---------- Compliance Guard ----------

def test_precheck_judges_without_storing_and_turn_reuses_verdict(llm):
    llm.stream_started.set()  # no stream runs during a precheck
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        flags = await orchestrator.precheck_compliance(s.id, TRAINEE_1)
        after = (await orchestrator.load_record(s.id)).session
        judged = sum(c["kind"] == "_ComplianceDraft" for c in llm.calls)
        events = dict(await turn(s.id, TRAINEE_1))
        rejudged = sum(c["kind"] == "_ComplianceDraft" for c in llm.calls) - judged
        return flags, after, events, rejudged
    flags, after, events, rejudged = run(go())
    assert [(f.rule_id, f.quote) for f in flags] == [("no-guarantee", "guarantee you will save")]
    assert len(after.turns) == 1  # precheck stores nothing
    assert rejudged == 0  # the sent message reuses the verdict...
    assert [f["quote"] for f in events["compliance_pre"]["flags"]] == ["guarantee you will save"]
    assert [f["quote"] for f in events["customer_done"]["trainee_compliance"]] == ["guarantee you will save"]


def test_precheck_times_out_to_keyword_flags(llm, monkeypatch):
    monkeypatch.setattr(orchestrator, "PRECHECK_TIMEOUT_S", 0.05)  # judge waits for a stream that never starts
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        return await orchestrator.precheck_compliance(s.id, TRAINEE_1)
    assert [f.quote for f in run(go())] == ["guarantee"]


# ---------- Live mode: delivery feedback ----------

PNG_1PX = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA"
           "60e6kgAAAABJRU5ErkJggg==")


def test_delivery_sends_the_frame_to_the_lite_model_and_stores_nothing(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        fb = await orchestrator.delivery_feedback(s.id, f"data:image/png;base64,{PNG_1PX}", "Hello Dana")
        after = (await orchestrator.load_record(s.id)).session
        return fb, after
    fb, after = run(go())
    call = next(c for c in llm.calls if c["kind"] == "DeliveryFeedback")
    assert fb.eye_contact == "good" and fb.tip
    assert call["model"] == deps.lite_model()
    assert call["images"][0][1] == "image/png" and call["images"][0][0].startswith(b"\x89PNG")
    assert "Hello Dana" in call["prompt"]
    assert len(after.turns) == 1  # nothing stored


@pytest.mark.parametrize("image, status", [
    ("not base64!!", 422),
    ("data:image/gif;base64,R0lGODlh", 415),
    ("", 422),
])
def test_delivery_rejects_bad_frames(llm, image, status):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        await orchestrator.delivery_feedback(s.id, image)
    with pytest.raises(orchestrator.SessionError) as e:
        run(go())
    assert e.value.status == status


# ---------- Opening line ----------

def test_opening_line_is_verbatim_without_model_call(llm):
    async def go():
        await seed(persona_line="Persona line.", scenario_line="Scenario line wins.")
        return await orchestrator.create_session("s1")
    s = run(go())
    assert s.turns[0].text == "Scenario line wins."
    assert llm.calls == []


def test_opening_line_generated_when_none_configured(llm):
    async def go():
        await seed()
        return await orchestrator.create_session("s1")
    s = run(go())
    assert s.turns[0].text == "Hello, I'm busy, what is this about?"
    assert llm.calls == [{"kind": "text", "model": "fast-model", "thinking": "low"}]


# ---------- Report ----------

@pytest.mark.parametrize("parallel", [True, False])
def test_report_verifies_evidence_and_applies_gates(llm, monkeypatch, parallel):
    monkeypatch.setattr(deps, "REPORT_PARALLEL", parallel)
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_1)
        report = await orchestrator.end_session(s.id)
        again = await orchestrator.end_session(s.id)
        return report, again, (await orchestrator.load_record(s.id)).session
    report, again, saved = run(go())

    kinds = sorted(c["kind"] for c in llm.calls if c["model"] == "pro-model")
    assert kinds == (["_DimensionDraft"] * 3 + ["_SummaryDraft"] if parallel else ["_ReportDraft"])
    dims = {d.rubric_id: d for d in report.dimensions}
    assert list(dims) == ["discovery", "accuracy", "closing"]  # rubric order, ids from the rubric
    real, invented = dims["discovery"].evidence
    assert real.verified and real.quote in TRAINEE_1 and real.turn_index == 1
    assert not invented.verified
    assert dims["discovery"].score == 80
    # No verified quote: capped at 50 and the feedback says so.
    assert dims["accuracy"].score == 50 and "no evidence" in dims["accuracy"].feedback.lower()
    # Rubric item the model skipped.
    assert dims["closing"].score == 0
    # High-severity violation: compliance gate fails, overall capped at 59.
    assert report.compliance_passed is False
    assert report.overall_score == min(round((80 + 50 + 0) / 3), 59)
    assert report.knowledge_citations and report.knowledge_citations[0].chunk_id == "c1"
    assert saved.status == "ended"
    assert again == report  # idempotent


def test_speculative_draft_makes_end_reuse_the_latest_draft(llm, monkeypatch):
    monkeypatch.setattr(deps, "SPECULATIVE_REPORTS", True)
    def report_calls():
        return sum(c["kind"] in ("_DimensionDraft", "_SummaryDraft") for c in llm.calls)
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_2)
        first_draft = orchestrator._drafts[s.id][1]
        await turn(s.id, TRAINEE_1)               # supersedes the first draft
        await asyncio.sleep(0)
        covered, task = orchestrator._drafts[s.id]
        await task                                 # the trainee is "typing"; the draft finishes
        before = report_calls()
        report = await orchestrator.end_session(s.id)
        return first_draft, covered, before, report_calls(), report, s.id
    first_draft, covered, before, after, report, sid = run(go())
    assert first_draft.cancelled() or first_draft.done()
    assert covered == 5                            # opening + 2 trainee + 2 customer turns
    assert after == before                         # End reused the draft: no new report calls
    assert report.compliance_passed is False       # the draft covers the violating last turn
    assert sid not in orchestrator._drafts


def test_stale_draft_is_ignored(llm, monkeypatch):
    monkeypatch.setattr(deps, "SPECULATIVE_REPORTS", True)
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_2)
        stale = orchestrator._drafts[s.id][1]
        orchestrator._drafts[s.id] = (99, stale)   # pretend it covers a different transcript
        report = await orchestrator.end_session(s.id)
        return stale, report
    stale, report = run(go())
    assert stale.cancelled()
    assert report.dimensions  # generated inline instead


# ---------- HTTP ----------

def parse_sse(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_http_session_flow_and_dashboard(llm):
    app = FastAPI()
    app.include_router(routes.router)
    client = TestClient(app)
    run(seed(persona_line="Hi, make it quick."))

    s = client.post("/api/sessions", json={"scenario_id": "s1"}).json()
    assert s["turns"][0]["text"] == "Hi, make it quick."
    assert client.post("/api/sessions", json={"scenario_id": "nope"}).status_code == 404

    r = client.post(f"/api/sessions/{s['id']}/turns", json={"text": TRAINEE_1})
    assert r.headers["content-type"].startswith("text/event-stream")
    assert [n for n, _ in parse_sse(r.text)][-1] == "done"
    assert client.post(f"/api/sessions/{s['id']}/turns", json={"text": "  "}).status_code == 422
    pc = client.post(f"/api/sessions/{s['id']}/precheck", json={"text": "Can I guarantee it? No."})
    assert pc.status_code == 200 and "flags" in pc.json()
    dv = client.post(f"/api/sessions/{s['id']}/delivery", json={"image": PNG_1PX, "text": "Hi"})
    assert dv.status_code == 200 and dv.json()["eye_contact"] == "good"

    assert client.get(f"/api/sessions/{s['id']}/report").status_code == 404
    report = client.post(f"/api/sessions/{s['id']}/end").json()
    assert client.get(f"/api/sessions/{s['id']}/report").json() == report
    assert client.post(f"/api/sessions/{s['id']}/turns", json={"text": "hi"}).status_code == 409

    d = client.get("/api/dashboard").json()
    assert d["sessions_count"] == 1 and d["average_score"] == report["overall_score"]
    assert d["top_violations"][0]["rule_id"] == "no-guarantee"
    assert d["recent_sessions"][0]["compliance_passed"] is False
    assert d["ready_count"] == 0  # failed compliance is never "ready"
    assert "turns" not in json.dumps(d)  # aggregates only, no transcripts


def test_dashboard_ready_count(llm):
    from app.schemas import Report, Session
    async def go():
        store = deps.get_store()
        rows = [("a", "ended", 85, True), ("b", "ended", 85, False), ("c", "ended", 79, True), ("d", "active", 90, True)]
        for sid, status, score, passed in rows:
            await store.put("sessions", sid, Session(id=sid, scenario_id="s1", persona_id="p1",
                                                     status=status).model_dump(mode="json"))
            await store.put("reports", sid, Report(session_id=sid, overall_score=score, compliance_passed=passed,
                                                   summary="-").model_dump(mode="json"))
        return await routes.dashboard()
    assert run(go()).ready_count == 1


# ---------- Keyword pre-scan ----------

CC01 = ComplianceRule(id="CC-01", severity="high", rule="Never promise or imply guaranteed returns or a "
                      "guaranteed principal on investment-linked products.")


@pytest.mark.parametrize("text", [
    "Past performance doesn't guarantee future results.",
    "Returns are not guaranteed.",
    "Returns aren\u2019t guaranteed, and the value can go down.",
    "I can't promise any particular return.",
    "There is no guarantee on the principal.",
    "Nobody can guarantee what the market does.",
])
def test_keyword_scan_ignores_negations_and_disclosures(text):
    assert agents.keyword_flags(text, [CC01]) == []


@pytest.mark.parametrize("text, quote", [
    ("This plan guarantees you 8% a year.", "guarantees"),
    ("Don't worry, I guarantee you'll make 8%.", "guarantee"),
    ("Past performance doesn't guarantee future results, but this one is guaranteed.", "guaranteed"),
    ("Honestly it's risk-free.", "risk-free"),
])
def test_keyword_scan_still_catches_promises(text, quote):
    assert [f.quote for f in agents.keyword_flags(text, [CC01])] == [quote]


def test_keyword_scan_does_not_map_free_look_rule_to_fee_patterns():
    cc05 = ComplianceRule(id="CC-05", rule="Tell the customer about the 15-day free-look period.")
    assert agents.keyword_flags("There are no fees at all.", [cc05]) == []


def test_keyword_hits_survive_an_empty_llm_verdict(monkeypatch):
    async def nothing(prompt, schema, **kw):
        return schema()  # e.g. LLM_FAKE placeholder, or a judge that misses it
    monkeypatch.setattr(deps, "generate_json", nothing)
    monkeypatch.setattr(deps, "lite_model", lambda: "lite-model")
    flags = run(agents.compliance_check("This plan guarantees you 8% a year.", [CC01]))
    assert [(f.rule_id, f.severity, f.quote) for f in flags] == [("CC-01", "high", "guarantees")]


# ---------- Grounding: customer assertions only ----------

def _grounding_fake(monkeypatch, quotes: list[str]) -> list[str]:
    prompts_seen: list[str] = []
    async def judge(prompt, schema, **kw):
        prompts_seen.append(prompt)
        return schema.model_validate({"unsupported": [{"quote": q, "message": "Unsupported."} for q in quotes]})
    monkeypatch.setattr(deps, "generate_json", judge)
    monkeypatch.setattr(deps, "lite_model", lambda: "lite-model")
    return prompts_seen


def _grounding_case():
    persona = Persona(id="p1", name="Mr. Tan", title="Retiree", summary="58, cautious saver.")
    scenario = Scenario(id="s1", title="t", description="Retirement plan", persona_id="p1", trainee_goal="g")
    turns = [Turn(index=0, role="customer", text="What have you got?"),
             Turn(index=1, role="trainee", text="Honestly it guarantees you about 6% a year.")]
    return persona, scenario, turns


@pytest.mark.parametrize("reply, quote", [
    ("Earlier you said it was guaranteed. I'm not so sure.", "it was guaranteed"),
    ("Earlier you said it was guaranteed. I'm not so sure.", "Earlier you said it was guaranteed."),
    ("Wait, you told me it pays 6% a year.", "it pays 6% a year"),
    ("So it really guarantees 6% a year?", "it really guarantees 6% a year?"),
])
def test_grounding_ignores_restating_or_questioning_the_trainee(monkeypatch, reply, quote):
    _grounding_fake(monkeypatch, [quote])
    persona, scenario, turns = _grounding_case()
    assert run(agents.grounding_check(reply, [], turns, persona, scenario)) == []


def test_grounding_flags_a_made_up_product_fact(monkeypatch):
    seen = _grounding_fake(monkeypatch, ["This plan has a 10-year lock-in."])
    persona, scenario, turns = _grounding_case()
    reply = "Earlier you said it was guaranteed. This plan has a 10-year lock-in. That worries me."
    flags = run(agents.grounding_check(reply, [], turns, persona, scenario))
    assert [(f.rule_id, f.severity, f.quote) for f in flags] == [("GROUNDING", "medium", "This plan has a 10-year lock-in.")]
    # The checker sees what the trainee said, so it can tell a restatement from an assertion.
    assert "guarantees you about 6% a year" in seen[0] and "58, cautious saver." in seen[0]


def test_llm_compliance_flag_on_a_risk_disclosure_is_dropped(monkeypatch):
    text = "Returns are not guaranteed and the value can go down."
    async def overeager(prompt, schema, **kw):
        assert "returns are not guaranteed" in kw["system"]  # explicit instruction to the model
        return schema.model_validate({"flags": [
            {"rule_id": "CC-01", "message": "Mentions guarantees.", "quote": "Returns are not guaranteed"},
            {"rule_id": "CC-01", "message": "Mentions guarantees.", "quote": text}]})
    monkeypatch.setattr(deps, "generate_json", overeager)
    monkeypatch.setattr(deps, "lite_model", lambda: "lite-model")
    assert run(agents.compliance_check(text, [CC01])) == []


# ---------- Live-demo fixes ----------

def _saas_case():
    persona = Persona(id="p1", name="Dana Kim", title="CFO", summary="CFO of a 200-person logistics company.",
                      objections=[Objection(id="o1", text="Your quote is 30% higher than the tool we tried last year.",
                                            trigger="when price comes up")])
    scenario = Scenario(id="s1", title="SaaS pricing objection: the 30% gap", description="Pricing call.",
                        persona_id="p1", trainee_goal="Defend the price",
                        context="She has your Pro plan quote (USD 49 per user per month).",
                        branch_events=[BranchEvent(id="b1", trigger="turn >= 6",
                                                   event="Mentions that a cheaper competitor offered a 20% discount last week.")])
    turns = [Turn(index=0, role="customer", text="Walk me through the quote.")]
    return persona, scenario, turns


@pytest.mark.parametrize("reply", [
    "Put it straight back on my card right now, then.",
    "A 30% premium needs a real business case, not a tagline.",
    "Fine, set up the callback with your supervisor today.",
    "Brightline offered us a 20% discount last week.",
])
def test_grounding_never_flags_demands_opinions_or_scripted_events(monkeypatch, reply):
    _grounding_fake(monkeypatch, [reply])  # an over-eager model flags the whole line
    persona, scenario, turns = _saas_case()
    assert run(agents.grounding_check(reply, [], turns, persona, scenario)) == []


@pytest.mark.parametrize("reply", [
    "Your Pro plan includes unlimited dashboards.",   # product claim, no number
    "The annual contract locks you in for 3 years.",  # ungrounded number
])
def test_grounding_still_flags_unsupported_product_claims(monkeypatch, reply):
    seen = _grounding_fake(monkeypatch, [reply])
    persona, scenario, turns = _saas_case()
    assert [f.quote for f in run(agents.grounding_check(reply, [], turns, persona, scenario))] == [reply]
    assert "cheaper competitor offered a 20% discount" in seen[0] and "30% higher" in seen[0]


def test_compliance_judge_sees_scenario_context_and_recent_turns(monkeypatch):
    seen = []
    async def judge(prompt, schema, **kw):
        seen.append(prompt)
        return schema()
    monkeypatch.setattr(deps, "generate_json", judge)
    monkeypatch.setattr(deps, "lite_model", lambda: "lite-model")
    rule = ComplianceRule(id="RR-01", rule="Over 30 days after purchase: no full refund, offer store credit.")
    recent = [Turn(index=1, role="trainee", text="When did you buy them?"),
              Turn(index=2, role="customer", text="About six weeks ago.")]
    run(agents.compliance_check("Sure, I'll give you a full refund.", [rule], context="Bought 41 days ago.",
                                recent=recent))
    assert "Bought 41 days ago." in seen[0] and "About six weeks ago." in seen[0]


def test_turn_passes_context_and_last_two_turns_to_the_judge(llm):
    async def go():
        await seed()
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_2)
        await turn(s.id, TRAINEE_1)
    run(go())
    judge_prompts = [c["prompt"] for c in llm.calls if c["kind"] == "_ComplianceDraft"]
    # Second turn: the judge sees the previous trainee message and the customer's reply to it.
    assert TRAINEE_2 in judge_prompts[1] and "too good to be true" in judge_prompts[1]


def _hit(cid: str, text: str) -> SearchHit:
    return SearchHit(chunk=Chunk(id=cid, document_id="d", index=0, text=text), document_title="Policy", score=0.7)


def test_reply_citations_only_for_facts_actually_used():
    hits = [_hit("refunds", "Returns are accepted within 30 days. Refunds go back to the original card within "
                            "5 business days. Opened items need a receipt."),
            _hit("shipping", "Standard shipping takes 3 to 7 days. Express shipping costs USD 12.")]
    assert agents.reply_citations("Are you kidding me?", hits) == []
    cites = agents.reply_citations("So the refund goes back to my card within 5 business days?", hits)
    assert [(c.chunk_id, c.quote) for c in cites] == [
        ("refunds", "Refunds go back to the original card within 5 business days.")]


def test_coach_citation_quotes_the_sentence_matching_the_hint():
    hit = _hit("c9", "Our plans start at USD 49 per user. Annual billing saves 15% versus monthly billing.")
    assert agents.citation_for(hit, "Mention that annual billing saves 15%.").quote == \
        "Annual billing saves 15% versus monthly billing."
    assert agents.citation_for(hit).quote == "Our plans start at USD 49 per user."


@pytest.mark.parametrize("initial, trust, revealed", [
    (25, 41, True), (25, 40, False),   # guarded persona: 25 + 15 = 40
    (60, 71, True), (60, 70, False),   # capped at 70
])
def test_hidden_needs_threshold_depends_on_initial_trust(llm, initial, trust, revealed):
    persona = Persona(id="p", name="A", title="t", summary="s", initial_trust=initial,
                      hidden_needs=["Worried about cash flow in winter"])
    scenario = Scenario(id="s", title="t", description="d", persona_id="p", trainee_goal="g")
    turns = [Turn(index=0, role="trainee", text="Hi")]
    async def go():
        async for _ in agents.persona_reply(persona, scenario, turns, [], trust=trust, patience=50, events=[]):
            pass
    run(go())
    assert ("cash flow" in llm.persona_systems[-1]) is revealed


def test_corrected_mistake_is_not_penalised_twice(llm):
    llm.trust_delta = -4  # the model still docks trust after an honest correction
    llm.coach_started.set()
    flag = ComplianceFlag(rule_id="CC-01", severity="high", message="Guarantee.", quote="guarantee")
    persona = Persona(id="p", name="A", title="t", summary="s")
    def turns(latest: str):
        return [Turn(index=1, role="trainee", text="I guarantee 6%.", compliance=[flag]),
                Turn(index=2, role="customer", text="Guaranteed?"),
                Turn(index=3, role="trainee", text=latest)]
    corrected = run(agents.state_update(persona, turns("Sorry, I misspoke: returns are not guaranteed."), [],
                                        trust=40, patience=50))
    unrelated = run(agents.state_update(persona, turns("Anyway, shall we sign today?"), [], trust=40, patience=50))
    assert corrected.trust_delta == 0 and corrected.trust == 40
    assert unrelated.trust_delta == -4


def test_persona_never_invents_names_for_other_people(llm, monkeypatch):
    systems = []
    async def opening(prompt, *, system=None, model=None, thinking=None):
        systems.append(system)
        return "Hello."
    monkeypatch.setattr(deps, "generate_text", opening)
    async def go():
        await seed()                                   # no opening line: generated
        s = await orchestrator.create_session("s1")
        await turn(s.id, TRAINEE_2)                    # streamed reply
    run(go())
    for system in (systems[0], llm.persona_systems[-1]):
        assert "Do not invent names for other people" in system and "'my ops director'" in system


def test_dashboard_counts_sample_sessions_in_aggregates(llm):
    from app.schemas import Report, Session
    async def go():
        store = deps.get_store()
        for sid, sample, score in [("sample-a1", True, 90), ("sample-a2", None, 70), ("real1", None, 50)]:
            row = Session(id=sid, scenario_id="s1", persona_id="p1", status="ended").model_dump(mode="json")
            if sample:
                row["sample"] = True
            await store.put("sessions", sid, row)
            await store.put("reports", sid, Report(session_id=sid, overall_score=score,
                                                   summary="-").model_dump(mode="json"))
    run(go())
    app = FastAPI()
    app.include_router(routes.router)
    d = TestClient(app).get("/api/dashboard").json()
    assert d["sessions_count"] == 3 and d["sample_sessions_count"] == 2  # flag or "sample-" prefix
    assert d["average_score"] == 70.0                                    # samples are aggregated
    assert {s["id"] for s in d["recent_sessions"]} == {"sample-a1", "sample-a2", "real1"}


def test_deps_use_tier_aliases_for_fallback_chains(monkeypatch):
    monkeypatch.delenv("SESSION_REPORT_MODEL", raising=False)
    assert deps.fast_model() == "fast"
    assert deps.report_model() == "pro"
    monkeypatch.setenv("SESSION_REPORT_MODEL", "gemini-3.1-pro-preview")
    assert deps.report_model() == "gemini-3.1-pro-preview"  # explicit override still wins

from datetime import datetime, timedelta, timezone

import pytest

from app.builder import _deps
from app.schemas import Report, Scenario, Session, Turn
from app.seed import sample_team

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def team(run, seeded):
    return run(sample_team.load(now=NOW))


def _rows(run, collection):
    return run(_deps.get_store().list(collection))


def test_writes_about_two_dozen_ended_sample_sessions_over_14_days(run, team):
    assert team["sessions"] == 24 and team["ready"] >= 5 and team["failed"] >= 3
    sessions = _rows(run, "sessions")
    assert len(sessions) == 24
    assert all(r["id"].startswith("sample-") and r["sample"] is True for r in sessions)
    parsed = [Session.model_validate(r) for r in sessions]
    assert all(s.status == "ended" and s.ended_at > s.started_at for s in parsed)
    assert {s.scenario_id for s in parsed} == {"scenario-saas-pricing", "scenario-insurance-compliance",
                                              "scenario-support-escalation"}
    assert all(NOW - timedelta(days=14) <= s.started_at <= NOW for s in parsed)
    assert len({s.started_at.date() for s in parsed}) >= 12


def test_every_evidence_quote_is_in_that_sessions_trainee_turns(run, team):
    from app.session.agents import exact_span

    sessions = {r["id"]: Session.model_validate(r) for r in _rows(run, "sessions")}
    for row in _rows(run, "reports"):
        report = Report.model_validate(row)
        turns = {t.index: t for t in sessions[report.session_id].turns}
        for d in report.dimensions:
            assert d.evidence
            for e in d.evidence:
                assert e.verified and turns[e.turn_index].role == "trainee"
                assert exact_span(turns[e.turn_index].text, e.quote) == e.quote
        for f in report.compliance_violations:
            assert any(f.quote in t.text for t in turns.values() if t.role == "trainee")


def test_scores_follow_the_report_rules(run, team):
    scenarios = {r["id"]: Scenario.model_validate(r) for r in _rows(run, "scenarios")}
    sessions = {r["id"]: Session.model_validate(r) for r in _rows(run, "sessions")}
    for row in _rows(run, "reports"):
        r = Report.model_validate(row)
        sc = scenarios[sessions[r.session_id].scenario_id]
        assert [d.rubric_id for d in r.dimensions] == [i.id for i in sc.rubric]
        w = {i.id: i.weight for i in sc.rubric}
        expected = round(sum(d.score * w[d.rubric_id] for d in r.dimensions) / sum(w.values()))
        high = any(f.severity == "high" for f in r.compliance_violations)
        assert r.compliance_passed is not high
        assert r.overall_score == (min(expected, 59) if high else expected)


def test_mix_of_ready_failed_and_flagged_sessions(run, team):
    reports = [Report.model_validate(r) for r in _rows(run, "reports")]
    rules = {f.rule_id for r in reports for f in r.compliance_violations}
    assert {"CC-01", "RR-01", "TONE-01"} <= rules
    assert any(r.compliance_passed and r.overall_score >= 80 for r in reports)
    # medium/low flags are recorded but do not fail the gate
    assert all(r.compliance_passed for r in reports
               if {f.rule_id for f in r.compliance_violations} <= {"RR-01", "TONE-01", "PR-01"})


def test_scores_trend_upward(run, team):
    sessions = {r["id"]: Session.model_validate(r) for r in _rows(run, "sessions")}
    reports = sorted((Report.model_validate(r) for r in _rows(run, "reports")),
                     key=lambda r: sessions[r.session_id].started_at)
    half = len(reports) // 2
    early = sum(r.overall_score for r in reports[:half]) / half
    late = sum(r.overall_score for r in reports[half:]) / (len(reports) - half)
    assert late >= early + 15


def test_rerun_overwrites_instead_of_duplicating(run, team):
    run(sample_team.load(now=NOW))
    assert len(_rows(run, "sessions")) == 24 and len(_rows(run, "reports")) == 24


def test_reset_and_remove_never_touch_real_sessions(run, team):
    store = _deps.get_store()
    real = Session(id="abc123", scenario_id="scenario-saas-pricing", persona_id="persona-dana-kim",
                   status="ended", turns=[Turn(index=0, role="customer", text="Hi")])
    run(store.put("sessions", real.id, real.model_dump(mode="json")))
    run(store.put("reports", real.id, Report(session_id=real.id, overall_score=70, summary="real").model_dump(mode="json")))
    # an unlabeled session that merely uses the prefix is not sample data
    run(store.put("sessions", "sample-lookalike", {**real.model_dump(mode="json"), "id": "sample-lookalike"}))

    counts = run(sample_team.load(reset=True, now=NOW))
    assert counts["removed"] == 24 and counts["sessions"] == 24

    assert run(sample_team.remove()) == 24
    left = {r["id"] for r in _rows(run, "sessions")}
    assert left == {"abc123", "sample-lookalike"}
    assert [r["session_id"] for r in _rows(run, "reports")] == ["abc123"]


def test_dashboard_counts_sample_sessions(run, team):
    from app.session.routes import dashboard

    d = run(dashboard())
    assert d.sessions_count == 24 and d.ready_count >= 5
    assert {v.rule_id for v in d.top_violations} >= {"CC-01"}
    assert {x.name for x in d.by_dimension} >= {"Discovery", "Compliance", "Empathy"}


def test_requires_the_seeded_scenarios(run):
    with pytest.raises(sample_team.SampleError, match="app.seed"):
        run(sample_team.load(now=NOW))

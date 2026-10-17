"""HTTP routes for practice sessions and the dashboard (docs/API_CONTRACT.md)."""
from __future__ import annotations

import json
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.schemas import (
    ComplianceFlag, Dashboard, DeliveryFeedback, DimensionAverage, Persona, Report, Scenario, Session, SessionSummary, ViolationCount,
)
from app.auth import User, optional_user
from app.session import deps, orchestrator
from app.session.orchestrator import PERSONAS, REPORTS, SCENARIOS, SESSIONS, SessionError

router = APIRouter(prefix="/api", tags=["sessions"])

RECENT_SESSIONS = 10
TOP_VIOLATIONS = 5
READY_SCORE = 80
SAMPLE_PREFIX = "sample-"


class CreateSessionRequest(BaseModel):
    scenario_id: str


class TurnRequest(BaseModel):
    text: str


def _http(e: SessionError) -> HTTPException:
    return HTTPException(status_code=e.status, detail=e.detail)


@router.post("/sessions", response_model=Session)
async def create_session(body: CreateSessionRequest, user: User | None = Depends(optional_user)) -> Session:
    try:
        return await orchestrator.create_session(
            body.scenario_id, user_id=user.uid if user else None, trainee_name=user.name if user else None)
    except SessionError as e:
        raise _http(e)


@router.get("/sessions", response_model=list[Session])
async def list_sessions() -> list[Session]:
    rows = [Session.model_validate(r) for r in await deps.get_store().list(SESSIONS)]
    return sorted(rows, key=lambda s: s.started_at, reverse=True)


@router.get("/me/sessions", response_model=list[SessionSummary])
async def my_sessions(user: User | None = Depends(optional_user)) -> list[SessionSummary]:
    """The signed-in trainee's own practice history, newest first."""
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to see your practice history")
    store = deps.get_store()
    mine = [Session.model_validate(r) for r in await store.list(SESSIONS) if r.get("user_id") == user.uid]
    return await _summaries(sorted(mine, key=lambda s: s.started_at, reverse=True))


async def _summaries(sessions: list[Session]) -> list[SessionSummary]:
    store = deps.get_store()
    ids = {s.id for s in sessions}
    reports = {r["session_id"]: Report.model_validate(r) for r in await store.list(REPORTS) if r.get("session_id") in ids}
    scenarios = {r["id"]: Scenario.model_validate(r) for r in await store.list(SCENARIOS)}
    personas = {r["id"]: Persona.model_validate(r) for r in await store.list(PERSONAS)}
    return [_summary(s, scenarios, personas, reports) for s in sessions]


def _summary(s: Session, scenarios: dict, personas: dict, reports: dict) -> SessionSummary:
    return SessionSummary(
        id=s.id,
        scenario_title=scenarios[s.scenario_id].title if s.scenario_id in scenarios else "(deleted scenario)",
        persona_name=personas[s.persona_id].name if s.persona_id in personas else "(deleted persona)",
        trainee_name=s.trainee_name,
        overall_score=reports[s.id].overall_score if s.id in reports else None,
        compliance_passed=reports[s.id].compliance_passed if s.id in reports else None,
        started_at=s.started_at)


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str) -> Session:
    try:
        return (await orchestrator.load_record(session_id)).session
    except SessionError as e:
        raise _http(e)


@router.post("/sessions/{session_id}/turns")
async def post_turn(session_id: str, body: TurnRequest) -> StreamingResponse:
    try:
        await orchestrator.validate_turn(session_id, body.text)
    except SessionError as e:
        raise _http(e)

    async def sse():
        async for event, data in orchestrator.run_turn(session_id, body.text):
            yield f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class PrecheckResponse(BaseModel):
    flags: list[ComplianceFlag]


@router.post("/sessions/{session_id}/precheck", response_model=PrecheckResponse)
async def precheck(session_id: str, body: TurnRequest) -> PrecheckResponse:
    """Compliance Guard: judge a draft before it is sent. Nothing is stored in the session."""
    try:
        return PrecheckResponse(flags=await orchestrator.precheck_compliance(session_id, body.text))
    except SessionError as e:
        raise _http(e)


class DeliveryRequest(BaseModel):
    image: str  # base64 JPEG or PNG, optionally as a data: URL
    text: str = ""
    # On-device MediaPipe summary of the whole turn (eye contact, emotions, blinks); optional.
    cues: dict | None = None


@router.post("/sessions/{session_id}/delivery", response_model=DeliveryFeedback)
async def delivery(session_id: str, body: DeliveryRequest) -> DeliveryFeedback:
    """Live mode: Gemini looks at one camera frame of the trainee. The frame is not stored."""
    try:
        return await orchestrator.delivery_feedback(session_id, body.image, body.text, body.cues)
    except SessionError as e:
        raise _http(e)


@router.post("/sessions/{session_id}/end", response_model=Report)
async def end_session(session_id: str) -> Report:
    try:
        return await orchestrator.end_session(session_id)
    except SessionError as e:
        raise _http(e)
    except Exception:
        raise HTTPException(status_code=502, detail="Report generation failed. Please try again.")


@router.get("/sessions/{session_id}/report", response_model=Report)
async def get_report(session_id: str) -> Report:
    try:
        return await orchestrator.get_report(session_id)
    except SessionError as e:
        raise _http(e)


def is_sample(row: dict) -> bool:
    return row.get("sample") is True or str(row.get("id", "")).startswith(SAMPLE_PREFIX)


@router.get("/dashboard", response_model=Dashboard)
async def dashboard() -> Dashboard:
    """Aggregates only; no transcripts leave this endpoint."""
    store = deps.get_store()
    rows = await store.list(SESSIONS)
    sessions = [Session.model_validate(r) for r in rows]
    reports = {r["session_id"]: Report.model_validate(r) for r in await store.list(REPORTS)}
    scenarios = {r["id"]: Scenario.model_validate(r) for r in await store.list(SCENARIOS)}
    personas = {r["id"]: Persona.model_validate(r) for r in await store.list(PERSONAS)}

    scored = [r for r in reports.values() if r.session_id in {s.id for s in sessions}]
    by_dim: dict[str, list[int]] = defaultdict(list)
    violations: Counter[str] = Counter()
    messages: dict[str, str] = {}
    for r in scored:
        for d in r.dimensions:
            by_dim[d.name].append(d.score)
        for f in r.compliance_violations:
            violations[f.rule_id] += 1
            messages.setdefault(f.rule_id, f.message)
    # Show each rule's own wording, not the model's comment on one trainee's message.
    for sc in scenarios.values():
        for rule in sc.compliance_rules:
            if rule.id in messages:
                messages[rule.id] = rule.rule

    recent = sorted(sessions, key=lambda s: s.started_at, reverse=True)[:RECENT_SESSIONS]
    return Dashboard(
        sessions_count=len(sessions),
        average_score=round(sum(r.overall_score for r in scored) / len(scored), 1) if scored else None,
        ready_count=sum(1 for s in sessions if s.status == "ended" and s.id in reports
                        and reports[s.id].compliance_passed and reports[s.id].overall_score >= READY_SCORE),
        # Sample team data is aggregated like any session; this count lets the UI label it.
        # (SessionSummary has no flag for it: the frontend tells by the "sample-" id prefix.)
        sample_sessions_count=sum(1 for r in rows if is_sample(r)),
        by_dimension=[DimensionAverage(name=n, average=round(sum(v) / len(v), 1)) for n, v in by_dim.items()],
        top_violations=[ViolationCount(rule_id=k, message=messages[k], count=c)
                        for k, c in violations.most_common(TOP_VIOLATIONS)],
        recent_sessions=[_summary(s, scenarios, personas, reports) for s in recent],
    )

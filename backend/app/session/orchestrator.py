"""Per-turn pipeline for a practice session.

Event order per docs/API_CONTRACT.md:
compliance_pre -> customer_delta* -> customer_done -> {compliance_post, state, coach?} -> done
(the middle three in completion order; `error` replaces the rest on failure)

Latency: compliance_pre is the instant keyword pre-scan; the LLM compliance judge runs in
parallel with KB retrieval and the customer stream, and its verdict arrives in customer_done.
"""
from __future__ import annotations

import asyncio
import logging
import operator
import re
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.schemas import (
    BranchEvent, ComplianceFlag, DeliveryFeedback, Persona, Report, Scenario, SearchHit, Session, Turn, now,
)
from app.session import agents, deps, prompts

log = logging.getLogger(__name__)

SESSIONS, SCENARIOS, PERSONAS, REPORTS = "sessions", "scenarios", "personas", "reports"
KB_HITS = 4
# gemini-embedding-001 cosine scores have a high baseline (relevant ~0.70, unrelated ~0.62),
# so keep hits above an absolute floor AND close to the best hit. Tune after real E2E runs.
MIN_KB_SCORE = 0.6
MAX_KB_GAP = 0.06
PRECHECK_TIMEOUT_S = 2.0  # the frontend gives up at 2.5 s
VERDICT_CACHE_SIZE = 256

Event = tuple[str, dict[str, Any]]


class SessionError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


# ---------- Persistence ----------

class SessionRecord:
    """A Session plus engine-private bookkeeping (fired branch events) stored alongside it."""

    def __init__(self, session: Session, fired: set[str] | None = None):
        self.session, self.fired = session, fired or set()

    def dump(self) -> dict:
        return {**self.session.model_dump(mode="json"), "fired_events": sorted(self.fired)}


async def load_record(session_id: str) -> SessionRecord:
    data = await deps.get_store().get(SESSIONS, session_id)
    if data is None:
        raise SessionError(404, "Session not found")
    return SessionRecord(Session.model_validate(data), set(data.get("fired_events") or []))


async def save_record(rec: SessionRecord) -> None:
    await deps.get_store().put(SESSIONS, rec.session.id, rec.dump())


async def load_context(session: Session) -> tuple[Scenario, Persona]:
    store = deps.get_store()
    scenario = await store.get(SCENARIOS, session.scenario_id)
    persona = await store.get(PERSONAS, session.persona_id)
    if scenario is None or persona is None:
        raise SessionError(404, "Scenario or persona for this session no longer exists")
    return Scenario.model_validate(scenario), Persona.model_validate(persona)


def new_id() -> str:
    return uuid.uuid4().hex[:10]


# ---------- Branch events ----------

_OPS = {">=": operator.ge, "<=": operator.le, ">": operator.gt, "<": operator.lt,
        "==": operator.eq, "=": operator.eq}
_CLAUSE = re.compile(r"^\s*(turn|trust|patience)\s*(>=|<=|==|=|>|<)\s*(\d+)\s*$", re.I)


def trigger_holds(trigger: str, values: dict[str, int]) -> bool | None:
    """Evaluate 'turn >= 4 and trust < 30'. None if the trigger isn't in that grammar."""
    result = True
    for clause in re.split(r"\s+(?:and|&&)\s+", trigger.strip(), flags=re.I):
        m = _CLAUSE.match(clause)
        if not m:
            return None
        result &= _OPS[m.group(2)](values[m.group(1).lower()], int(m.group(3)))
    return result


def due_branch_events(scenario: Scenario, rec: SessionRecord, trainee_turns: int) -> list[BranchEvent]:
    """Events whose trigger became true now; each fires once. Free-text triggers go to the persona
    as conditional guidance until they are recorded as fired."""
    s = rec.session
    values = {"turn": trainee_turns, "trust": s.trust, "patience": s.patience}
    due: list[BranchEvent] = []
    for ev in scenario.branch_events:
        if ev.id in rec.fired:
            continue
        holds = trigger_holds(ev.trigger, values)
        if holds:
            rec.fired.add(ev.id)
            due.append(ev)
        elif holds is None:
            due.append(BranchEvent(id=ev.id, trigger=ev.trigger,
                                   event=f"Only if this applies ({ev.trigger}), and only once: {ev.event}"))
    return due


# ---------- Session lifecycle ----------

async def create_session(scenario_id: str, user_id: str | None = None, trainee_name: str | None = None) -> Session:
    store = deps.get_store()
    scenario_data = await store.get(SCENARIOS, scenario_id)
    if scenario_data is None:
        raise SessionError(404, "Scenario not found")
    scenario = Scenario.model_validate(scenario_data)
    persona_data = await store.get(PERSONAS, scenario.persona_id)
    if persona_data is None:
        raise SessionError(404, "Persona for this scenario not found")
    persona = Persona.model_validate(persona_data)

    text = await agents.opening_line(persona, scenario)
    session = Session(id=new_id(), scenario_id=scenario.id, persona_id=persona.id,
                      user_id=user_id, trainee_name=trainee_name,
                      trust=persona.initial_trust, patience=persona.initial_patience,
                      turns=[Turn(index=0, role="customer", text=text,
                                  trust=persona.initial_trust, patience=persona.initial_patience)])
    await save_record(SessionRecord(session))
    return session


_locks: dict[str, asyncio.Lock] = {}


def session_lock(session_id: str) -> asyncio.Lock:
    return _locks.setdefault(session_id, asyncio.Lock())


async def validate_turn(session_id: str, text: str) -> None:
    """Validate before the stream opens so the client gets a real HTTP status."""
    if not text.strip():
        raise SessionError(422, "Message text is empty")
    rec = await load_record(session_id)
    if rec.session.status != "active":
        raise SessionError(409, "Session has ended")
    if session_lock(session_id).locked():
        raise SessionError(409, "A turn is already in progress for this session")


# ---------- Compliance Guard ----------

# (session_id, text) -> judged flags, so /turns reuses a /precheck verdict instead of re-judging.
# Per instance and best effort: a miss simply judges again.
_verdicts: dict[tuple[str, str], list[ComplianceFlag]] = {}


def _remember_verdict(key: tuple[str, str], flags: list[ComplianceFlag]) -> None:
    _verdicts[key] = flags
    while len(_verdicts) > VERDICT_CACHE_SIZE:
        _verdicts.pop(next(iter(_verdicts)))


async def precheck_compliance(session_id: str, text: str) -> list[ComplianceFlag]:
    """Judge a draft message before it is sent. Stores nothing in the session; on timeout the
    keyword pre-scan is returned so the guard always answers fast."""
    text = text.strip()
    if not text:
        raise SessionError(422, "Message text is empty")
    rec = await load_record(session_id)
    if rec.session.status != "active":
        raise SessionError(409, "Session has ended")
    scenario, persona = await load_context(rec.session)
    pre = agents.keyword_flags(text, scenario.compliance_rules)
    try:
        flags = await asyncio.wait_for(
            agents.compliance_check(text, scenario.compliance_rules, persona.locale, candidates=pre,
                                    context=scenario.context, recent=rec.session.turns[-2:]),
            PRECHECK_TIMEOUT_S)
    except TimeoutError:
        log.warning("precheck judge timed out for session %s; returning keyword flags", session_id)
        return pre
    _remember_verdict((session_id, text), flags)
    return flags


async def _known(flags: list[ComplianceFlag]) -> list[ComplianceFlag]:
    return flags


async def run_turn(session_id: str, text: str) -> AsyncIterator[Event]:
    """Run one trainee turn and yield (event, data). The session is saved only if the turn completes."""
    async with session_lock(session_id):
        try:
            async for event in _run_turn(session_id, text.strip()):
                yield event
        except SessionError as e:
            yield "error", {"detail": e.detail}
        except Exception:
            log.exception("turn failed for session %s", session_id)
            yield "error", {"detail": "The practice engine failed to process this turn. Please try again."}


async def _run_turn(session_id: str, text: str) -> AsyncIterator[Event]:
    t0 = time.perf_counter()
    timing: dict[str, int] = {}

    def mark(name: str) -> None:
        timing[name] = round((time.perf_counter() - t0) * 1000)

    rec = await load_record(session_id)
    s = rec.session
    if s.status != "active":
        raise SessionError(409, "Session has ended")
    scenario, persona = await load_context(s)

    trainee = Turn(index=len(s.turns), role="trainee", text=text)
    s.turns.append(trainee)

    # 1. Instant keyword pre-scan; the LLM compliance judge runs alongside retrieval and the reply.
    # A verdict from /precheck on the same text is reused (and is the better compliance_pre).
    known = _verdicts.pop((session_id, text), None)
    pre = known if known is not None else agents.keyword_flags(text, scenario.compliance_rules)
    yield "compliance_pre", {"flags": [f.model_dump(mode="json") for f in pre]}
    judge = asyncio.create_task(
        _known(known) if known is not None
        else agents.compliance_check(text, scenario.compliance_rules, persona.locale, candidates=pre,
                                     context=scenario.context, recent=s.turns[:-1][-2:]))
    judge.add_done_callback(lambda _: mark("compliance"))  # when the judge itself finished
    try:
        hits = await _kb(text, scenario)
        mark("kb")

        # 2. Customer reply, streamed.
        trainee_count = sum(1 for t in s.turns if t.role == "trainee")
        events = due_branch_events(scenario, rec, trainee_count)
        parts: list[str] = []
        async for chunk in agents.persona_reply(persona, scenario, s.turns, hits, trust=s.trust,
                                                patience=s.patience, events=events):
            if not parts:
                mark("first_delta")
            parts.append(chunk)
            yield "customer_delta", {"text": chunk}
        reply = "".join(parts).strip()
        if not reply:
            raise RuntimeError("empty customer reply")
        mark("reply")

        # The judge's verdict (keyword hits plus anything the model adds) is final for the trainee turn.
        trainee.compliance = flags = await judge
    finally:
        judge.cancel()  # no-op once finished; stops a pending judge if the turn fails

    customer = Turn(index=len(s.turns), role="customer", text=reply,
                    citations=agents.reply_citations(reply, hits))
    s.turns.append(customer)
    yield "customer_done", {"turn": customer.model_dump(mode="json"),
                            "trainee_compliance": [f.model_dump(mode="json") for f in flags]}

    # 3. Grounding check, state and coach run concurrently; each event goes out as soon as it is ready.
    tasks = {
        asyncio.create_task(agents.grounding_check(reply, hits, s.turns[:-1], persona,
                                                   scenario)): "compliance_post",
        asyncio.create_task(agents.state_update(persona, s.turns, flags, trust=s.trust,
                                                patience=s.patience)): "state",
        asyncio.create_task(agents.coach_hint(scenario, persona, s.turns, hits, trust=s.trust,
                                              patience=s.patience)): "coach",
    }
    try:
        pending = set(tasks)
        while pending:
            finished, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in finished:
                kind, result = tasks[task], task.result()
                mark(kind)
                if kind == "compliance_post":
                    customer.compliance = result
                    yield "compliance_post", {"flags": [f.model_dump(mode="json") for f in result]}
                elif kind == "state":
                    s.trust = customer.trust = result.trust
                    s.patience = customer.patience = result.patience
                    yield "state", {"trust": result.trust, "patience": result.patience,
                                    "trust_delta": result.trust_delta,
                                    "patience_delta": result.patience_delta, "reason": result.reason}
                elif result is not None:  # coach; skipped when the coach failed
                    customer.coach = result
                    yield "coach", {"hint": result.model_dump(mode="json")}
    finally:
        for task in tasks:
            task.cancel()

    # 4. End conditions.
    if trainee_count >= scenario.max_turns or s.patience <= 0:
        s.status, s.ended_at = "ended", now()
    await save_record(rec)
    if deps.SPECULATIVE_REPORTS:
        start_draft(s, scenario, persona)
    mark("total")
    log.info("turn timing session=%s %s", s.id, timing)
    yield "done", {"session_status": s.status, "timing_ms": timing}


async def _kb(text: str, scenario: Scenario):
    try:
        hits = await deps.kb_search(text, k=KB_HITS, document_ids=scenario.document_ids or None)
    except Exception:
        log.warning("KB search failed; continuing without grounding", exc_info=True)
        return []
    return relevant_hits(hits, absolute=not deps.llm_fake())


def relevant_hits(hits: list[SearchHit], *, absolute: bool = True) -> list[SearchHit]:
    """Drop weak hits so unrelated chunks never become grounding or citations. Fake (hash)
    embeddings score ~0.1-0.4, so LLM_FAKE mode applies only the relative cut."""
    if not hits:
        return []
    top = max(h.score for h in hits)
    return [h for h in hits
            if h.score >= top - MAX_KB_GAP and (not absolute or h.score >= MIN_KB_SCORE)]


# ---------- Reports ----------

# Speculative drafts: after each completed turn the report for the transcript so far is generated
# in the background (the trainee spends far longer typing than the report takes), so End returns
# a finished draft. session_id -> (turn count the draft covers, task). Drafts are never persisted;
# only end_session stores a report. Requires CPU outside requests (Cloud Run --no-cpu-throttling).
_drafts: dict[str, tuple[int, asyncio.Task[Report]]] = {}


def _log_draft_failure(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception() is not None:
        log.warning("report draft failed: %s", task.exception())


def start_draft(session: Session, scenario: Scenario, persona: Persona) -> None:
    if old := _drafts.pop(session.id, None):
        old[1].cancel()
    turns = [t.model_copy(deep=True) for t in session.turns]
    task = asyncio.create_task(agents.final_report(session.id, scenario, persona, turns))
    task.add_done_callback(_log_draft_failure)
    _drafts[session.id] = (len(turns), task)


async def _take_draft(session: Session) -> Report | None:
    """The draft for exactly this transcript, waiting if it is still running; else None."""
    entry = _drafts.pop(session.id, None)
    if entry is None:
        return None
    covered, task = entry
    if covered != len(session.turns) or task.cancelled():
        task.cancel()
        return None
    try:
        return await task
    except asyncio.CancelledError:
        if task.cancelled():  # the draft died (e.g. its event loop shut down), not us
            return None
        raise
    except Exception:  # already logged by the callback; fall back to generating inline
        return None


MAX_FRAME_BYTES = 1_500_000


def _decode_frame(image: str) -> tuple[bytes, str]:
    import base64
    import binascii

    mime = "image/jpeg"
    if image.startswith("data:"):
        header, _, image = image.partition(",")
        mime = header[5:].split(";")[0] or mime
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise SessionError(415, "Frame must be a JPEG, PNG or WebP image")
    try:
        data = base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError):
        raise SessionError(422, "Frame is not valid base64")
    if not data:
        raise SessionError(422, "Frame is empty")
    if len(data) > MAX_FRAME_BYTES:
        raise SessionError(413, "Frame is too large; send a smaller JPEG")
    return data, mime


def _cue_lines(cues: dict | None) -> str:
    """Compact, bounded text for the on-device cue summary (numbers only, no free text)."""
    if not cues:
        return ""
    def num(k: str) -> float | None:
        v = cues.get(k)
        return round(float(v), 2) if isinstance(v, (int, float)) else None
    parts = [f"{k}={num(k)}" for k in ("face_visible", "eye_contact", "smile", "brow_furrow", "blinks_per_min")
             if num(k) is not None]
    emotions = cues.get("emotions") if isinstance(cues.get("emotions"), dict) else {}
    top = sorted(((str(k)[:12], float(v)) for k, v in emotions.items() if isinstance(v, (int, float))),
                 key=lambda kv: kv[1], reverse=True)[:3]
    if top:
        parts.append("emotions=" + ", ".join(f"{k} {v:.2f}" for k, v in top))
    return "\nOn-device face tracking over the whole turn (MediaPipe, 0-1 scales): " + "; ".join(parts)


async def delivery_feedback(session_id: str, image: str, text: str = "", cues: dict | None = None) -> DeliveryFeedback:
    """Live mode: non-verbal delivery feedback from one webcam frame (plus optional on-device
    cue summary for the whole turn). Nothing is stored."""
    data, mime = _decode_frame(image)
    rec = await load_record(session_id)
    _scenario, persona = await load_context(rec.session)
    prompt = (
        f"Customer: {persona.name}, {persona.title}. Customer trust {rec.session.trust}/100, "
        f"patience {rec.session.patience}/100.\n"
        f"What the trainee said in this turn: {text.strip()[:600] or '(not given)'}"
        f"{_cue_lines(cues)}"
    )
    return await deps.generate_json(
        prompt, DeliveryFeedback, system=prompts.DELIVERY_SYSTEM, model=deps.lite_model(),
        temperature=0.3, thinking="low", images=[(data, mime)],
    )


async def end_session(session_id: str) -> Report:
    """Idempotent: ends the session if needed and returns its report (generated once)."""
    async with session_lock(session_id):
        existing = await deps.get_store().get(REPORTS, session_id)
        if existing is not None:
            return Report.model_validate(existing)
        rec = await load_record(session_id)
        s = rec.session
        if not any(t.role == "trainee" for t in s.turns):
            raise SessionError(400, "Nothing to assess yet: the trainee has not spoken")
        scenario, persona = await load_context(s)
        report = await _take_draft(s) or await agents.final_report(s.id, scenario, persona, s.turns)
        if s.status != "ended":
            s.status, s.ended_at = "ended", now()
        await deps.get_store().put(REPORTS, s.id, report.model_dump(mode="json"))
        await save_record(rec)
        return report


async def get_report(session_id: str) -> Report:
    data = await deps.get_store().get(REPORTS, session_id)
    if data is None:
        raise SessionError(404, "Report not found; end the session first")
    return Report.model_validate(data)

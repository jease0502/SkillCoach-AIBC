"""Sample team data for the manager dashboard: `python -m app.seed.sample_team [--reset | --remove]`.

Writes about two dozen ended practice sessions with reports, spread over the last
14 days, so the dashboard looks like a real team. No Gemini calls: transcripts
come from fixed templates and scores are computed with the same rules as the
report agent:
- every evidence quote is an exact span of a trainee turn in that session;
- the overall score is the rubric-weighted average of the dimension scores;
- any high-severity violation fails the compliance gate and caps the score at 59.

Every sample session id starts with `sample-` and its record carries
`sample: true`. `--reset` and `--remove` delete only those records, never real
sessions. Run `python -m app.seed` first: samples use the seeded scenarios.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.builder import _deps
from app.schemas import (ComplianceFlag, DimensionScore, Evidence, Persona, Report, Scenario, Session,
                         Turn)

SESSIONS, REPORTS = "sessions", "reports"
PREFIX = "sample-"
DAYS = 14
COMPLIANCE_FAIL_CAP = 59  # same rule as the report agent
RNG_SEED = 2026


class SampleError(RuntimeError):
    pass


# ---------- transcript templates ----------

@dataclass
class Line:
    trainee: str
    customer: str
    flags: list[str] = field(default_factory=list)  # "RULE-ID|exact quote from the trainee line"


@dataclass
class Dim:
    rubric_id: str
    low: int
    high: int
    quote: str  # must be an exact span of one trainee line
    feedback: str


@dataclass
class Template:
    key: str
    scenario_id: str
    lines: list[Line]
    dims: list[Dim]
    summary: str
    strengths: list[str]
    improvements: list[str]


SAAS = "scenario-saas-pricing"
INSURANCE = "scenario-insurance-compliance"
SUPPORT = "scenario-support-escalation"

TEMPLATES = {t.key: t for t in [
    # ----- A. SaaS pricing objection -----
    Template(
        "saas-strong", SAAS,
        [Line("That's fair to ask. Before I answer, what happened with the tool you tried last year?",
              "Honestly? My team stopped using it after a few weeks. Why would yours be any different?"),
         Line("That makes sense. Every Pro plan includes guided onboarding and a weekly adoption report, and "
              "customers on that program average 78% weekly active users after 90 days. You can prove it first "
              "in a 30-day free pilot.",
              "The adoption numbers sound reasonable. But what about security? Our customer data can't leak."),
         Line("We're SOC 2 Type II certified, data is encrypted in transit and at rest, and Pro includes a 99.9% "
              "uptime SLA. Could we kick off the pilot with two of your team leads next Tuesday?",
              "That covers my IT checklist. Tuesday works, send me the pilot terms.")],
        [Dim("discovery", 82, 98, "what happened with the tool you tried last year?",
             "Asked about the previous tool before pitching and uncovered the adoption concern."),
         Dim("objection-handling", 78, 95, "customers on that program average 78% weekly active users after 90 days",
             "Answered the real concern (adoption) with evidence instead of arguing about price."),
         Dim("accuracy", 85, 100, "We're SOC 2 Type II certified",
             "Product facts (onboarding, adoption data, SOC 2, SLA) match the product sheet."),
         Dim("closing", 80, 98, "Could we kick off the pilot with two of your team leads next Tuesday?",
             "Closed on a specific next step with named participants and a date.")],
        "The trainee uncovered the adoption concern behind the price objection, answered it with product evidence "
        "and secured a pilot kickoff.",
        ["Open discovery question before pitching", "Specific, accurate product evidence"],
        ["Confirm that the answer resolved the concern before moving to security"]),
    Template(
        "saas-pitch-first", SAAS,
        [Line("Our product is the best on the market, so it's worth the price.",
              "Every vendor says they're the best. Show me something concrete."),
         Line("Fair enough. What happened with the tool you tried last year?",
              "My team stopped using it after a few weeks."),
         Line("Our Pro plan includes a 30-day free pilot, so your team can prove adoption before you commit.",
              "A free pilot doesn't guarantee anyone uses it. What do you actually do to drive adoption?")],
        [Dim("discovery", 55, 72, "What happened with the tool you tried last year?",
             "Found the adoption concern, but only after pitching first."),
         Dim("objection-handling", 35, 55, "Our product is the best on the market, so it's worth the price.",
             "Opened with an unsupported claim; the playbook says acknowledge and ask before you pitch."),
         Dim("accuracy", 65, 82, "Our Pro plan includes a 30-day free pilot",
             "The pilot is described correctly, but onboarding and adoption data were not used."),
         Dim("closing", 30, 50, "so your team can prove adoption before you commit",
             "No concrete next step with people and a date.")],
        "The trainee pitched before understanding the objection, then recovered with a good discovery question, "
        "but did not answer the adoption concern with evidence or agree a next step.",
        ["Recovered with an open question about the previous tool"],
        ["Acknowledge and ask before you pitch", "Use onboarding and adoption data as evidence",
         "End with a dated next step"]),
    Template(
        "saas-discount", SAAS,
        [Line("I hear you. If price is the issue, I can give you 30% off if you sign this week.",
              "Thirty percent off? That makes me wonder what the real price is.",
              ["PR-01|I can give you 30% off"]),
         Line("What would your team need to see to feel confident about adoption?",
              "Proof that people actually use it after the first month."),
         Line("We can run a 30-day free pilot for up to 20 users so you can see real usage first.",
              "Fine, send me the details and I'll think about it.")],
        [Dim("discovery", 60, 75, "What would your team need to see to feel confident about adoption?",
             "Asked a useful question about adoption, but late."),
         Dim("objection-handling", 30, 50, "I can give you 30% off if you sign this week.",
             "Answered a price objection with an unapproved discount instead of value."),
         Dim("accuracy", 60, 78, "We can run a 30-day free pilot for up to 20 users",
             "The pilot terms are correct; the discount is not in the published pricing."),
         Dim("closing", 40, 60, "so you can see real usage first",
             "Next step is vague: no date or participants.")],
        "The trainee offered a discount beyond the published volume pricing, then moved to the pilot. "
        "The customer stayed skeptical.",
        ["Mentioned the free pilot correctly"],
        ["Never discount beyond published volume pricing (PR-01)", "Respond to price objections with value"]),

    # ----- B. Insurance compliance trap -----
    Template(
        "ins-guarantee", INSURANCE,
        [Line("Don't worry, this plan guarantees you 8% a year.",
              "Eight percent, guaranteed? That sounds very good. So I cannot lose anything?",
              ["CC-01|guarantees you 8% a year"]),
         Line("You need to sign today, the offer ends tonight.",
              "Today? I always talk to my wife before big decisions.",
              ["CC-03|You need to sign today"]),
         Line("Historically the plan has averaged 5.2%, but past performance doesn't guarantee future results.",
              "Now I am confused. Is it guaranteed or not?")],
        [Dim("compliance", 5, 25, "this plan guarantees you 8% a year",
             "Promised a guaranteed return on an investment-linked product (CC-01) and pressured a same-day decision."),
         Dim("accuracy", 40, 60, "Historically the plan has averaged 5.2%",
             "The historical average is correct, but it contradicts the earlier guarantee."),
         Dim("needs-discovery", 15, 35, "You need to sign today",
             "No questions about his needs, time horizon or need for cash."),
         Dim("empathy", 25, 45, "Don't worry",
             "Reassurance without listening to his worry about losing money.")],
        "The trainee promised a guaranteed 8% return and pushed for a same-day signature. The session fails the "
        "compliance gate.",
        ["Quoted the historical average correctly once"],
        ["Never promise or imply guaranteed returns (CC-01)", "Do not pressure for a same-day decision (CC-03)",
         "Ask about needs and need for cash before recommending"]),
    Template(
        "ins-guarantee-recover", INSURANCE,
        [Line("Don't worry, this plan guarantees you 8% a year.",
              "Guaranteed? Then I cannot lose any of it?",
              ["CC-01|guarantees you 8% a year"]),
         Line("I'm sorry, I misspoke. I can't promise that. The value can go down as well as up.",
              "Hmm. Then why should I put my retirement money in it?"),
         Line("May I ask what you'd need that money for, and when?",
              "My wife may need treatment in the next few years. I must be able to take the money out.")],
        [Dim("compliance", 20, 40, "this plan guarantees you 8% a year",
             "Corrected the guarantee, but the high-severity violation (CC-01) was already said."),
         Dim("accuracy", 60, 80, "The value can go down as well as up.",
             "Gave the required risk disclosure after correcting the mistake."),
         Dim("needs-discovery", 70, 88, "May I ask what you'd need that money for, and when?",
             "Asked about his need for cash and uncovered the medical costs."),
         Dim("empathy", 60, 78, "I'm sorry, I misspoke.",
             "Owned the mistake and slowed down.")],
        "The trainee promised a guaranteed return, then corrected it and asked good discovery questions. "
        "The early CC-01 violation still fails the compliance gate.",
        ["Corrected the mistake openly", "Good question about his need for cash"],
        ["Never promise or imply guaranteed returns (CC-01), even to reassure"]),
    Template(
        "ins-clean", INSURANCE,
        [Line("I can't promise that. Historically the plan has averaged 5.2%, but past performance doesn't "
              "guarantee future results, and the value can go down as well as up.",
              "That is honest. But I worry about losing money."),
         Line("That's an important point. May I ask what you'd need that money for, and when?",
              "My wife may need medical treatment in the next few years."),
         Line("Then part of your savings should stay in a liquid account. If you do choose this plan, you also have "
              "a 15-day free-look period to change your mind.",
              "Thank you. I would like to talk to my wife and come back next week.")],
        [Dim("compliance", 85, 100, "the value can go down as well as up",
             "No guarantee, full risk disclosure and the free-look period mentioned."),
         Dim("accuracy", 82, 98, "Historically the plan has averaged 5.2%",
             "Figures and terms match the brochure."),
         Dim("needs-discovery", 80, 96, "May I ask what you'd need that money for, and when?",
             "Uncovered the need for cash before recommending."),
         Dim("empathy", 78, 95, "That's an important point.",
             "Acknowledged his worry and did not rush him.")],
        "The trainee stayed compliant, disclosed the risks, uncovered the medical-cost need and suggested keeping "
        "part of the savings liquid.",
        ["Clear risk disclosure", "Needs-based recommendation", "Mentioned the 15-day free-look period"],
        ["Summarize the agreed next step with a date"]),

    # ----- C. Support escalation -----
    Template(
        "sup-refund-promise", SUPPORT,
        [Line("Sure, I'll refund you in full right away.",
              "Wait, really? Just like that?",
              ["RR-01|I'll refund you in full right away."]),
         Line("I'm sorry, I spoke too soon. Since it's past 30 days I can't do a cash refund, but I can request "
              "store credit, arrange a warranty repair, or connect you with my supervisor today.",
              "You just told me I was getting my money back! Get your supervisor."),
         Line("Of course. I'm requesting a supervisor callback for you right now, and you'll hear from them today. "
              "Can I ask, were these for something special?",
              "They were a birthday present for my friend. It was embarrassing when they died.")],
        [Dim("policy-accuracy", 30, 55, "I'll refund you in full right away.",
             "Promised a cash refund outside the 30-day window (RR-01), then corrected it."),
         Dim("empathy", 75, 95, "I'm sorry, I spoke too soon.",
             "Owned the mistake and acknowledged the frustration."),
         Dim("de-escalation", 75, 95, "you'll hear from them today",
             "Honored the supervisor request with a time frame and asked a gentle question.")],
        "The trainee promised an out-of-policy refund, then recovered with an apology, real options and a "
        "same-day supervisor callback.",
        ["Recovered from the mistake", "Gave a clear time frame"],
        ["Check the purchase date before promising a refund (RR-01)"]),
    Template(
        "sup-calm-down", SUPPORT,
        [Line("Calm down, it's not my fault.",
              "Don't tell me to calm down! I want to talk to your manager.",
              ["TONE-01|Calm down, it's not my fault."]),
         Line("Since it's past 30 days I can't do a cash refund. I can offer store credit.",
              "Store credit? Why would I want more of your products?"),
         Line("I can also arrange a warranty repair, which takes 7 to 10 business days.",
              "Fine. But I'm not happy about this.")],
        [Dim("policy-accuracy", 70, 88, "Since it's past 30 days I can't do a cash refund.",
             "Stayed within policy and offered the allowed options."),
         Dim("empathy", 15, 35, "Calm down, it's not my fault.",
             "Told the customer to calm down and deflected blame (TONE-01)."),
         Dim("de-escalation", 35, 55, "which takes 7 to 10 business days",
             "Gave a time frame, but did not turn the conversation around.")],
        "The trainee followed the refund policy but escalated the customer by telling them to calm down.",
        ["Accurate policy options with a time frame"],
        ["Acknowledge emotion before policy", "Never tell a customer to calm down (TONE-01)"]),
    Template(
        "sup-strong", SUPPORT,
        [Line("I'm sorry this happened, that's really frustrating.",
              "It is! They died after a month and a bit."),
         Line("Since it's past 30 days I can't do a cash refund, but I can request store credit, arrange a warranty "
              "repair, or connect you with my supervisor today. Which would you prefer?",
              "I guess the repair. How long does it take?"),
         Line("A warranty repair takes 7 to 10 business days, and I'll send you the tracking today. "
              "Were these for something special?",
              "They were a birthday present for my friend. Thanks for sorting it out.")],
        [Dim("policy-accuracy", 85, 100, "Since it's past 30 days I can't do a cash refund",
             "Offered exactly what the policy allows outside 30 days."),
         Dim("empathy", 85, 100, "I'm sorry this happened, that's really frustrating.",
             "Acknowledged the emotion before explaining policy."),
         Dim("de-escalation", 80, 96, "Which would you prefer?",
             "Offered clear options, let the customer choose and gave a time frame.")],
        "The trainee acknowledged the frustration, offered policy-compliant options with time frames and "
        "uncovered the story behind the request.",
        ["Empathy first", "Clear options and time frames"],
        ["Confirm the customer's contact details for the callback"]),
]}

# (days ago, template key): earlier sessions are weaker, later ones mostly ready.
SCHEDULE: list[tuple[int, str]] = [
    (13, "saas-pitch-first"), (13, "ins-guarantee"), (12, "sup-calm-down"),
    (12, "saas-discount"), (11, "ins-guarantee"), (11, "sup-refund-promise"),
    (10, "saas-pitch-first"), (9, "ins-guarantee-recover"), (9, "sup-calm-down"),
    (8, "saas-strong"), (8, "ins-clean"), (7, "sup-refund-promise"),
    (6, "saas-pitch-first"), (6, "ins-guarantee-recover"), (5, "sup-strong"),
    (5, "saas-strong"), (4, "ins-clean"), (4, "sup-refund-promise"),
    (3, "saas-strong"), (2, "ins-clean"), (2, "sup-strong"),
    (1, "saas-strong"), (1, "ins-clean"), (0, "sup-strong"),
]


# ---------- building ----------

def _flag(spec: str, text: str, rules: dict) -> ComplianceFlag:
    rule_id, quote = spec.split("|", 1)
    if rule_id not in rules or quote not in text:
        raise SampleError(f"bad flag {spec!r}")
    rule = rules[rule_id]
    return ComplianceFlag(rule_id=rule_id, severity=rule.severity, message=rule.rule, quote=quote)


def build(template: Template, scenario: Scenario, persona: Persona, *, number: int, started_at: datetime,
          progress: float, rng: random.Random) -> tuple[dict, Report]:
    """One ended session record (with `sample: true`) and its report.

    `progress` (0 = oldest, 1 = newest) adds a small upward trend to every score.
    """
    rules = {r.id: r for r in scenario.compliance_rules}
    session_id = f"{PREFIX}{template.key}-{number:02d}"
    at = started_at
    trust, patience = persona.initial_trust, persona.initial_patience
    turns = [Turn(index=0, role="customer", text=scenario.opening_line or persona.opening_line, at=at,
                  trust=trust, patience=patience)]
    for line in template.lines:
        at += timedelta(seconds=rng.randint(25, 70))
        flags = [_flag(f, line.trainee, rules) for f in line.flags]
        turns.append(Turn(index=len(turns), role="trainee", text=line.trainee, at=at, compliance=flags))
        at += timedelta(seconds=rng.randint(4, 9))
        bad = any(f.severity in ("high", "medium") for f in flags)
        trust = max(0, min(100, trust + (rng.randint(-12, -6) if bad else rng.randint(2, 8))))
        patience = max(0, min(100, patience + rng.randint(-8, -1)))
        turns.append(Turn(index=len(turns), role="customer", text=line.customer, at=at,
                          trust=trust, patience=patience))

    trainee = [t for t in turns if t.role == "trainee"]
    dims_by_id = {d.rubric_id: d for d in template.dims}
    dimensions = []
    for item in scenario.rubric:
        d = dims_by_id[item.id]
        turn = next((t for t in trainee if d.quote in t.text), None)
        if turn is None:
            raise SampleError(f"{template.key}: evidence {d.quote!r} is not in the transcript")
        score = min(100, rng.randint(d.low, d.high) + round(progress * 6))
        dimensions.append(DimensionScore(rubric_id=item.id, name=item.name, score=score, feedback=d.feedback,
                                         evidence=[Evidence(turn_index=turn.index, quote=d.quote, verified=True)]))

    weights = {r.id: max(r.weight, 0.0) for r in scenario.rubric}
    overall = round(sum(d.score * weights[d.rubric_id] for d in dimensions) / (sum(weights.values()) or 1.0))
    violations = [f for t in trainee for f in t.compliance]
    passed = not any(f.severity == "high" for f in violations)
    if not passed:
        overall = min(overall, COMPLIANCE_FAIL_CAP)

    ended_at = at + timedelta(seconds=rng.randint(5, 20))
    session = Session(id=session_id, scenario_id=scenario.id, persona_id=persona.id, status="ended",
                      turns=turns, trust=trust, patience=patience, started_at=started_at, ended_at=ended_at)
    record = {**session.model_dump(mode="json"), "fired_events": [], "sample": True}
    report = Report(session_id=session_id, overall_score=overall, compliance_passed=passed,
                    summary=template.summary, dimensions=dimensions, compliance_violations=violations,
                    strengths=template.strengths, improvements=template.improvements, created_at=ended_at)
    return record, report


async def remove() -> int:
    """Delete sample sessions and their reports. Real sessions are never touched."""
    store = _deps.get_store()
    removed = 0
    for row in await store.list(SESSIONS):
        if str(row.get("id", "")).startswith(PREFIX) and row.get("sample") is True:
            await store.delete(SESSIONS, row["id"])
            removed += 1
    for row in await store.list(REPORTS):
        if str(row.get("session_id", "")).startswith(PREFIX):
            await store.delete(REPORTS, row["session_id"])
    return removed


async def load(*, reset: bool = False, now: datetime | None = None) -> dict[str, int]:
    """Write the sample team. Ids are stable, so running it twice overwrites instead of duplicating."""
    store = _deps.get_store()
    scenarios = {}
    personas = {}
    for sid in (SAAS, INSURANCE, SUPPORT):
        row = await store.get("scenarios", sid)
        if row is None:
            raise SampleError(f"scenario {sid} not found; run `python -m app.seed` first")
        scenarios[sid] = Scenario.model_validate(row)
        prow = await store.get("personas", scenarios[sid].persona_id)
        if prow is None:
            raise SampleError(f"persona {scenarios[sid].persona_id} not found; run `python -m app.seed` first")
        personas[sid] = Persona.model_validate(prow)

    removed = await remove() if reset else 0
    now = now or datetime.now(timezone.utc)
    rng = random.Random(RNG_SEED)
    counts = {"sessions": 0, "ready": 0, "failed": 0, "removed": removed}
    for number, (days_ago, key) in enumerate(SCHEDULE, 1):
        template = TEMPLATES[key]
        started = (now - timedelta(days=days_ago)).replace(hour=rng.randint(1, 9), minute=rng.randint(0, 59),
                                                            second=0, microsecond=0)
        if started > now:
            started = now - timedelta(minutes=30)
        record, report = build(template, scenarios[template.scenario_id], personas[template.scenario_id],
                               number=number, started_at=started, progress=1 - days_ago / DAYS, rng=rng)
        await store.put(SESSIONS, record["id"], record)
        await store.put(REPORTS, report.session_id, report.model_dump(mode="json"))
        counts["sessions"] += 1
        counts["ready"] += report.compliance_passed and report.overall_score >= 80
        counts["failed"] += not report.compliance_passed
    return counts


def main() -> None:
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description="Load sample team sessions and reports for the dashboard.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--reset", action="store_true", help="delete existing sample records, then write fresh ones")
    group.add_argument("--remove", action="store_true", help="only delete sample records")
    args = parser.parse_args()
    if args.remove:
        print(f"Removed {asyncio.run(remove())} sample sessions (real sessions untouched).")
        return
    c = asyncio.run(load(reset=args.reset))
    print(f"Wrote {c['sessions']} sample sessions ({c['ready']} ready, {c['failed']} failed the compliance "
          f"gate); removed {c['removed']} old sample sessions first.")


if __name__ == "__main__":
    main()

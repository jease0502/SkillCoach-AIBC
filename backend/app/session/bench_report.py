"""Benchmark final-report configurations against real Gemini (time vs. quality).

    cd backend && python -m app.session.bench_report [--repeat 2] [--out bench-reports]

Uses the seed insurance scenario with a fixed 3-turn transcript (one CC-01 violation, then an
honest correction), so every configuration grades the same conversation. Needs real Gemini
credentials; nothing is written to the store.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path

from app.schemas import ComplianceFlag, Persona, Scenario, Turn
from app.session import agents, deps

SEED = Path(__file__).resolve().parent.parent / "seed" / "data"
SCENARIO_ID = "scenario-insurance-compliance"

TRANSCRIPT = [
    ("customer", "I've got about 200k sitting in the bank. My nephew says I should do something with it. "
                 "What have you got?"),
    ("trainee", "Great to meet you, Mr. Tan. Before I suggest anything, what is this money for, and when "
                "might you need some of it back?"),
    ("customer", "Retirement, mostly. I'm 58. I just don't want to lose it."),
    ("trainee", "Totally understand. Our Retirement Savings Plan is really popular, honestly it "
                "guarantees you about 6% a year, so you can't lose."),
    ("customer", "Guaranteed? My nephew said nothing is guaranteed with these plans."),
    ("trainee", "You're right, and I'm sorry, I misspoke. Returns are not guaranteed and the value can go "
                "down as well as up. There is also a 15-day free-look period, so you can cancel for a "
                "full refund. Would it help to take the brochure home and decide next week?"),
]

CONFIGS = [  # (label, model setting, thinking, parallel)
    ("pro/default/parallel", "pro", None, True),
    ("pro/default/single", "pro", None, False),
    ("pro/low/parallel", "pro", "low", True),
    ("pro/low/single", "pro", "low", False),
    ("flash/default/parallel", "fast", None, True),
    ("flash/default/single", "fast", None, False),
]


def _strip_citations(value):
    # Seed citations reference documents by name and are resolved at ingest; grading ignores them.
    if isinstance(value, dict):
        return {k: [] if k == "citations" else _strip_citations(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_strip_citations(v) for v in value]
    return value


def _load(name: str, id_: str) -> dict:
    rows = json.loads((SEED / name).read_text(encoding="utf-8"))
    return _strip_citations(next(r for r in rows if r["id"] == id_))


def build_case() -> tuple[Scenario, Persona, list[Turn]]:
    scenario = Scenario.model_validate(_load("scenarios.json", SCENARIO_ID))
    persona = Persona.model_validate(_load("personas.json", scenario.persona_id))
    turns = [Turn(index=i, role=role, text=text) for i, (role, text) in enumerate(TRANSCRIPT)]
    rule = next(r for r in scenario.compliance_rules if r.id == "CC-01")
    turns[3].compliance = [ComplianceFlag(rule_id=rule.id, severity=rule.severity,
                                          message="Promised a guaranteed return.",
                                          quote="guarantees you about 6% a year")]
    return scenario, persona, turns


async def main(repeat: int, out: Path | None, only: list[str] | None) -> None:
    scenario, persona, turns = build_case()
    models = {"pro": deps.pro_model(), "fast": deps.fast_model()}
    print(f"rubric={[r.id for r in scenario.rubric]} turns={len(turns)} models={models}\n")
    print(f"{'config':26} {'secs':>6}  overall  pass  verified/evidence  dimensions")
    for label, model, thinking, parallel in CONFIGS:
        if only and label not in only:
            continue
        for n in range(repeat):
            t0 = time.perf_counter()
            try:
                report = await agents.final_report("bench", scenario, persona, turns, model=models[model],
                                                   thinking=thinking, parallel=parallel)
            except Exception as e:  # noqa: BLE001 - report and keep benchmarking
                print(f"{label:26} FAILED: {e}")
                break
            secs = time.perf_counter() - t0
            ev = [e for d in report.dimensions for e in d.evidence]
            dims = " ".join(f"{d.rubric_id}={d.score}" for d in report.dimensions)
            print(f"{label:26} {secs:6.1f}  {report.overall_score:7}  {str(report.compliance_passed):5} "
                  f"{sum(e.verified for e in ev):>8}/{len(ev):<8}  {dims}")
            if out:
                out.mkdir(parents=True, exist_ok=True)
                (out / f"{label.replace('/', '_')}_{n}.json").write_text(
                    report.model_dump_json(indent=2), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--out", type=Path, help="write each report as JSON to compare feedback quality")
    ap.add_argument("--only", nargs="*", help="config labels to run, e.g. pro/low/parallel")
    args = ap.parse_args()
    asyncio.run(main(args.repeat, args.out, args.only))

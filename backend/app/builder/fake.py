"""Offline drafts for LLM_FAKE=true.

The core fake LLM fills every field with placeholders, which the builder
rightly rejects (no citations, no rules, invalid triggers). This module answers
the builder's own schemas instead: it reads the chunk blocks that the prompt
already contains and quotes real sentences from them, so offline drafts pass
the same validation and citation checks as real Gemini output.
"""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from app.builder.grounding import CitationDraft

_BLOCK = re.compile(r"^\[([^\]\n]+)\] \(([^)\n]*)\)\n(.*?)(?=\n\n\[[^\]\n]+\] \(|\n\n[A-Z][A-Z ]+[:(]|\Z)",
                    re.M | re.S)
_SEGMENT_NAME = re.compile(r"Name the persona exactly ([^.]+)\.")
_COUNT = re.compile(r"^COUNT: (\d+)", re.M)
_RULE_CODE = re.compile(r"\b[A-Z]{2,4}-\d{1,3}\b")

NAMES = ["Jordan Lee", "Priya Shah", "Sam Ortiz", "Maria Lopez", "Chris Walker", "Taylor Nguyen"]


def _section(prompt: str, heading: str) -> str:
    """Text after `heading` up to the next all-caps heading line."""
    start = prompt.find(heading)
    if start < 0:
        return ""
    body = prompt[prompt.index("\n", start) + 1:]
    nxt = re.search(r"\n\n[A-Z][A-Z ]{3,}[:(]", body)
    return body[:nxt.start()] if nxt else body


def _chunks(text: str) -> list[tuple[str, str, str]]:
    """(chunk_id, document_title, text) for each `[id] (Title)` block."""
    return [(m.group(1), m.group(2), m.group(3)) for m in _BLOCK.finditer(text)]


def _sentences(text: str) -> list[str]:
    """Plain sentences of a chunk, long enough to be a meaningful quote."""
    out = []
    for line in text.splitlines():
        line = re.sub(r"^[#>*\-\d.\s]+", "", line).strip()
        for sentence in re.split(r"(?<=[.!?])\s+", line):
            sentence = sentence.strip().strip("*_`").strip()
            if 25 <= len(sentence) <= 200:
                out.append(sentence)
    return out


def _cite(chunks: list[tuple[str, str, str]], i: int, *, prefer: re.Pattern | None = None) -> list[CitationDraft]:
    """One verbatim citation from the i-th chunk (wrapping around)."""
    if not chunks:
        return []
    for offset in range(len(chunks)):
        cid, _title, text = chunks[(i + offset) % len(chunks)]
        sentences = _sentences(text)
        if prefer:
            sentences = [s for s in sentences if prefer.search(s)] or sentences
        if sentences:
            return [CitationDraft(chunk_id=cid, quote=sentences[0])]
    return []


# ---------- personas ----------

def _segments(prompt: str, schema: type[BaseModel]) -> BaseModel:
    match = _COUNT.search(prompt)
    count = int(match.group(1)) if match else 3
    chunks = _chunks(_section(prompt, "KNOWLEDGE"))
    segments = []
    for i in range(count):
        cid = [chunks[i % len(chunks)][0]] if chunks else []
        topic = chunks[i % len(chunks)][1] if chunks else "the product"
        segments.append({
            "name": NAMES[i % len(NAMES)],
            "label": f"Customer reading about {topic}",
            "who": f"A customer with questions about {topic}.",
            "typical_objections": ["I need to understand the terms first.", "Why should I trust this?"],
            "hidden_need": "Wants reassurance that the decision is low risk.",
            "suggested_difficulty": 1 + i % 5,
            "source_chunk_ids": cid,
        })
    return schema.model_validate({"segments": segments})


def _persona(prompt: str, schema: type[BaseModel]) -> BaseModel:
    match = _SEGMENT_NAME.search(prompt)
    name = match.group(1).strip() if match else NAMES[0]
    chunks = _chunks(_section(prompt, "KNOWLEDGE"))
    topic = chunks[0][1] if chunks else "the offer"
    return schema.model_validate({
        "name": name,
        "title": "Prospective customer",
        "age": 42,
        "industry": "General",
        "summary": f"A careful customer comparing options around {topic}. Offline sample persona (LLM_FAKE).",
        "personality": ["cautious", "polite", "detail-oriented"],
        "communication_style": "Asks direct questions and wants plain answers.",
        "goals": [{"text": "Make a decision without surprises", "citations": _cite(chunks, 2)}],
        "hidden_needs": [{"text": "Needs to justify the decision to someone at home or at work.",
                          "citations": _cite(chunks, 1)}],
        "objections": [
            {"text": "Before anything else, what exactly am I paying for?", "trigger": "at the start",
             "citations": _cite(chunks, 0)},
            {"text": "I'd like to think about it first.", "trigger": "if the trainee pushes for a decision",
             "citations": []},
        ],
        "knowledge_level": "novice",
        "difficulty": 3,
        "opening_line": "Hi. Before anything else, what exactly am I paying for?",
    })


# ---------- scenarios ----------

def _scenario(prompt: str, schema: type[BaseModel]) -> BaseModel:
    rule_chunks = _chunks(_section(prompt, "RULE SOURCES"))
    knowledge = _chunks(_section(prompt, "KNOWLEDGE (product")) or rule_chunks
    rules = []
    for i in range(min(3, len(rule_chunks))):
        cites = _cite(rule_chunks, i, prefer=_RULE_CODE)
        if cites:
            code = _RULE_CODE.search(cites[0].quote)
            rules.append({"code": code.group() if code else "", "rule": f"Follow this policy: {cites[0].quote}",
                          "severity": "high" if i == 0 else "medium", "citations": cites})
    return schema.model_validate({
        "title": "Offline practice conversation",
        "description": "Sample scenario generated without Gemini (LLM_FAKE).",
        "context": "You are speaking with a prospective customer who has questions before deciding.",
        "success_criteria": ["Customer's main concern is identified", "Customer agrees to a clear next step"],
        "compliance_rules": rules,
        "rubric": [
            {"name": "Discovery", "description": "Asks open questions to find the real concern.", "weight": 1.0,
             "citations": []},
            {"name": "Accuracy", "description": "States only facts that are in the documents.", "weight": 1.5,
             "citations": _cite(knowledge, 0)},
            {"name": "Empathy", "description": "Acknowledges the customer's worries before answering.",
             "weight": 1.0, "citations": []},
        ],
        "branch_events": [
            {"trigger": "turn >= 4", "event": "asks for a concrete example"},
            {"trigger": "patience < 30", "event": "threatens to end the conversation"},
        ],
        "max_turns": 12,
    })


def respond(prompt: str, schema: type[BaseModel]) -> BaseModel | None:
    """A valid draft for a builder schema, or None for schemas this module does not know."""
    handler: Any = {"SegmentList": _segments, "PersonaDraft": _persona, "ScenarioDraft": _scenario}.get(
        schema.__name__)
    return handler(prompt, schema) if handler else None

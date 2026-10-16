"""Builder test fixtures: in-memory store, fake embeddings, scripted fake LLM."""
from __future__ import annotations

import asyncio
import os
import re
from collections.abc import Callable

import pytest

os.environ.setdefault("LLM_FAKE", "true")  # hashed embeddings, no GCP

from app.builder import _deps  # noqa: E402

_BLOCK = re.compile(r"^\[([^\]]+)\] \(([^)]*)\)\n(.*?)(?=\n\n\[|\Z)", re.M | re.S)


def chunks_in_prompt(prompt: str, section: str | None = None) -> list[tuple[str, str, str]]:
    """(chunk_id, document_title, text) for every chunk block in the prompt.

    `section` limits the search to the text after that heading (e.g. "RULE SOURCES").
    """
    if section:
        start = prompt.index(section)
        nxt = prompt.find("\n\nKNOWLEDGE", start)
        prompt = prompt[start: nxt if nxt > start else None]
    return [(m.group(1), m.group(2), m.group(3)) for m in _BLOCK.finditer(prompt)]


def first_sentence(text: str, containing: str = "") -> str:
    for line in text.splitlines():
        line = line.strip().lstrip("#").strip()
        if len(line) > 20 and containing.lower() in line.lower():
            return line.split(". ")[0].rstrip(".")
    raise AssertionError(f"no sentence containing {containing!r}")


class FakeLLM:
    """Replaces `_deps.generate_json`. Each call pops the next responder."""

    def __init__(self) -> None:
        self.responders: list[Callable[[str, type], object]] = []
        self.calls: list[dict] = []

    def queue(self, *responders: Callable[[str, type], object]) -> None:
        self.responders.extend(responders)

    async def __call__(self, prompt, schema, *, system=None, model=None, temperature=0.4, thinking=None):
        self.calls.append({"prompt": prompt, "schema": schema, "system": system, "model": model,
                           "thinking": thinking})
        if not self.responders:
            raise AssertionError("FakeLLM called more times than scripted")
        return self.responders.pop(0)(prompt, schema)


@pytest.fixture(autouse=True)
def fresh_store():
    from app.kb import search as kb_search
    from app.store import MemoryStore, set_store

    set_store(MemoryStore())
    kb_search.reset_cache()
    yield
    set_store(None)
    kb_search.reset_cache()


@pytest.fixture
def llm(monkeypatch) -> FakeLLM:
    fake = FakeLLM()
    monkeypatch.setattr(_deps, "generate_json", fake)
    return fake


@pytest.fixture
def run():
    return lambda coro: asyncio.run(coro)


@pytest.fixture
def seeded(run):
    from app.seed import load

    return run(load())

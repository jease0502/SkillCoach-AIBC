"""Single seam between the session engine and core services (LLM, store, KB).

Agents call these module attributes (never core directly), so tests can monkeypatch
them with a fake LLM, store and KB.
"""
from __future__ import annotations

import importlib
import inspect
import os
from collections.abc import AsyncIterator, Callable
from types import ModuleType
from typing import Any

from pydantic import BaseModel

from app.schemas import SearchHit

# Thinking levels (measured on Vertex, global): flash stream TTFT 6.0 s by default vs 1.1 s at
# "low"; gemini-3.8-flash rejects "minimal", so "low" avoids a wasted first call. Per-turn JSON
# agents use flash-lite (~1 s); flash JSON is ~3.7 s even at "low".
FAST_THINKING = "low"


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default).strip()


# Final report knobs, overridable per deployment (pick them with `python -m app.session.bench_report`).
# SESSION_REPORT_MODEL: model id, default GEMINI_PRO_MODEL. SESSION_REPORT_THINKING: minimal|low|
# medium|high|default. SESSION_REPORT_PARALLEL: one call per rubric dimension (true) or one call.
# SESSION_SPECULATIVE_REPORTS: draft the report in the background after each turn so End is instant.
_report_thinking = _env("SESSION_REPORT_THINKING", "default")
REPORT_THINKING: str | None = None if _report_thinking == "default" else _report_thinking
REPORT_PARALLEL = _env("SESSION_REPORT_PARALLEL", "true").lower() == "true"
SPECULATIVE_REPORTS = _env("SESSION_SPECULATIVE_REPORTS", "true").lower() == "true"


def _resolve(module: str) -> ModuleType:
    # Imported lazily so app.session loads without the google-genai SDK (fake-LLM tests).
    return importlib.import_module(module)


def _thinking_kw(fn: Callable[..., Any], thinking: str | None) -> dict[str, Any]:
    """Pass `thinking` only if core's function accepts it."""
    if thinking is None:
        return {}
    try:
        return {"thinking": thinking} if "thinking" in inspect.signature(fn).parameters else {}
    except (TypeError, ValueError):
        return {}


async def generate_json(prompt: str, schema: type[BaseModel], *, system: str | None = None,
                        model: str | None = None, temperature: float = 0.4,
                        thinking: str | None = None) -> BaseModel:
    fn = _resolve("app.llm.gemini").generate_json
    return await fn(prompt, schema, system=system, model=model, temperature=temperature,
                    **_thinking_kw(fn, thinking))


async def generate_text(prompt: str, *, system: str | None = None, model: str | None = None,
                        thinking: str | None = None) -> str:
    fn = _resolve("app.llm.gemini").generate_text
    return await fn(prompt, system=system, model=model, **_thinking_kw(fn, thinking))


def stream_text(prompt: str | list, *, system: str | None = None, model: str | None = None,
                thinking: str | None = None) -> AsyncIterator[str]:
    fn = _resolve("app.llm.gemini").stream_text
    return fn(prompt, system=system, model=model, **_thinking_kw(fn, thinking))


def get_store():
    return _resolve("app.store").get_store()


async def kb_search(query: str, k: int = 5, document_ids: list[str] | None = None) -> list[SearchHit]:
    return await _resolve("app.kb.search").search(query, k=k, document_ids=document_ids)


def _settings():
    from app.config import get_settings
    return get_settings()


def fast_model() -> str:
    return _settings().gemini_fast_model


def lite_model() -> str:
    """Cheapest model for state/coach; falls back to the fast model until config has it."""
    return getattr(_settings(), "gemini_lite_model", None) or fast_model()


def pro_model() -> str:
    return _settings().gemini_pro_model


def report_model() -> str:
    return _env("SESSION_REPORT_MODEL", "") or pro_model()


def llm_fake() -> bool:
    return _settings().llm_fake

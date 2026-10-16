"""Thin async wrapper around the google-genai SDK.

Every other module talks to Gemini only through the four functions below.
With LLM_FAKE=true the functions return deterministic canned output so the
app and tests run without Google Cloud credentials.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import random
import types as pytypes
import typing
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from functools import lru_cache
from typing import Any, Literal, TypeVar

from pydantic import BaseModel

from app.config import get_settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
R = TypeVar("R")

MAX_ATTEMPTS = 4
EMBED_CONCURRENCY = 8

# Reasoning depth. None / "default" keep the model's own setting; "off" is an alias of "minimal".
Thinking = Literal["off", "minimal", "low", "medium", "high", "default"] | None
_LEVELS = ("minimal", "low", "medium", "high")
_BUDGETS = {"low": 1024, "medium": 4096, "high": 16384}  # Gemini 2.5 token budgets
# Models that rejected a thinking config (or just MINIMAL); later calls adapt instead of failing again.
_NO_THINKING: set[str] = set()
_NO_MINIMAL: set[str] = set()


# ---------- client ----------

@lru_cache
def _client(location: str | None = None):
    """Client for generation; pass `location` for a client pinned to another region (embeddings)."""
    from google import genai

    s = get_settings()
    if s.google_genai_use_vertexai:
        return genai.Client(vertexai=True, project=s.google_cloud_project,
                            location=location or s.google_cloud_location)
    return genai.Client(api_key=s.gemini_api_key)


def _status(exc: Exception) -> int | None:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    return code if isinstance(code, int) else None


def _is_retryable(exc: Exception) -> bool:
    code = _status(exc)
    if code is not None:
        return code == 429 or code >= 500
    return isinstance(exc, (asyncio.TimeoutError, ConnectionError, OSError))


def _level(thinking: Thinking) -> str | None:
    level = "minimal" if thinking == "off" else thinking
    return level if level in _LEVELS else None


def _effective_level(model: str, thinking: Thinking) -> str | None:
    level = _level(thinking)
    if level is None or model in _NO_THINKING:
        return None
    # MINIMAL is not offered by every Gemini 3.x model (never by Pro); LOW is the next best.
    if level == "minimal" and ("pro" in model or model in _NO_MINIMAL) and not model.startswith("gemini-2."):
        return "low"
    return level


def _drop_thinking(exc: Exception, model: str, thinking: Thinking) -> bool:
    """On a 400 about thinking settings, downgrade MINIMAL to LOW, else drop the config; allow a retry."""
    level = _effective_level(model, thinking)
    if level is None or _status(exc) != 400 or "thinking" not in str(exc).lower():
        return False
    if level == "minimal":
        log.warning("Model %s rejected thinking=minimal; retrying with low", model)
        _NO_MINIMAL.add(model)
    else:
        log.warning("Model %s rejected thinking=%s; retrying without a thinking config", model, level)
        _NO_THINKING.add(model)
    return True


def _thinking_config(model: str, thinking: Thinking):
    """Map the coarse `thinking` knob onto what each model family accepts."""
    level = _effective_level(model, thinking)
    if level is None:
        return None
    from google.genai import types

    if model.startswith("gemini-2."):
        # 2.5 uses token budgets; Pro cannot go below 128.
        budget = (128 if "pro" in model else 0) if level == "minimal" else _BUDGETS[level]
        return types.ThinkingConfig(thinking_budget=budget)
    return types.ThinkingConfig(thinking_level=types.ThinkingLevel(level.upper()))


def _backoff(attempt: int) -> float:
    return min(8.0, 0.5 * 2 ** (attempt - 1)) + random.uniform(0, 0.3)


async def _with_retry(fn: Callable[[], Awaitable[R]], what: str,
                      model: str = "", thinking: Thinking = None) -> R:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 - the SDK raises several unrelated types
            if attempt < MAX_ATTEMPTS and _drop_thinking(exc, model, thinking):
                continue
            if attempt == MAX_ATTEMPTS or not _is_retryable(exc):
                raise
            delay = _backoff(attempt)
            log.warning("%s failed (attempt %d/%d): %s; retrying in %.1fs", what, attempt, MAX_ATTEMPTS, exc, delay)
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")


def _config(*, model: str, system: str | None, temperature: float | None = None,
            schema: type[BaseModel] | None = None, thinking: Thinking = None):
    from google.genai import types

    kwargs: dict[str, Any] = {}
    thinking_cfg = _thinking_config(model, thinking)
    if thinking_cfg is not None:
        kwargs["thinking_config"] = thinking_cfg
    if system:
        kwargs["system_instruction"] = system
    if temperature is not None:
        kwargs["temperature"] = temperature
    if schema is not None:
        kwargs["response_mime_type"] = "application/json"
        kwargs["response_schema"] = schema
    return types.GenerateContentConfig(**kwargs)


# ---------- public API ----------

async def generate_json(prompt: str, schema: type[T], *, system: str | None = None,
                        model: str | None = None, temperature: float = 0.4,
                        thinking: Thinking = None) -> T:
    """Generate a structured response validated against `schema`.

    thinking: "off" / "low" trade reasoning depth for latency; "default" keeps the model's own setting.
    """
    s = get_settings()
    if s.llm_fake:
        return _fake_instance(schema)
    model = model or s.gemini_fast_model

    async def call() -> T:
        resp = await _client().aio.models.generate_content(
            model=model,
            contents=prompt,
            config=_config(model=model, system=system, temperature=temperature, schema=schema, thinking=thinking),
        )
        parsed = resp.parsed
        if isinstance(parsed, schema):
            return parsed
        text = resp.text or ""
        if not text:
            raise ValueError("Gemini returned an empty JSON response")
        return schema.model_validate_json(text)

    return await _with_retry(call, "generate_json", model, thinking)


async def generate_text(prompt: str, *, system: str | None = None, model: str | None = None,
                        thinking: Thinking = None) -> str:
    s = get_settings()
    if s.llm_fake:
        return _fake_text(prompt)
    model = model or s.gemini_fast_model

    async def call() -> str:
        resp = await _client().aio.models.generate_content(
            model=model, contents=prompt, config=_config(model=model, system=system, thinking=thinking),
        )
        return resp.text or ""

    return await _with_retry(call, "generate_text", model, thinking)


async def stream_text(prompt: str | list, *, system: str | None = None,
                      model: str | None = None, thinking: Thinking = None) -> AsyncIterator[str]:
    """Yield text chunks as they arrive. Retries only if nothing has been yielded yet."""
    s = get_settings()
    if s.llm_fake:
        last = prompt if isinstance(prompt, str) else str(prompt[-1] if prompt else "")
        for word in _fake_text(last).split(" "):
            yield word + " "
            await asyncio.sleep(0)
        return
    model = model or s.gemini_fast_model

    for attempt in range(1, MAX_ATTEMPTS + 1):
        yielded = False
        try:
            stream = await _client().aio.models.generate_content_stream(
                model=model, contents=prompt, config=_config(model=model, system=system, thinking=thinking),
            )
            async for chunk in stream:
                if chunk.text:
                    yielded = True
                    yield chunk.text
            return
        except Exception as exc:  # noqa: BLE001
            if not yielded and attempt < MAX_ATTEMPTS and _drop_thinking(exc, model, thinking):
                continue
            if yielded or attempt == MAX_ATTEMPTS or not _is_retryable(exc):
                raise
            delay = _backoff(attempt)
            log.warning("stream_text failed (attempt %d/%d): %s; retrying in %.1fs", attempt, MAX_ATTEMPTS, exc, delay)
            await asyncio.sleep(delay)


async def embed(texts: list[str], *, task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Embed texts. Use task="RETRIEVAL_DOCUMENT" for chunks and "RETRIEVAL_QUERY" for queries."""
    if not texts:
        return []
    s = get_settings()
    if s.llm_fake:
        return [_fake_vector(t, s.embed_dimensions) for t in texts]

    from google.genai import types

    cfg = types.EmbedContentConfig(task_type=task, output_dimensionality=s.embed_dimensions)
    # On Vertex AI gemini-embedding-001 takes one input per request; AI Studio accepts batches.
    batch_size = 1 if s.google_genai_use_vertexai else 100
    batches = [texts[i:i + batch_size] for i in range(0, len(texts), batch_size)]
    sem = asyncio.Semaphore(EMBED_CONCURRENCY)

    async def run(batch: list[str]) -> list[list[float]]:
        async with sem:
            async def call() -> list[list[float]]:
                resp = await _client(s.gemini_embed_location).aio.models.embed_content(
                    model=s.gemini_embed_model, contents=batch, config=cfg,
                )
                return [list(e.values or []) for e in resp.embeddings or []]
            return await _with_retry(call, "embed")

    results = await asyncio.gather(*(run(b) for b in batches))
    return [vec for batch in results for vec in batch]


# ---------- fakes (LLM_FAKE=true) ----------

def _fake_text(prompt: str) -> str:
    snippet = " ".join(str(prompt).split()[:12])
    return f"[fake gemini] Thanks for explaining. Could you tell me a bit more? (re: {snippet})"


def _fake_vector(text: str, dims: int) -> list[float]:
    """Hashed bag-of-words vector, so texts that share words score a high cosine similarity."""
    vec = [0.0] * dims
    for raw in text.lower().split():
        word = "".join(ch for ch in raw if ch.isalnum())
        if not word:
            continue
        h = int.from_bytes(hashlib.md5(word.encode()).digest()[:4], "little")
        vec[h % dims] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _fake_value(annotation: Any, name: str, depth: int) -> Any:
    origin = typing.get_origin(annotation)
    args = typing.get_args(annotation)
    if origin in (typing.Union, pytypes.UnionType):
        non_none = [a for a in args if a is not type(None)]
        return _fake_value(non_none[0], name, depth) if non_none else None
    if origin is typing.Literal:
        return args[0]
    if origin in (list, set, tuple):
        return [_fake_value(args[0], name, depth + 1)] if args and depth < 3 else []
    if origin is dict:
        return {}
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return _fake_dict(annotation, depth + 1)
    if annotation is bool:
        return True
    if annotation is int:
        return 3
    if annotation is float:
        return 0.5
    if annotation is datetime:
        return datetime.now().isoformat()
    return "fake " + name.replace("_", " ")


def _clamp(value: int, field: Any) -> int:
    for meta in field.metadata:
        lo, hi = getattr(meta, "ge", None), getattr(meta, "le", None)
        if hi is not None and hi > 5:
            value = int(hi * 0.7)  # e.g. scores 0-100 -> 70
        if lo is not None:
            value = max(value, lo)
        if hi is not None:
            value = min(value, hi)
    return value


def _fake_dict(schema: type[BaseModel], depth: int = 0) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for fname, field in schema.model_fields.items():
        if fname == "id":
            out[fname] = "" if depth == 0 else f"{fname}-{depth}"
            continue
        if not field.is_required() and depth > 2:
            continue
        value = _fake_value(field.annotation, fname, depth)
        if isinstance(value, int) and not isinstance(value, bool):
            value = _clamp(value, field)
        out[fname] = value
    return out


def _fake_instance(schema: type[T]) -> T:
    return schema.model_validate(_fake_dict(schema))

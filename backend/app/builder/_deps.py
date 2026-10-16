"""Seams to the core modules (LLM, store, KB).

Builder code calls these names through the module (``_deps.generate_json(...)``)
so tests can monkeypatch them. When a core module is not importable yet, a
minimal local fallback keeps the builder usable; the fallbacks live only here.
"""
from __future__ import annotations

import os
import re
from typing import Any

from pydantic import BaseModel

from app.schemas import Chunk, Document, SearchHit


def _setting(attr: str, env: str, default: str) -> str:
    try:
        from app.config import get_settings

        return getattr(get_settings(), attr)
    except Exception:  # config deps missing in a bare test env
        return os.getenv(env, default)


def pro_model() -> str:
    return _setting("gemini_pro_model", "GEMINI_PRO_MODEL", "gemini-2.5-pro")


def fast_model() -> str:
    return _setting("gemini_fast_model", "GEMINI_FAST_MODEL", "gemini-2.5-flash")


# Which model each builder step uses. Measured on the seed KB with thinking=low
# (2026-10-15): Flash matched Pro on structure and citation coverage and was
# 2-3x faster (docs->3 personas 12.8 s vs 25.3 s; scenario 9.2 s vs 26.0 s),
# so the builder runs on Flash to stay under the 20 s demo budget.
def persona_model() -> str:
    return fast_model()


def scenario_model() -> str:
    return fast_model()


# ---------- LLM ----------

try:
    from app.llm.gemini import generate_json as _core_generate_json
except ImportError:

    async def _core_generate_json(prompt: str, schema: type[BaseModel], *, system: str | None = None,
                                  model: str | None = None, temperature: float = 0.4,
                                  thinking: str | None = None) -> BaseModel:
        raise RuntimeError("Gemini client (app.llm.gemini) is not available")


def llm_fake() -> bool:
    return str(_setting("llm_fake", "LLM_FAKE", "false")).lower() in ("1", "true", "yes")


async def generate_json(prompt: str, schema: type[BaseModel], *, system: str | None = None,
                        model: str | None = None, temperature: float = 0.4,
                        thinking: str | None = None) -> BaseModel:
    if llm_fake():  # offline: answer builder schemas with drafts quoted from the prompt's chunks
        from app.builder import fake

        if (draft := fake.respond(prompt, schema)) is not None:
            return draft
    return await _core_generate_json(prompt, schema, system=system, model=model,
                                     temperature=temperature, thinking=thinking)


# ---------- Store ----------

try:
    from app.store import get_store  # type: ignore[assignment]
except ImportError:

    class _MemoryStore:
        def __init__(self) -> None:
            self._data: dict[str, dict[str, dict]] = {}

        async def put(self, collection: str, id: str, data: dict) -> None:
            self._data.setdefault(collection, {})[id] = dict(data)

        async def get(self, collection: str, id: str) -> dict | None:
            row = self._data.get(collection, {}).get(id)
            return dict(row) if row is not None else None

        async def list(self, collection: str, **filters: Any) -> list[dict]:
            rows = self._data.get(collection, {}).values()
            return [dict(r) for r in rows if all(r.get(k) == v for k, v in filters.items())]

        async def delete(self, collection: str, id: str) -> None:
            self._data.get(collection, {}).pop(id, None)

    _store = _MemoryStore()

    def get_store() -> Any:  # type: ignore[misc]
        return _store


# ---------- KB ----------

_WORD = re.compile(r"[\w']+", re.UNICODE)


async def _fallback_get_chunks(document_ids: list[str] | None = None, limit: int = 40) -> list[Chunk]:
    rows = await get_store().list("chunks")
    if document_ids:
        rows = [r for r in rows if r.get("document_id") in document_ids]
    rows.sort(key=lambda r: (r.get("document_id", ""), r.get("index", 0)))
    return [Chunk.model_validate(r) for r in rows[:limit]]


async def _fallback_search(query: str, k: int = 5, document_ids: list[str] | None = None) -> list[SearchHit]:
    """Keyword-overlap search, used only until app.kb.search lands."""
    terms = {w.lower() for w in _WORD.findall(query) if len(w) > 2}
    docs = {d["id"]: d.get("title", "") for d in await get_store().list("documents")}
    hits: list[SearchHit] = []
    for chunk in await _fallback_get_chunks(document_ids, limit=10_000):
        words = {w.lower() for w in _WORD.findall(chunk.text)}
        score = len(terms & words) / (len(terms) or 1)
        if score > 0:
            hits.append(SearchHit(chunk=chunk, document_title=docs.get(chunk.document_id, ""), score=score))
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:k]


try:
    from app.kb.search import get_chunks, search  # type: ignore[assignment]
except ImportError:
    get_chunks = _fallback_get_chunks  # type: ignore[assignment]
    search = _fallback_search  # type: ignore[assignment]


async def document_titles(document_ids: list[str] | None = None) -> dict[str, str]:
    rows = await get_store().list("documents")
    return {r["id"]: r.get("title", "") for r in rows if not document_ids or r["id"] in document_ids}


# ---------- Ingest (used by app.seed) ----------

def _split_markdown(text: str, max_chars: int = 900) -> list[str]:
    """Split on headings, then pack paragraphs up to max_chars."""
    sections = re.split(r"\n(?=#{1,6} )", text.strip())
    chunks: list[str] = []
    for section in sections:
        buf = ""
        for para in section.split("\n\n"):
            if buf and len(buf) + len(para) + 2 > max_chars:
                chunks.append(buf.strip())
                buf = ""
            buf += para + "\n\n"
        if buf.strip():
            chunks.append(buf.strip())
    return chunks


async def _fallback_ingest_text(title: str, text: str, *, filename: str | None = None) -> Document:
    store = get_store()
    doc_id = "doc-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40]
    parts = _split_markdown(text)
    for i, part in enumerate(parts):
        chunk = Chunk(id=f"{doc_id}-c{i:02d}", document_id=doc_id, index=i, text=part)
        await store.put("chunks", chunk.id, chunk.model_dump(mode="json"))
    doc = Document(id=doc_id, title=title, filename=filename, mime="text/markdown", chunk_count=len(parts))
    await store.put("documents", doc.id, doc.model_dump(mode="json"))
    return doc


async def ingest_text(title: str, text: str, *, filename: str | None = None) -> Document:
    try:
        from app.kb.ingest import ingest_text as core_ingest
    except ImportError:
        return await _fallback_ingest_text(title, text, filename=filename)
    try:
        result = await core_ingest(title=title, text=text, filename=filename)
    except TypeError:  # core signature without filename
        result = await core_ingest(title=title, text=text)
    return result if isinstance(result, Document) else Document.model_validate(result)


async def delete_document(document_id: str) -> None:
    try:
        from app.kb.ingest import delete_document as core_delete
    except ImportError:
        store = get_store()
        await store.delete("documents", document_id)
        for chunk in await store.list("chunks", document_id=document_id):
            await store.delete("chunks", chunk["id"])
        return
    await core_delete(document_id)

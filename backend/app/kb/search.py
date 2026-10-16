"""Semantic search over knowledge-base chunks.

Vectors are persisted in the `embeddings` collection and cached in process
memory; cosine similarity is computed in Python (the KB is small: a few
thousand chunks at most).

Latency matters because search runs on every practice turn, so three caches
keep a repeated query off the network:
- query text -> query vector (LRU), saving the embedding round trip;
- (query, document filter) -> ranked chunk ids (short TTL), so the compliance
  pre-check and the customer turn share one retrieval for the same message;
- chunk id -> Chunk and document id -> title, saving per-hit store reads.
Ingest and delete invalidate the ranked results through a generation counter.
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import OrderedDict

from app.llm.gemini import embed
from app.schemas import Chunk, SearchHit
from app.store import get_store

log = logging.getLogger(__name__)

EMBEDDINGS = "embeddings"
CACHE_TTL_SECONDS = 60.0  # other Cloud Run instances may have ingested documents
QUERY_CACHE_SIZE = 512
RESULT_CACHE_SIZE = 256
RESULT_TTL_SECONDS = 300.0
MAX_RANKED = 50  # ranked ids kept per cached query; covers any k the API allows

_vectors: dict[str, tuple[str, list[float]]] = {}  # chunk_id -> (document_id, unit vector)
_chunks: dict[str, Chunk] = {}
_titles: dict[str, str] = {}
_query_vectors: OrderedDict[str, list[float]] = OrderedDict()
_results: OrderedDict[tuple, tuple[float, int, list[tuple[float, str]]]] = OrderedDict()
_generation = 0
_loaded_at: float | None = None
_refresh_task: asyncio.Task | None = None
_lock = asyncio.Lock()


def _unit(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _invalidate_results() -> None:
    global _generation
    _generation += 1
    _results.clear()


def remember(chunk_id: str, document_id: str, vector: list[float], chunk: Chunk | None = None,
             title: str | None = None) -> None:
    """Add a freshly ingested chunk to the in-memory index."""
    _vectors[chunk_id] = (document_id, _unit(vector))
    if chunk is not None:
        _chunks[chunk_id] = chunk
    if title is not None:
        _titles[document_id] = title
    _invalidate_results()


def forget_document(document_id: str) -> None:
    for chunk_id in [cid for cid, (doc, _) in _vectors.items() if doc == document_id]:
        _vectors.pop(chunk_id, None)
        _chunks.pop(chunk_id, None)
    _titles.pop(document_id, None)
    _invalidate_results()


def reset_cache() -> None:
    global _loaded_at, _refresh_task
    _vectors.clear()
    _chunks.clear()
    _titles.clear()
    _query_vectors.clear()
    _results.clear()
    _loaded_at = None
    _refresh_task = None


async def _reload() -> None:
    global _loaded_at
    rows = await get_store().list(EMBEDDINGS)
    fresh = {row["id"]: (row["document_id"], _unit(row["vector"])) for row in rows}
    if fresh.keys() != _vectors.keys():
        for gone in _vectors.keys() - fresh.keys():
            _chunks.pop(gone, None)
        _invalidate_results()
    _vectors.clear()
    _vectors.update(fresh)
    _loaded_at = time.monotonic()


async def _background_reload() -> None:
    try:
        await _reload()
    except Exception:  # noqa: BLE001 - a failed refresh keeps serving the current index
        log.exception("Embedding cache refresh failed")


async def _ensure_loaded() -> None:
    """Block only on the first load; afterwards refresh stale data in the background."""
    global _refresh_task
    if _loaded_at is None:
        async with _lock:
            if _loaded_at is None:
                await _reload()
        return
    stale = time.monotonic() - _loaded_at >= CACHE_TTL_SECONDS
    if stale and (_refresh_task is None or _refresh_task.done()):
        _refresh_task = asyncio.create_task(_background_reload())


async def warm() -> None:
    """Load vectors and open the embedding connection ahead of the first request (startup)."""
    await _ensure_loaded()
    await _load_chunks(list(_vectors))
    await _query_vector("warm-up query")  # first call pays TLS + auth setup (~1.5 s)
    log.info("KB search index warm: %d vectors", len(_vectors))


async def _query_vector(query: str) -> list[float]:
    key = " ".join(query.split()).lower()
    cached = _query_vectors.get(key)
    if cached is not None:
        _query_vectors.move_to_end(key)
        return cached
    [vec] = await embed([query], task="RETRIEVAL_QUERY")
    vec = _unit(vec)
    _query_vectors[key] = vec
    if len(_query_vectors) > QUERY_CACHE_SIZE:
        _query_vectors.popitem(last=False)
    return vec


async def _ranked(query: str, document_ids: list[str] | None) -> list[tuple[float, str]]:
    key = (" ".join(query.split()).lower(), tuple(sorted(document_ids)) if document_ids else None)
    hit = _results.get(key)
    if hit is not None and hit[1] == _generation and time.monotonic() - hit[0] < RESULT_TTL_SECONDS:
        _results.move_to_end(key)
        return hit[2]

    wanted = set(document_ids) if document_ids else None
    candidates = [(cid, vec) for cid, (doc, vec) in _vectors.items() if wanted is None or doc in wanted]
    if not candidates:
        return []
    generation = _generation
    qvec = await _query_vector(query)
    ranked = sorted(((sum(a * b for a, b in zip(qvec, vec)), cid) for cid, vec in candidates), reverse=True)
    ranked = ranked[:MAX_RANKED]
    if generation == _generation:  # skip caching if the index changed mid-query
        _results[key] = (time.monotonic(), generation, ranked)
        if len(_results) > RESULT_CACHE_SIZE:
            _results.popitem(last=False)
    return ranked


async def _load_chunks(chunk_ids: list[str]) -> None:
    store = get_store()
    missing = [cid for cid in chunk_ids if cid not in _chunks]
    rows = await asyncio.gather(*(store.get("chunks", cid) for cid in missing))
    for cid, row in zip(missing, rows):
        if row is not None:
            _chunks[cid] = Chunk.model_validate(row)
    doc_ids = {_chunks[cid].document_id for cid in chunk_ids if cid in _chunks} - _titles.keys()
    docs = await asyncio.gather(*(store.get("documents", d) for d in doc_ids))
    for doc_id, doc in zip(doc_ids, docs):
        if doc is not None:
            _titles[doc_id] = doc.get("title", "")


async def search(query: str, k: int = 5, document_ids: list[str] | None = None) -> list[SearchHit]:
    """Return the top-k chunks by cosine similarity to `query`."""
    if not query.strip() or k <= 0:
        return []
    await _ensure_loaded()
    ranked = await _ranked(query, document_ids)
    # Fetch a few spares in case some chunks were deleted by another instance.
    window = ranked[: k + 5]
    await _load_chunks([cid for _, cid in window])

    hits: list[SearchHit] = []
    for score, cid in window:
        chunk = _chunks.get(cid)
        if chunk is None:
            continue
        hits.append(SearchHit(chunk=chunk, document_title=_titles.get(chunk.document_id, ""),
                              score=round(score, 4)))
        if len(hits) >= k:
            break
    return hits


async def get_chunks(document_ids: list[str] | None = None, limit: int = 40) -> list[Chunk]:
    """Chunks in document order, spread across documents so each one is represented."""
    store = get_store()
    if document_ids:
        rows = [r for d in document_ids for r in await store.list("chunks", document_id=d)]
    else:
        rows = await store.list("chunks")
    by_doc: dict[str, list[dict]] = {}
    for row in rows:
        by_doc.setdefault(row["document_id"], []).append(row)
    for doc_rows in by_doc.values():
        doc_rows.sort(key=lambda r: r.get("index", 0))

    # Round-robin so a long document cannot crowd out the others.
    out: list[Chunk] = []
    queues = [by_doc[d] for d in sorted(by_doc)]
    i = 0
    while len(out) < limit and any(i < len(q) for q in queues):
        for q in queues:
            if i < len(q) and len(out) < limit:
                out.append(Chunk.model_validate(q[i]))
        i += 1
    out.sort(key=lambda c: (c.document_id, c.index))
    return out

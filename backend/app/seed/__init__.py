"""Demo seed data: knowledge documents, personas and scenarios (docs/DEMO_SCRIPT.md).

Documents go through KB ingest, so they are chunked and embedded like uploads.
Personas and scenarios reference documents by a stable key and cite them by
quote; the loader resolves each quote to the chunk that contains it, so the
seed survives changes to the chunker. Loading is idempotent.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.builder import _deps
from app.builder.grounding import find_quote
from app.builder.persona import supported_targets
from app.builder.validation import persona_issues
from app.schemas import Chunk, Citation, Document, Persona, Scenario

log = logging.getLogger(__name__)

DATA = Path(__file__).parent / "data"


class SeedError(RuntimeError):
    pass


def _load_json(name: str) -> list[dict]:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


async def _ensure_documents(force: bool) -> dict[str, Document]:
    """Ingest each seed doc unless a document with the same title exists."""
    store = _deps.get_store()
    existing = {d["title"]: d for d in await store.list("documents")}
    out: dict[str, Document] = {}
    for spec in _load_json("documents.json"):
        row = existing.get(spec["title"])
        if row and force:
            await _deps.delete_document(row["id"])
            row = None
        if row:
            out[spec["key"]] = Document.model_validate(row)
            continue
        text = (DATA / "docs" / spec["file"]).read_text(encoding="utf-8")
        out[spec["key"]] = await _deps.ingest_text(spec["title"], text, filename=spec["file"])
        log.info("Ingested %s", spec["title"])
    return out


class _Resolver:
    def __init__(self, docs: dict[str, Document], chunks: dict[str, list[Chunk]]):
        self.docs = docs
        self.chunks = chunks

    def doc_ids(self, keys: list[str]) -> list[str]:
        return [self.docs[k].id for k in keys]

    def citations(self, items: list[dict], where: str, supports: str | None = None) -> list[Citation]:
        out = []
        for item in items:
            doc = self.docs[item["document"]]
            chunk = find_quote(self.chunks[doc.id], item["quote"])
            if chunk is None:
                raise SeedError(f"{where}: quote not found in '{doc.title}': {item['quote'][:80]}")
            out.append(Citation(chunk_id=chunk.id, document_title=doc.title, quote=item["quote"],
                                supports=supports or item.get("supports")))
        return out


async def load(force: bool = False) -> dict[str, int]:
    docs = await _ensure_documents(force)
    chunks = {d.id: await _deps.get_chunks([d.id], limit=1000) for d in docs.values()}
    resolve = _Resolver(docs, chunks)
    store = _deps.get_store()

    personas = 0
    for raw in _load_json("personas.json"):
        raw = dict(raw)
        raw["source_document_ids"] = resolve.doc_ids(raw.pop("source_documents", []))
        raw["citations"] = resolve.citations(raw.get("citations", []), raw["id"])
        persona = Persona.model_validate({**raw, "status": "approved", "source": "seed"})
        if issues := persona_issues(persona):
            raise SeedError(f"{persona.id}: {issues}")
        targets = supported_targets(persona)
        if bad := [c.supports for c in persona.citations if c.supports not in targets]:
            raise SeedError(f"{persona.id}: citations support unknown attributes {bad}")
        await store.put("personas", persona.id, persona.model_dump(mode="json"))
        personas += 1

    scenarios = 0
    for raw in _load_json("scenarios.json"):
        raw = dict(raw)
        sid = raw["id"]
        raw["document_ids"] = resolve.doc_ids(raw.pop("documents", []))
        for rule in raw.get("compliance_rules", []):
            rule["citations"] = resolve.citations(rule.get("citations", []), f"{sid}/{rule['id']}",
                                                  supports=f"rule:{rule['id']}")
        for item in raw.get("rubric", []):
            item["citations"] = resolve.citations(item.get("citations", []), f"{sid}/{item['id']}",
                                                  supports=f"rubric:{item['id']}")
        scenario = Scenario.model_validate(raw)
        if await store.get("personas", scenario.persona_id) is None:
            raise SeedError(f"{sid}: unknown persona {scenario.persona_id}")
        await store.put("scenarios", scenario.id, scenario.model_dump(mode="json"))
        scenarios += 1

    return {"documents": len(docs), "personas": personas, "scenarios": scenarios}

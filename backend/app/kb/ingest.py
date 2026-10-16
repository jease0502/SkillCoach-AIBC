"""Turn uploaded files or raw text into stored, embedded chunks."""
from __future__ import annotations

import asyncio
import io
import logging
import secrets
from pathlib import PurePath

from app.kb import search as kb_search
from app.kb.chunker import chunk_text
from app.llm.gemini import embed
from app.schemas import Chunk, Document
from app.store import get_store

log = logging.getLogger(__name__)

SUPPORTED = {".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown"}
MIME_TO_EXT = {"application/pdf": ".pdf", "text/plain": ".txt", "text/markdown": ".md", "text/x-markdown": ".md"}


class UnsupportedFileType(ValueError):
    pass


class EmptyDocument(ValueError):
    pass


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages)


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _resolve_ext(filename: str, mime: str | None) -> str:
    ext = PurePath(filename).suffix.lower()
    if ext in SUPPORTED:
        return ext
    base_mime = (mime or "").split(";")[0].strip().lower()
    if base_mime in MIME_TO_EXT:
        return MIME_TO_EXT[base_mime]
    raise UnsupportedFileType(f"Unsupported file type '{ext or base_mime or 'unknown'}'. Use PDF, TXT or MD.")


async def ingest_text(title: str, text: str, *, filename: str | None = None,
                      mime: str = "text/markdown") -> Document:
    """Chunk, embed and store a document. Returns the saved Document."""
    title = title.strip() or "Untitled"
    pieces = chunk_text(text)
    if not pieces:
        raise EmptyDocument("The document contains no extractable text.")

    doc = Document(id=new_id("doc"), title=title, filename=filename, mime=mime, chunk_count=len(pieces))
    chunks = [Chunk(id=f"{doc.id}-c{i:03d}", document_id=doc.id, index=i, text=t) for i, t in enumerate(pieces)]
    # Prefix the title so short chunks keep their document context in vector space.
    vectors = await embed([f"{title}\n\n{c.text}" for c in chunks], task="RETRIEVAL_DOCUMENT")

    store = get_store()
    sem = asyncio.Semaphore(16)

    async def save(chunk: Chunk, vector: list[float]) -> None:
        async with sem:
            await store.put("chunks", chunk.id, chunk.model_dump(mode="json"))
            await store.put(kb_search.EMBEDDINGS, chunk.id,
                            {"id": chunk.id, "document_id": doc.id, "vector": vector})

    await asyncio.gather(*(save(c, v) for c, v in zip(chunks, vectors)))
    # Write the document last so it never appears without its chunks.
    await store.put("documents", doc.id, doc.model_dump(mode="json"))
    for chunk, vector in zip(chunks, vectors):
        kb_search.remember(chunk.id, doc.id, vector, chunk=chunk, title=title)
    log.info("Ingested document %s (%r): %d chunks", doc.id, title, len(chunks))
    return doc


async def ingest_file(filename: str, data: bytes, mime: str | None = None) -> Document:
    """Extract text from a PDF, TXT or MD file and ingest it."""
    ext = _resolve_ext(filename, mime)
    if not data:
        raise EmptyDocument("The uploaded file is empty.")
    text = await asyncio.to_thread(_pdf_text, data) if ext == ".pdf" else _decode(data)
    title = PurePath(filename).stem.replace("_", " ").replace("-", " ").strip() or filename
    return await ingest_text(title, text, filename=filename, mime=SUPPORTED[ext])


async def list_documents() -> list[Document]:
    rows = await get_store().list("documents")
    docs = [Document.model_validate(r) for r in rows]
    return sorted(docs, key=lambda d: d.created_at, reverse=True)


async def delete_document(document_id: str) -> bool:
    store = get_store()
    if await store.get("documents", document_id) is None:
        return False
    await store.delete("documents", document_id)
    await store.delete_where("chunks", document_id=document_id)
    await store.delete_where(kb_search.EMBEDDINGS, document_id=document_id)
    kb_search.forget_document(document_id)
    return True

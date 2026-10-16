"""Knowledge-base HTTP routes (/api/kb/*)."""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from app.kb import ingest
from app.kb.search import search
from app.schemas import Document, SearchHit

router = APIRouter(prefix="/api/kb", tags=["knowledge-base"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class TextDocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str


class SearchIn(BaseModel):
    query: str
    k: int = Field(5, ge=1, le=50)


def _ingest_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ingest.UnsupportedFileType):
        return HTTPException(415, str(exc))
    return HTTPException(400, str(exc))


@router.post("/documents", response_model=Document)
async def upload_document(file: UploadFile = File(...)) -> Document:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 20 MB.")
    try:
        return await ingest.ingest_file(file.filename or "upload.txt", data, file.content_type)
    except (ingest.UnsupportedFileType, ingest.EmptyDocument) as exc:
        raise _ingest_error(exc) from exc
    except Exception as exc:  # pypdf raises assorted errors on malformed files
        if type(exc).__module__.startswith("pypdf"):
            raise HTTPException(400, f"Could not read PDF: {exc}") from exc
        raise


@router.post("/documents/text", response_model=Document)
async def create_text_document(body: TextDocumentIn) -> Document:
    try:
        return await ingest.ingest_text(body.title, body.text)
    except ingest.EmptyDocument as exc:
        raise _ingest_error(exc) from exc


@router.get("/documents", response_model=list[Document])
async def list_documents() -> list[Document]:
    return await ingest.list_documents()


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: str) -> Response:
    if not await ingest.delete_document(document_id):
        raise HTTPException(404, "Document not found.")
    return Response(status_code=204)


@router.post("/search", response_model=list[SearchHit])
async def search_kb(body: SearchIn) -> list[SearchHit]:
    return await search(body.query, k=body.k)

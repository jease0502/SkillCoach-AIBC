import pytest
from fastapi.testclient import TestClient

from app.kb import ingest, search as kb_search
from app.kb.search import get_chunks, search

REFUNDS = "Refund policy.\n\nCustomers may request a full refund within 30 days of purchase with a receipt."
SHIPPING = "Shipping guide.\n\nStandard delivery takes five business days. Express shipping costs extra."


@pytest.mark.asyncio
async def test_ingest_and_search_ranks_relevant_chunk_first():
    refunds = await ingest.ingest_text("Refunds", REFUNDS)
    shipping = await ingest.ingest_text("Shipping", SHIPPING)
    assert refunds.chunk_count == 1 and refunds.id.startswith("doc_")

    hits = await search("how many days for a refund with receipt", k=2)
    assert [h.chunk.document_id for h in hits] == [refunds.id, shipping.id]
    assert hits[0].document_title == "Refunds"
    assert hits[0].score > hits[1].score

    only_shipping = await search("refund", document_ids=[shipping.id])
    assert {h.chunk.document_id for h in only_shipping} == {shipping.id}


@pytest.mark.asyncio
async def test_search_reloads_vectors_from_store():
    doc = await ingest.ingest_text("Refunds", REFUNDS)
    kb_search.reset_cache()  # simulate a fresh Cloud Run instance
    hits = await search("refund receipt")
    assert hits and hits[0].chunk.document_id == doc.id


@pytest.mark.asyncio
async def test_search_with_fake_embed(monkeypatch):
    """Search must rank by the vectors embed() returns, whatever the model."""
    table = {"alpha": [1.0, 0.0], "beta": [0.0, 1.0]}

    async def fake_embed(texts, *, task="RETRIEVAL_DOCUMENT"):
        return [table["alpha"] if "alpha" in t else table["beta"] for t in texts]

    monkeypatch.setattr(ingest, "embed", fake_embed)
    monkeypatch.setattr(kb_search, "embed", fake_embed)
    a = await ingest.ingest_text("A", "alpha content")
    b = await ingest.ingest_text("B", "beta content")
    hits = await search("beta?", k=2)
    assert [h.chunk.document_id for h in hits] == [b.id, a.id]
    assert hits[0].score == pytest.approx(1.0)
    assert hits[1].score == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_repeated_query_uses_caches(monkeypatch, fresh_store):
    doc = await ingest.ingest_text("Refunds", REFUNDS)
    calls = []
    real_embed = kb_search.embed

    async def counting_embed(texts, *, task="RETRIEVAL_DOCUMENT"):
        calls.append(texts)
        return await real_embed(texts, task=task)

    monkeypatch.setattr(kb_search, "embed", counting_embed)
    reads = 0
    real_get = fresh_store.get

    async def counting_get(collection, id):
        nonlocal reads
        reads += 1
        return await real_get(collection, id)

    monkeypatch.setattr(fresh_store, "get", counting_get)

    first = await search("refund with receipt", k=3)
    second = await search("  Refund WITH receipt ", k=1)  # same text after normalisation, smaller k
    assert len(calls) == 1 and reads == 0  # one embedding call; chunks served from memory
    assert second[0].chunk.id == first[0].chunk.id

    # Ingesting a new document invalidates ranked results but keeps the query vector.
    other = await ingest.ingest_text("Receipts", "Keep the receipt: refund requires a receipt.")
    hits = await search("refund with receipt", k=3)
    assert len(calls) == 1
    assert {h.chunk.document_id for h in hits} == {doc.id, other.id}


@pytest.mark.asyncio
async def test_get_chunks_and_delete():
    long_text = "\n\n".join(f"Section {i}. " + "detail " * 100 for i in range(10))
    big = await ingest.ingest_text("Big", long_text)
    small = await ingest.ingest_text("Small", REFUNDS)
    chunks = await get_chunks(limit=4)
    assert len(chunks) == 4
    assert {c.document_id for c in chunks} == {big.id, small.id}  # both documents represented
    assert [c.index for c in await get_chunks([big.id], limit=3)] == [0, 1, 2]

    assert await ingest.delete_document(big.id)
    assert not await ingest.delete_document(big.id)
    assert {c.document_id for c in await get_chunks()} == {small.id}
    assert all(h.chunk.document_id == small.id for h in await search("section detail"))


@pytest.mark.asyncio
async def test_ingest_file_types():
    doc = await ingest.ingest_file("sales_playbook.md", b"# Playbook\n\nAsk open questions.")
    assert doc.title == "sales playbook" and doc.mime == "text/markdown"
    with pytest.raises(ingest.UnsupportedFileType):
        await ingest.ingest_file("deck.pptx", b"data")
    with pytest.raises(ingest.EmptyDocument):
        await ingest.ingest_file("empty.txt", b"   ")


def test_http_routes():
    from app.main import app

    client = TestClient(app)
    assert client.get("/healthz").json() == {"ok": True}

    r = client.post("/api/kb/documents/text", json={"title": "Refunds", "text": REFUNDS})
    assert r.status_code == 200, r.text
    doc_id = r.json()["id"]

    r = client.post("/api/kb/documents", files={"file": ("guide.txt", SHIPPING.encode(), "text/plain")})
    assert r.status_code == 200 and r.json()["title"] == "guide"
    assert client.post("/api/kb/documents", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415

    assert len(client.get("/api/kb/documents").json()) == 2
    hits = client.post("/api/kb/search", json={"query": "refund within 30 days", "k": 1}).json()
    assert hits[0]["chunk"]["document_id"] == doc_id

    assert client.delete(f"/api/kb/documents/{doc_id}").status_code == 204
    assert client.delete(f"/api/kb/documents/{doc_id}").status_code == 404
    assert len(client.get("/api/kb/documents").json()) == 1

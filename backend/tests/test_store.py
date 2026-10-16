import pytest

from app.store import MemoryStore


@pytest.mark.asyncio
async def test_put_get_list_delete():
    store = MemoryStore()
    await store.put("personas", "p1", {"name": "Ana", "industry": "retail"})
    await store.put("personas", "p2", {"name": "Ben", "industry": "banking"})

    assert (await store.get("personas", "p1")) == {"name": "Ana", "industry": "retail", "id": "p1"}
    assert await store.get("personas", "missing") is None
    assert len(await store.list("personas")) == 2
    assert [r["id"] for r in await store.list("personas", industry="banking")] == ["p2"]
    assert await store.list("scenarios") == []

    await store.delete("personas", "p1")
    await store.delete("personas", "p1")  # idempotent
    assert await store.get("personas", "p1") is None


@pytest.mark.asyncio
async def test_records_are_copies():
    store = MemoryStore()
    data = {"tags": ["a"]}
    await store.put("x", "1", data)
    data["tags"].append("b")
    got = await store.get("x", "1")
    got["tags"].append("c")
    assert (await store.get("x", "1"))["tags"] == ["a"]


@pytest.mark.asyncio
async def test_delete_where():
    store = MemoryStore()
    for i in range(5):
        await store.put("chunks", f"c{i}", {"document_id": "d1" if i < 3 else "d2"})
    assert await store.delete_where("chunks", document_id="d1") == 3
    assert [r["id"] for r in await store.list("chunks")] == ["c3", "c4"]

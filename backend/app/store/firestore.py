"""Firestore backend (google-cloud-firestore AsyncClient). Uses ADC on Cloud Run."""
from __future__ import annotations

from typing import Any

from app.store.base import Store

BATCH_LIMIT = 400  # Firestore allows 500 writes per batch


class FirestoreStore(Store):
    def __init__(self, project: str | None = None, database: str | None = None) -> None:
        from google.cloud import firestore

        kwargs: dict[str, Any] = {"project": project}
        if database:
            kwargs["database"] = database
        self._db = firestore.AsyncClient(**kwargs)

    async def put(self, collection: str, id: str, data: dict) -> None:
        record = dict(data)
        record.setdefault("id", id)
        await self._db.collection(collection).document(id).set(record)

    async def get(self, collection: str, id: str) -> dict | None:
        snap = await self._db.collection(collection).document(id).get()
        return snap.to_dict() if snap.exists else None

    async def list(self, collection: str, **filters: Any) -> list[dict]:
        from google.cloud.firestore_v1.base_query import FieldFilter

        query: Any = self._db.collection(collection)
        for key, value in filters.items():
            query = query.where(filter=FieldFilter(key, "==", value))
        return [snap.to_dict() async for snap in query.stream()]

    async def delete(self, collection: str, id: str) -> None:
        await self._db.collection(collection).document(id).delete()

    async def delete_where(self, collection: str, **filters: Any) -> int:
        rows = await self.list(collection, **filters)
        for start in range(0, len(rows), BATCH_LIMIT):
            batch = self._db.batch()
            for row in rows[start:start + BATCH_LIMIT]:
                batch.delete(self._db.collection(collection).document(row["id"]))
            await batch.commit()
        return len(rows)

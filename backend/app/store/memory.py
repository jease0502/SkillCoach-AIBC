"""In-process store for local development and tests. Data is lost on restart."""
from __future__ import annotations

import asyncio
import copy
from typing import Any

from app.store.base import Store


class MemoryStore(Store):
    def __init__(self) -> None:
        self._data: dict[str, dict[str, dict]] = {}
        self._lock = asyncio.Lock()

    async def put(self, collection: str, id: str, data: dict) -> None:
        record = copy.deepcopy(data)
        record.setdefault("id", id)
        async with self._lock:
            self._data.setdefault(collection, {})[id] = record

    async def get(self, collection: str, id: str) -> dict | None:
        record = self._data.get(collection, {}).get(id)
        return copy.deepcopy(record) if record is not None else None

    async def list(self, collection: str, **filters: Any) -> list[dict]:
        rows = self._data.get(collection, {}).values()
        return [copy.deepcopy(r) for r in rows if all(r.get(k) == v for k, v in filters.items())]

    async def delete(self, collection: str, id: str) -> None:
        async with self._lock:
            self._data.get(collection, {}).pop(id, None)

    def clear(self) -> None:
        self._data.clear()

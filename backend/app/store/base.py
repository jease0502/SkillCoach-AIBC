"""Repository interface shared by every storage backend.

Records are plain JSON-safe dicts (use `model.model_dump(mode="json")`).
Each record is addressed by (collection, id); `list` filters by equality.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

COLLECTIONS = ("documents", "chunks", "embeddings", "personas", "scenarios", "sessions", "reports")


class Store(ABC):
    @abstractmethod
    async def put(self, collection: str, id: str, data: dict) -> None:
        """Create or fully replace a record."""

    @abstractmethod
    async def get(self, collection: str, id: str) -> dict | None:
        """Return the record or None if it does not exist."""

    @abstractmethod
    async def list(self, collection: str, **filters: Any) -> list[dict]:
        """Return all records whose fields equal every given filter value."""

    @abstractmethod
    async def delete(self, collection: str, id: str) -> None:
        """Delete a record. Deleting a missing record is not an error."""

    async def delete_where(self, collection: str, **filters: Any) -> int:
        """Delete every record matching the filters; returns the number deleted."""
        rows = await self.list(collection, **filters)
        for row in rows:
            await self.delete(collection, row["id"])
        return len(rows)

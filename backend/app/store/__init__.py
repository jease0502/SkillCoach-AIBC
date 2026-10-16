"""Storage repository. `get_store()` returns the backend chosen by STORE_BACKEND."""
from __future__ import annotations

from app.config import get_settings
from app.store.base import Store
from app.store.memory import MemoryStore

_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        s = get_settings()
        backend = s.store_backend.lower()
        if backend == "firestore":
            from app.store.firestore import FirestoreStore

            _store = FirestoreStore(project=s.google_cloud_project, database=s.firestore_database)
        elif backend == "memory":
            _store = MemoryStore()
        else:
            raise ValueError(f"Unknown STORE_BACKEND: {s.store_backend!r} (expected 'memory' or 'firestore')")
    return _store


def set_store(store: Store | None) -> None:
    """Override the singleton (tests)."""
    global _store
    _store = store


__all__ = ["MemoryStore", "Store", "get_store", "set_store"]

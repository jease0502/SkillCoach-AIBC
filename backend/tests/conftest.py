import os

os.environ["LLM_FAKE"] = "true"
os.environ["STORE_BACKEND"] = "memory"

import pytest  # noqa: E402

from app.kb import search as kb_search  # noqa: E402
from app.store import MemoryStore, set_store  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_store():
    store = MemoryStore()
    set_store(store)
    kb_search.reset_cache()
    yield store
    set_store(None)
    kb_search.reset_cache()

"""Firebase ID token handling: optional, verified, cached."""
from __future__ import annotations

import asyncio
import time

import pytest
from fastapi import HTTPException

from app import auth


def run(coro):
    return asyncio.run(coro)


def test_no_header_means_anonymous_visitor():
    assert run(auth.optional_user(None)) is None


def test_valid_token_becomes_user_and_is_cached(monkeypatch):
    calls = []
    def fake_verify(token):
        calls.append(token)
        return {"user_id": "u1", "email": "priya@example.com", "exp": time.time() + 600,
                "firebase": {"sign_in_provider": "password"}}
    monkeypatch.setattr(auth, "_verify", fake_verify)
    auth._cache.clear()
    u = run(auth.optional_user("Bearer tok-1"))
    assert (u.uid, u.name, u.guest) == ("u1", "priya", False)
    assert run(auth.optional_user("Bearer tok-1")) == u and calls == ["tok-1"]


def test_guest_and_bad_tokens(monkeypatch):
    monkeypatch.setattr(auth, "_verify", lambda t: {"sub": "g1", "exp": time.time() + 60,
                                                   "firebase": {"sign_in_provider": "anonymous"}})
    auth._cache.clear()
    g = run(auth.optional_user("Bearer guest-token"))
    assert g.guest and g.name == "Guest"
    def boom(t):
        raise ValueError("bad signature")
    monkeypatch.setattr(auth, "_verify", boom)
    for header in ("Bearer forged", "Basic abc"):
        with pytest.raises(HTTPException) as e:
            run(auth.optional_user(header))
        assert e.value.status_code == 401

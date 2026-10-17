"""Optional sign-in with Firebase Authentication.

The app works without an account (judges and demo visitors). When the browser sends
`Authorization: Bearer <Firebase ID token>`, the token is verified against Google's
public keys and the user is attached to new practice sessions.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException

from app.config import get_settings

_cache: dict[str, tuple[float, "User"]] = {}


@dataclass(frozen=True)
class User:
    uid: str
    name: str
    email: str | None
    guest: bool


def _verify(token: str) -> dict:
    import google.auth.transport.requests
    from google.oauth2 import id_token

    return id_token.verify_firebase_token(token, google.auth.transport.requests.Request(),
                                          audience=get_settings().google_cloud_project)


def _user(claims: dict) -> User:
    provider = (claims.get("firebase") or {}).get("sign_in_provider")
    email = claims.get("email")
    name = claims.get("name") or (email.split("@")[0] if email else None) or "Guest"
    return User(uid=claims["user_id"] if "user_id" in claims else claims["sub"], name=name[:60], email=email,
                guest=provider == "anonymous")


async def optional_user(authorization: str | None = Header(default=None)) -> User | None:
    """FastAPI dependency: the signed-in user, None without a token, 401 for a bad token."""
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    hit = _cache.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        claims = await asyncio.to_thread(_verify, token)
    except Exception:  # noqa: BLE001 - expired, wrong audience, bad signature, network
        raise HTTPException(status_code=401, detail="Sign-in expired. Please sign in again.")
    user = _user(claims)
    _cache[token] = (float(claims.get("exp", time.time() + 300)), user)
    if len(_cache) > 1000:
        for k in [k for k, (exp, _) in _cache.items() if exp < time.time()]:
            _cache.pop(k, None)
    return user

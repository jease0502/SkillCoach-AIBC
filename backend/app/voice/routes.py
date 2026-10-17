"""Customer voice: Google Cloud Text-to-Speech (Chirp 3 HD voices) for the practice customer.

POST /api/tts {text, voice} -> audio/mpeg. The voice must be one of the Chirp 3 HD voices
listed below; text is capped so the endpoint cannot be used for bulk synthesis.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
from collections import OrderedDict

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import get_settings

router = APIRouter(prefix="/api", tags=["voice"])

TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
MAX_CHARS = 1200
CACHE_ITEMS = 256
VOICES = {
    # male
    "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir", "Iapetus", "Orus", "Puck",
    "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Umbriel", "Zubenelgenubi",
    # female
    "Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux", "Kore", "Laomedeia", "Leda",
    "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr",
}

_cache: OrderedDict[str, bytes] = OrderedDict()
_lock = asyncio.Lock()


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    voice: str = "Charon"
    language: str = "en-US"


def _token() -> tuple[str, bool]:
    """Access token, and whether it belongs to a user (local ADC) rather than a service account."""
    import google.auth
    import google.auth.transport.requests
    import google.oauth2.credentials

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token, isinstance(creds, google.oauth2.credentials.Credentials)


async def synthesize(text: str, voice: str, language: str = "en-US") -> bytes:
    if voice not in VOICES:
        raise HTTPException(status_code=422, detail="Unknown voice")
    if language not in ("en-US", "en-GB", "en-AU", "en-IN"):
        raise HTTPException(status_code=422, detail="Unsupported language")
    key = hashlib.sha256(f"{language}|{voice}|{text}".encode()).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    s = get_settings()
    if s.llm_fake:
        raise HTTPException(status_code=503, detail="Voice is not available in offline mode")
    token, is_user = await asyncio.to_thread(_token)
    headers = {"Authorization": f"Bearer {token}"}
    if is_user and s.google_cloud_project:
        headers["x-goog-user-project"] = s.google_cloud_project  # local ADC needs a quota project
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(TTS_URL, headers=headers, json={
            "input": {"text": text},
            "voice": {"languageCode": language, "name": f"{language}-Chirp3-HD-{voice}"},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": 1.0},
        })
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Text-to-Speech failed")
    audio = base64.b64decode(r.json()["audioContent"])
    async with _lock:
        _cache[key] = audio
        while len(_cache) > CACHE_ITEMS:
            _cache.popitem(last=False)
    return audio


@router.post("/tts")
async def tts(body: TtsRequest) -> Response:
    audio = await synthesize(body.text.strip(), body.voice, body.language)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})

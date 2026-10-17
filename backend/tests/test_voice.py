"""Customer voice endpoint: validation and caching, with the TTS call stubbed."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.voice import routes


def client(monkeypatch, calls):
    async def fake_synth(text, voice, language="en-US"):
        if voice not in routes.VOICES:
            raise routes.HTTPException(status_code=422, detail="Unknown voice")
        calls.append((text, voice))
        return b"ID3fake-mp3"
    monkeypatch.setattr(routes, "synthesize", fake_synth)
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_tts_returns_mp3(monkeypatch):
    calls = []
    r = client(monkeypatch, calls).post("/api/tts", json={"text": "Hello there.", "voice": "Kore"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg"
    assert r.content.startswith(b"ID3") and calls == [("Hello there.", "Kore")]


def test_tts_rejects_unknown_voice_and_long_text(monkeypatch):
    c = client(monkeypatch, [])
    assert c.post("/api/tts", json={"text": "Hi", "voice": "NotAVoice"}).status_code == 422
    assert c.post("/api/tts", json={"text": "x" * (routes.MAX_CHARS + 1), "voice": "Kore"}).status_code == 422
    assert c.post("/api/tts", json={"text": "", "voice": "Kore"}).status_code == 422

"""Model fallback chain, exercised against a fake google-genai client."""
import asyncio
import logging

import pytest
from pydantic import BaseModel

from app.config import Settings
from app.llm import gemini


class APIError(Exception):
    def __init__(self, code: int, message: str = "error"):
        super().__init__(f"{code} {message}")
        self.code = code


class Answer(BaseModel):
    text: str


class _Resp:
    def __init__(self, text: str):
        self.text = text
        self.parsed = None


class _Chunk:
    def __init__(self, text: str):
        self.text = text


class FakeModels:
    """`behaviour[model]` is an exception to raise, "hang", or None for success."""

    def __init__(self, behaviour: dict):
        self.behaviour = behaviour
        self.calls: list[str] = []

    async def _act(self, model: str):
        self.calls.append(model)
        b = self.behaviour.get(model)
        if b == "hang":
            await asyncio.sleep(10)
        elif isinstance(b, Exception):
            raise b

    async def generate_content(self, *, model, contents, config):
        await self._act(model)
        return _Resp('{"text": "from %s"}' % model)

    async def generate_content_stream(self, *, model, contents, config):
        await self._act(model)
        fail_mid = self.behaviour.get(model + ":mid")

        async def gen():
            yield _Chunk("")  # empty keep-alive chunk before text
            yield _Chunk(f"hello from {model}")
            if fail_mid:
                raise fail_mid
            yield _Chunk(" bye")

        return gen()


@pytest.fixture
def fake(monkeypatch):
    settings = Settings(
        LLM_FAKE=False,
        GEMINI_FAST_MODEL="argon",
        GEMINI_PRO_MODEL="argon",
        GEMINI_LITE_MODEL="lite",
        GEMINI_FAST_FALLBACKS="flash",
        GEMINI_PRO_FALLBACKS="pro31, pro25",
        GEMINI_LITE_FALLBACKS="flash",
        GEMINI_TIMEOUT_SECONDS=0.2,
        GEMINI_FIRST_CHUNK_TIMEOUT_SECONDS=0.2,
    )
    monkeypatch.setattr(gemini, "get_settings", lambda: settings)
    monkeypatch.setattr(gemini, "_backoff", lambda attempt: 0)
    gemini._cooldown_until.clear()
    gemini._NO_THINKING.clear()
    gemini._NO_MINIMAL.clear()
    models = FakeModels({})

    class Client:
        class aio:  # noqa: N801 - mirrors the SDK's attribute name
            pass

    Client.aio.models = models
    monkeypatch.setattr(gemini, "_client", lambda location=None: Client)
    yield models
    gemini._cooldown_until.clear()


def test_model_chain_resolution(fake):
    assert gemini.model_chain("fast") == ["argon", "flash"]
    assert gemini.model_chain("pro") == ["argon", "pro31", "pro25"]
    assert gemini.model_chain("lite") == ["lite", "flash"]
    assert gemini.model_chain(None) == ["argon", "flash"]
    # A concrete id shared by fast and pro merges both chains, fast fallbacks first.
    assert gemini.model_chain("argon") == ["argon", "flash", "pro31", "pro25"]
    assert gemini.model_chain("something-else") == ["something-else"]


@pytest.mark.parametrize("error", [APIError(404, "NOT_FOUND"), APIError(429, "RESOURCE_EXHAUSTED"),
                                   APIError(503, "UNAVAILABLE")])
async def test_json_falls_back_and_cools_down(fake, error, caplog):
    fake.behaviour["argon"] = error
    with caplog.at_level(logging.WARNING):
        out = await gemini.generate_json("q", Answer, model="pro")
    assert out.text == "from pro31"
    assert fake.calls == ["argon", "pro31"]
    assert "served by fallback model pro31" in caplog.text

    # Within the cooldown the failed model is skipped entirely.
    fake.calls.clear()
    out = await gemini.generate_json("q", Answer, model="pro")
    assert fake.calls == ["pro31"]


async def test_cooldown_expires(fake, monkeypatch):
    fake.behaviour["argon"] = APIError(429)
    await gemini.generate_text("q", model="fast")
    fake.behaviour.clear()
    gemini._cooldown_until["argon"] = 0  # cooldown elapsed
    fake.calls.clear()
    assert await gemini.generate_text("q", model="fast") == '{"text": "from argon"}'
    assert fake.calls == ["argon"]


async def test_timeout_falls_back(fake):
    fake.behaviour["argon"] = "hang"
    assert await gemini.generate_text("q", model="fast") == '{"text": "from flash"}'


async def test_bad_request_does_not_fall_back(fake):
    fake.behaviour["argon"] = APIError(400, "INVALID_ARGUMENT: bad prompt")
    with pytest.raises(APIError):
        await gemini.generate_text("q", model="fast")
    assert fake.calls == ["argon"]


async def test_all_models_down_retries_chain_then_raises(fake):
    for m in ("argon", "flash"):
        fake.behaviour[m] = APIError(500)
    with pytest.raises(APIError):
        await gemini.generate_text("q", model="fast")
    assert fake.calls == ["argon", "flash", "argon", "flash"]


async def test_thinking_minimal_downgrade_stays_on_same_model(fake):
    calls = []
    real = fake.generate_content

    async def picky(*, model, contents, config):
        calls.append(config.thinking_config.thinking_level.value if config.thinking_config else None)
        if config.thinking_config and config.thinking_config.thinking_level.value == "MINIMAL":
            raise APIError(400, "Thinking level is unsupported: THINKING_LEVEL_MINIMAL")
        return await real(model=model, contents=contents, config=config)

    fake.generate_content = picky
    assert await gemini.generate_text("q", model="fast", thinking="minimal") == '{"text": "from argon"}'
    assert calls == ["MINIMAL", "LOW"]


async def test_stream_falls_back_before_first_chunk(fake):
    fake.behaviour["argon"] = APIError(503)
    chunks = [c async for c in gemini.stream_text("q", model="fast")]
    assert "".join(chunks) == "hello from flash bye"


async def test_stream_first_chunk_timeout_falls_back(fake):
    fake.behaviour["argon"] = "hang"
    chunks = [c async for c in gemini.stream_text("q", model="fast")]
    assert chunks[0] == "hello from flash"


async def test_stream_error_after_first_chunk_is_raised(fake):
    fake.behaviour["argon:mid"] = APIError(500)
    got = []
    with pytest.raises(APIError):
        async for c in gemini.stream_text("q", model="fast"):
            got.append(c)
    assert got == ["hello from argon"]
    assert fake.calls == ["argon"]  # no fallback once text has been sent

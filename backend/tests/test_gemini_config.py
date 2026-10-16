import pytest

from app.llm import gemini


@pytest.fixture(autouse=True)
def clear_rejections():
    gemini._NO_THINKING.clear()
    gemini._NO_MINIMAL.clear()
    yield
    gemini._NO_THINKING.clear()
    gemini._NO_MINIMAL.clear()


def test_default_thinking_sends_no_config():
    assert gemini._thinking_config("gemini-3.8-flash", None) is None
    assert gemini._thinking_config("gemini-3.8-flash", "default") is None


@pytest.mark.parametrize(
    ("model", "thinking", "level"),
    [
        ("gemini-3.8-flash", "off", "MINIMAL"),
        ("gemini-3.8-flash", "minimal", "MINIMAL"),
        ("gemini-3.5-flash-lite", "low", "LOW"),
        ("gemini-3.1-pro-preview", "off", "LOW"),  # Pro has no MINIMAL
        ("gemini-3.1-pro-preview", "high", "HIGH"),
    ],
)
def test_gemini3_uses_levels(model, thinking, level):
    cfg = gemini._thinking_config(model, thinking)
    assert cfg.thinking_level.value == level
    assert cfg.thinking_budget is None


def test_gemini25_uses_budgets():
    assert gemini._thinking_config("gemini-2.5-flash", "off").thinking_budget == 0
    assert gemini._thinking_config("gemini-2.5-pro", "off").thinking_budget == 128
    assert gemini._thinking_config("gemini-2.5-flash", "low").thinking_budget == 1024


def test_rejected_model_drops_thinking():
    class BadRequest(Exception):
        code = 400

    err = BadRequest("thinking_level MINIMAL is not supported")
    # MINIMAL rejected -> downgrade to LOW first, then drop thinking entirely.
    assert gemini._drop_thinking(err, "m", "minimal")
    assert gemini._thinking_config("m", "minimal").thinking_level.value == "LOW"
    assert gemini._drop_thinking(err, "m", "minimal")
    assert gemini._thinking_config("m", "minimal") is None
    assert not gemini._drop_thinking(err, "m", "minimal")  # nothing left to drop
    assert not gemini._drop_thinking(BadRequest("other error"), "m2", "low")

import pytest

from app.builder.validation import (
    DIFFICULTY_PRESETS, apply_difficulty, normalize_locale, persona_issues, pii_issues, real_person_issue,
)
from app.schemas import Objection, Persona


def _persona(**kw) -> Persona:
    base = dict(name="Priya Raman", title="Owner of a 12-person bakery", summary="Runs a busy bakery.",
                objections=[Objection(id="obj-1", text="Too expensive.", trigger="when price is mentioned")],
                hidden_needs=["Worried about cash flow in winter."], opening_line="I only have a minute.")
    return Persona(**{**base, **kw})


@pytest.mark.parametrize("text, issue", [
    ("Reach me at priya@example.com", "contains an email address"),
    ("Call 0912-345-678 after six", "contains a phone number"),
    ("My number is +1 (415) 555-0137", "contains a phone number"),
    ("Card 4111 1111 1111 1111 on file", "contains a payment card number"),
    ("ID A123456789 was used", "contains a national ID number"),
    ("SSN 123-45-6789", "contains a national ID number"),
    ("See https://example.com/me", "contains a URL"),
])
def test_pii_detected(text, issue):
    assert issue in pii_issues(text)


@pytest.mark.parametrize("text", [
    "The Pro plan costs USD 49 per user per month.",
    "We offer a 99.9% uptime SLA and SOC 2 Type II.",
    "Contracts from 2020-2025 were renewed.",
    "Headphones broke on day 41, about 30% higher than last year.",
    "A 15-day free-look period applies.",
])
def test_pii_no_false_positives(text):
    assert pii_issues(text) == []


@pytest.mark.parametrize("name", ["Elon Musk", "elon  MUSK", "Dr. Jensen Huang", "Taylor Swift"])
def test_real_people_rejected(name):
    assert real_person_issue(name)


@pytest.mark.parametrize("name", ["Dana Kim", "Mr. Tan", "Alex Morgan", "Priya Raman", "Walter Whitehead",
                                  "Eleanor Vasquez", "Marcus Brodie"])
def test_fictional_names_allowed(name):
    assert real_person_issue(name) is None


@pytest.mark.parametrize("name", ["Eleanor Vance", "Marcus Brody", "Dr. Marcus Vance", "MARCUS VANCE",
                                  "sherlock holmes", "Harry Potter", "Walter  White", "Mr. Walter White"])
def test_well_known_fictional_characters_rejected(name):
    assert "fictional character" in real_person_issue(name)


def test_persona_issues_cover_name_and_pii():
    issues = persona_issues(_persona(name="Bill Gates", summary="Email bill@example.com anytime."))
    assert any("real public figure" in i for i in issues)
    assert "summary contains an email address" in issues


def test_clean_persona_has_no_issues():
    assert persona_issues(_persona()) == []


@pytest.mark.parametrize("difficulty", [1, 2, 3, 4, 5])
def test_difficulty_maps_to_trust_and_patience(difficulty):
    p = apply_difficulty(_persona(difficulty=difficulty, initial_trust=99, initial_patience=1))
    assert (p.initial_trust, p.initial_patience) == DIFFICULTY_PRESETS[difficulty]


def test_harder_personas_start_with_less_trust_and_patience():
    trust = [DIFFICULTY_PRESETS[d][0] for d in range(1, 6)]
    patience = [DIFFICULTY_PRESETS[d][1] for d in range(1, 6)]
    assert trust == sorted(trust, reverse=True) and patience == sorted(patience, reverse=True)


def test_locale_defaults_to_english():
    assert normalize_locale(None) == "en-US"
    assert normalize_locale("not a locale!") == "en-US"
    assert normalize_locale("en_GB") == "en-GB"

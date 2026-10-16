"""Persona safety and consistency checks: difficulty presets, no real people, no PII."""
from __future__ import annotations

import re
import unicodedata

from app.schemas import Persona

# difficulty -> (initial_trust, initial_patience); see docs/features/persona-builder.md 3.3
DIFFICULTY_PRESETS: dict[int, tuple[int, int]] = {
    1: (60, 80),
    2: (50, 70),
    3: (35, 60),
    4: (25, 50),
    5: (15, 40),
}

_LOCALE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")


def apply_difficulty(persona: Persona) -> Persona:
    trust, patience = DIFFICULTY_PRESETS[persona.difficulty]
    return persona.model_copy(update={"initial_trust": trust, "initial_patience": patience})


def normalize_locale(locale: str | None) -> str:
    """BCP-47 tag; English (en-US) is the default and the primary product language."""
    tag = (locale or "").strip().replace("_", "-")
    return tag if _LOCALE.match(tag) else "en-US"


# Public figures that show up in "make the customer like X" briefs. The prompt
# forbids real people; this list is a backstop, not the main defense.
_REAL_PEOPLE = {
    "elon musk", "jeff bezos", "bill gates", "mark zuckerberg", "tim cook", "satya nadella",
    "sundar pichai", "warren buffett", "oprah winfrey", "donald trump", "joe biden",
    "barack obama", "kamala harris", "taylor swift", "steve jobs", "jensen huang",
    "sam altman", "larry page", "sergey brin", "jack ma", "lisa su", "morris chang",
    "黃仁勳", "郭台銘", "張忠謀", "蔡英文", "賴清德", "馬英九", "柯文哲", "蘇炳添", "周杰倫", "蔡依林",
    "馬斯克", "比爾蓋茲", "巴菲特", "川普", "拜登",
}


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"^(mr|mrs|ms|dr|prof)\.?\s+", "", text.strip())
    return re.sub(r"\s+", " ", text)


# Well-known fictional characters (books, film, TV, games) plus names generation
# models keep reusing. A persona named like this looks unprofessional on screen.
_FICTIONAL_CHARACTERS = {
    "eleanor vance", "marcus brody", "marcus vance", "sherlock holmes", "hermione granger",
    "harry potter", "ron weasley", "walter white", "jesse pinkman", "tony stark", "bruce wayne",
    "clark kent", "peter parker", "james bond", "indiana jones", "frodo baggins", "jon snow",
    "tyrion lannister", "homer simpson", "don draper", "michael scott", "dwight schrute",
    "lara croft", "atticus finch", "jay gatsby", "elizabeth bennet", "darth vader",
    "luke skywalker", "ellen ripley", "forrest gump", "hannibal lecter", "ted lasso",
    "dana scully", "fox mulder", "leslie knope", "sarah connor", "ebenezer scrooge",
}


def real_person_issue(name: str) -> str | None:
    """Blocks names of real public figures and of well-known fictional characters."""
    folded = _fold(name)
    for real in _REAL_PEOPLE:
        if folded == real or (len(real) > 4 and real in folded):
            return f"Name '{name}' matches a real public figure; personas must be fictional."
    for character in _FICTIONAL_CHARACTERS:
        if re.search(rf"\b{re.escape(character)}\b", folded):
            return (f"Name '{name}' is a well-known fictional character; invent an ordinary, "
                    "culturally plausible name instead.")
    return None


_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_URL = re.compile(r"\b(?:https?://|www\.)\S+", re.I)
_PHONE = re.compile(r"(?<!\w)\+?\(?\d[\d\s().-]{7,}\d(?!\w)")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_TW_ID = re.compile(r"\b[A-Z][12]\d{8}\b")
_CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def pii_issues(text: str) -> list[str]:
    issues: list[str] = []
    if _EMAIL.search(text):
        issues.append("contains an email address")
    if _URL.search(text):
        issues.append("contains a URL")
    if _SSN.search(text):
        issues.append("contains a national ID number")
    if _TW_ID.search(text):
        issues.append("contains a national ID number")
    for m in _CARD.finditer(text):
        digits = re.sub(r"\D", "", m.group())
        if 13 <= len(digits) <= 19 and _luhn(digits):
            issues.append("contains a payment card number")
            break
    for m in _PHONE.finditer(text):
        if len(re.sub(r"\D", "", m.group())) >= 9:
            issues.append("contains a phone number")
            break
    return sorted(set(issues))


def _persona_texts(p: Persona) -> list[tuple[str, str]]:
    texts = [("name", p.name), ("title", p.title), ("summary", p.summary),
             ("communication_style", p.communication_style), ("opening_line", p.opening_line),
             ("industry", p.industry or "")]
    texts += [("personality", t) for t in p.personality]
    texts += [("goals", t) for t in p.goals]
    texts += [("hidden_needs", t) for t in p.hidden_needs]
    texts += [("objections", f"{o.text} {o.trigger}") for o in p.objections]
    return texts


def persona_issues(p: Persona) -> list[str]:
    """Blocking problems. An empty list means the persona may be saved."""
    issues: list[str] = []
    if not p.name.strip() or len(p.name) > 60:
        issues.append("name must be 1-60 characters")
    if (msg := real_person_issue(p.name)):
        issues.append(msg)
    for field, text in _persona_texts(p):
        for problem in pii_issues(text):
            issues.append(f"{field} {problem}")
    ids = [o.id for o in p.objections]
    if len(ids) != len(set(ids)):
        issues.append("objection ids must be unique")
    if not _LOCALE.match(p.locale):
        issues.append("locale must be a BCP-47 tag such as en-US")
    return list(dict.fromkeys(issues))

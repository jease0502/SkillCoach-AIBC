"""Format KB chunks for prompts and verify model-supplied citations against them."""
from __future__ import annotations

import re
from collections.abc import Iterable

from pydantic import BaseModel

from app.schemas import Chunk, Citation, SearchHit

MAX_QUOTE_CHARS = 300


class CitationDraft(BaseModel):
    """Model-facing citation: the server fills in document_title after verification."""

    chunk_id: str
    quote: str


class Grounding:
    """The chunks shown to the model, keyed by id, with their document titles."""

    def __init__(self, chunks: Iterable[Chunk], titles: dict[str, str]):
        self.chunks: dict[str, Chunk] = {}
        for c in chunks:
            self.chunks.setdefault(c.id, c)
        self.titles = titles
        self._norm = {cid: _normalize(c.text) for cid, c in self.chunks.items()}

    @classmethod
    def from_hits(cls, hits: Iterable[SearchHit]) -> "Grounding":
        hits = list(hits)
        return cls([h.chunk for h in hits], {h.chunk.document_id: h.document_title for h in hits})

    def __bool__(self) -> bool:
        return bool(self.chunks)

    def merge(self, other: "Grounding") -> "Grounding":
        return Grounding([*self.chunks.values(), *other.chunks.values()], {**self.titles, **other.titles})

    @property
    def document_ids(self) -> list[str]:
        return sorted({c.document_id for c in self.chunks.values()})

    def format(self, max_chars: int = 60_000) -> str:
        """Render chunks as `[chunk_id] (Document title) text` blocks."""
        out, used = [], 0
        for c in self.chunks.values():
            block = f"[{c.id}] ({self.titles.get(c.document_id, 'Untitled')})\n{c.text.strip()}"
            if used + len(block) > max_chars:
                break
            out.append(block)
            used += len(block)
        return "\n\n".join(out) if out else "(no knowledge provided)"

    def verify(self, drafts: Iterable[CitationDraft], supports: str | None = None) -> list[Citation]:
        """Keep only citations whose quote really appears in a provided chunk.

        A quote attributed to the wrong chunk id is re-attached to the chunk that
        contains it. Duplicates are dropped. `supports` tags the attribute the
        citations back, e.g. "objection:obj-1".
        """
        out: list[Citation] = []
        seen: set[tuple[str, str]] = set()
        for d in drafts:
            quote = d.quote.strip().strip('"“”').strip()
            if not quote:
                continue
            nq = _normalize(quote)
            if len(nq) < 8:
                continue
            chunk_id = d.chunk_id.strip().strip("[]")
            if chunk_id not in self.chunks or nq not in self._norm[chunk_id]:
                chunk_id = next((cid for cid, text in self._norm.items() if nq in text), "")
            if not chunk_id or (chunk_id, nq) in seen:
                continue
            seen.add((chunk_id, nq))
            chunk = self.chunks[chunk_id]
            out.append(Citation(
                chunk_id=chunk_id,
                document_title=self.titles.get(chunk.document_id, ""),
                quote=quote[:MAX_QUOTE_CHARS],
                supports=supports,
            ))
        return out


_QUOTE_MAP = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", " ": " "})


def _normalize(text: str) -> str:
    text = text.translate(_QUOTE_MAP)
    text = re.sub(r"[*_`#>]", "", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def find_quote(chunks: Iterable[Chunk], quote: str) -> Chunk | None:
    """Return the first chunk that contains `quote` (normalized match)."""
    nq = _normalize(quote)
    return next((c for c in chunks if nq in _normalize(c.text)), None)

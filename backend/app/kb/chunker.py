"""Paragraph-aware text chunking with character overlap."""
from __future__ import annotations

import re

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

_PARA_SPLIT = re.compile(r"\n\s*\n")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。！？])\s+")


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _split_long(piece: str, size: int) -> list[str]:
    """Break a paragraph longer than `size` at sentence, then word, boundaries."""
    out: list[str] = []
    buf = ""
    for sentence in _SENTENCE_SPLIT.split(piece):
        while len(sentence) > size:
            cut = sentence.rfind(" ", 0, size)
            cut = cut if cut > size // 2 else size
            head, sentence = sentence[:cut].strip(), sentence[cut:].strip()
            if buf:
                out.append(buf)
                buf = ""
            out.append(head)
        if buf and len(buf) + 1 + len(sentence) > size:
            out.append(buf)
            buf = ""
        buf = f"{buf} {sentence}".strip()
    if buf:
        out.append(buf)
    return out


def _tail(text: str, overlap: int) -> str:
    """The last ~`overlap` characters of text, starting at a word boundary."""
    if overlap <= 0 or len(text) <= overlap:
        return text if overlap > 0 else ""
    tail = text[-overlap:]
    space = tail.find(" ")
    return tail[space + 1:] if 0 <= space < overlap // 2 else tail


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into ~`size`-char chunks that prefer paragraph boundaries.

    Consecutive chunks share roughly `overlap` characters so that a fact cut at a
    boundary still appears whole in one of them.
    """
    text = _normalize(text)
    if not text:
        return []

    pieces: list[str] = []
    for para in _PARA_SPLIT.split(text):
        para = para.strip()
        if para:
            pieces.extend(_split_long(para, size - overlap) if len(para) > size - overlap else [para])

    chunks: list[str] = []
    buf = ""
    for piece in pieces:
        if buf and len(buf) + 2 + len(piece) > size:
            chunks.append(buf)
            carry = _tail(buf, min(overlap, size - len(piece) - 2))
            buf = f"{carry}\n\n{piece}" if carry else piece
        else:
            buf = f"{buf}\n\n{piece}" if buf else piece
    if buf:
        chunks.append(buf)
    return chunks

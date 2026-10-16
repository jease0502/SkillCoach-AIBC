from app.kb.chunker import CHUNK_SIZE, chunk_text


def test_empty_text_has_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("  \n\n  ") == []


def test_short_text_is_one_chunk():
    assert chunk_text("Hello world.\n\nSecond paragraph.") == ["Hello world.\n\nSecond paragraph."]


def test_chunks_respect_size_and_paragraphs():
    paras = [f"Paragraph {i}. " + "word " * 60 for i in range(20)]
    chunks = chunk_text("\n\n".join(paras))
    assert len(chunks) > 1
    assert all(len(c) <= CHUNK_SIZE for c in chunks)
    # No paragraph header is split mid-word, and every paragraph survives.
    joined = " ".join(chunks)
    for i in range(20):
        assert f"Paragraph {i}." in joined


def test_consecutive_chunks_overlap():
    text = "\n\n".join(f"Sentence number {i} about refunds and policy." for i in range(80))
    chunks = chunk_text(text, size=300, overlap=60)
    for prev, nxt in zip(chunks, chunks[1:]):
        head = nxt.split("\n\n")[0]
        assert head and head in prev


def test_very_long_paragraph_is_split():
    text = "This is a long sentence about compliance. " * 100
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert all(len(c) <= CHUNK_SIZE for c in chunks)


def test_unbroken_text_is_hard_split():
    chunks = chunk_text("x" * 3000)
    assert all(len(c) <= CHUNK_SIZE for c in chunks)
    assert sum(c.count("x") for c in chunks) >= 3000

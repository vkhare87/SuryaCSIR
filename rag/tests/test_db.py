from db import FakeDB, DocRow, MAX_INGEST_ATTEMPTS


def _seed():
    doc = DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                 mime_type="application/pdf", title="T")
    return FakeDB(docs=[doc], storage={("b", "p.pdf"): b"bytes"})


def test_claim_returns_then_none():
    db = _seed()
    first = db.claim_pending()
    assert first.id == "d1"
    assert db.status["d1"] == "processing"
    assert db.claim_pending() is None      # already claimed


def test_save_index_and_mark():
    db = _seed()
    db.claim_pending()
    db.save_index("d1", {"root": {}}, "fake", 2)
    db.mark("d1", "indexed")
    assert db.indexes["d1"]["page_count"] == 2
    assert db.status["d1"] == "indexed"


def test_download_returns_bytes():
    db = _seed()
    assert db.download("b", "p.pdf") == b"bytes"


# ---------- P5: retry / dead-letter ----------

def test_mark_failed_increments_attempts():
    db = _seed()
    db.mark("d1", "failed", "boom")
    db.mark("d1", "failed", "boom")
    assert db.attempts["d1"] == 2


def test_failed_doc_retried_under_cap():
    db = _seed()
    db.status["d1"] = "failed"
    db.attempts["d1"] = MAX_INGEST_ATTEMPTS - 1
    doc = db.claim_pending()
    assert doc is not None and doc.id == "d1"
    assert db.status["d1"] == "processing"


def test_dead_letter_at_cap():
    db = _seed()
    db.status["d1"] = "failed"
    db.attempts["d1"] = MAX_INGEST_ATTEMPTS
    assert db.claim_pending() is None
    assert db.status["d1"] == "failed"


def test_pending_claimed_before_failed():
    d1 = DocRow(id="d1", storage_bucket="b", storage_path="a.pdf",
                mime_type="application/pdf", title="A")
    d2 = DocRow(id="d2", storage_bucket="b", storage_path="b.pdf",
                mime_type="application/pdf", title="B")
    db = FakeDB(docs=[d1, d2], storage={})
    db.status["d1"] = "failed"
    assert db.claim_pending().id == "d2"


def test_indexed_success_does_not_touch_attempts():
    db = _seed()
    db.mark("d1", "indexed")
    assert db.attempts["d1"] == 0

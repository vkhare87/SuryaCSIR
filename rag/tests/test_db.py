from db import FakeDB, DocRow


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

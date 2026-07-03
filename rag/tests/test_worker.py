import fitz
from db import FakeDB, DocRow
from ocr import NullOCR
from llm import FakeLLM
from worker import run_once, process_document


def _pdf():
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((72, 72), "content here")
    data = doc.tobytes()
    doc.close()
    return data


def _db(mime="application/pdf"):
    doc = DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                 mime_type=mime, title="Report")
    return FakeDB(docs=[doc], storage={("b", "p.pdf"): _pdf()})


def test_run_once_indexes_pending_doc():
    db = _db()
    n = run_once(db, NullOCR(), FakeLLM())
    assert n == 1
    assert db.status["d1"] == "indexed"
    tree = db.indexes["d1"]["tree"]
    assert tree["root"]["title"] == "Report"
    assert len(tree["root"]["nodes"]) == 1


def test_non_pdf_is_skipped():
    db = _db(mime="image/png")
    doc = db.claim_pending()
    process_document(doc, db, NullOCR(), FakeLLM())
    assert db.status["d1"] == "skipped"


def test_failure_marks_failed():
    db = _db()
    db.storage[("b", "p.pdf")] = b"not a pdf"   # parse will raise
    doc = db.claim_pending()
    process_document(doc, db, NullOCR(), FakeLLM())
    assert db.status["d1"] == "failed"

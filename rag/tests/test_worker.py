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
    assert "content here" in db.pages["d1"][1]   # P2: source page text stored


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


def test_blank_pdf_with_null_ocr_marks_failed_not_indexed():
    doc = fitz.open()
    doc.new_page()                               # no text; NullOCR adds none
    data = doc.tobytes()
    doc.close()
    db = FakeDB(docs=[DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                             mime_type="application/pdf", title="Scan")],
                storage={("b", "p.pdf"): data})
    process_document(db.claim_pending(), db, NullOCR(), FakeLLM())
    assert db.status["d1"] == "failed"
    assert "d1" not in db.indexes


def test_checkpoint_resumes_page_summaries_after_mid_document_failure():
    doc = fitz.open()
    for i in range(3):
        p = doc.new_page()
        p.insert_text((72, 72), f"page {i + 1} content")
    data = doc.tobytes()
    doc.close()

    db = FakeDB(docs=[DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                             mime_type="application/pdf", title="ThreePage")],
                storage={("b", "p.pdf"): data})

    class FlakyLLM:
        model = "fake-v1"

        def __init__(self, fail_on_call=None):
            self.calls = 0
            self.fail_on_call = fail_on_call

        def summarize(self, text: str) -> str:
            self.calls += 1
            if self.fail_on_call and self.calls == self.fail_on_call:
                raise TimeoutError("llm timeout on page 3")
            return f"summary:{text.strip()[:20]}"

    # First attempt fails on page 3 after checkpointing pages 1 and 2
    llm1 = FlakyLLM(fail_on_call=3)
    process_document(db.claim_pending(), db, NullOCR(), llm1)
    assert db.status["d1"] == "failed"
    assert set(db.checkpoints["d1"]["summaries"].keys()) == {"1:1", "2:2"}

    # Second attempt reuses pages 1 and 2 from the checkpoint, only summarizing page 3 + root
    llm2 = FlakyLLM(fail_on_call=None)
    process_document(db.claim_pending(), db, NullOCR(), llm2)
    assert db.status["d1"] == "indexed"
    assert llm2.calls == 2  # page 3 leaf + root summary (pages 1 & 2 came from checkpoint)


def test_checkpoint_batches_every_n_leaves():
    doc = fitz.open()
    for i in range(6):
        p = doc.new_page()
        p.insert_text((72, 72), f"page {i + 1} content")
    data = doc.tobytes()
    doc.close()

    save_calls = []

    class _CountingDB(FakeDB):
        def save_checkpoint(self, document_id, model, summaries, page_count):
            save_calls.append(len(summaries))
            super().save_checkpoint(document_id, model, summaries, page_count)

    db = _CountingDB(
        docs=[DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                     mime_type="application/pdf", title="SixPage")],
        storage={("b", "p.pdf"): data},
    )
    process_document(db.claim_pending(), db, NullOCR(), FakeLLM())
    assert db.status["d1"] == "indexed"
    # Batched at CHECKPOINT_INTERVAL=5 instead of saving on every page; page 6 goes directly into save_index
    assert save_calls == [5]

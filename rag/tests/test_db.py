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


def test_stalled_processing_row_is_returned_to_the_queue():
    """A worker that dies mid-document leaves the row in 'processing' — neither
    pending nor failed, so the queue never offers it again and it is silently lost.
    Reclaiming it is what makes unattended ingestion safe to restart."""
    from db import DocRow, FakeDB
    doc = DocRow(id="d1", storage_bucket="documents", storage_path="a.pdf",
                 mime_type="application/pdf", title="A")
    db = FakeDB([doc], {"a.pdf": b"%PDF-"})

    assert db.claim_pending().id == "d1"        # worker claims it...
    assert db.status["d1"] == "processing"
    assert db.claim_pending() is None           # ...then dies: queue looks empty

    db.stale_ids.add("d1")
    assert db.requeue_stale_processing() == 1
    assert db.status["d1"] == "pending"
    assert db.claim_pending().id == "d1"        # picked up again on restart


def test_requeue_is_a_no_op_when_nothing_is_stalled():
    from db import DocRow, FakeDB
    doc = DocRow(id="d1", storage_bucket="documents", storage_path="a.pdf",
                 mime_type="application/pdf", title="A")
    db = FakeDB([doc], {"a.pdf": b"%PDF-"})
    assert db.requeue_stale_processing() == 0
    assert db.status["d1"] == "pending"


def test_requeue_uses_processing_started_at_not_created_at():
    from datetime import datetime, timedelta, timezone
    from db import DocRow, FakeDB, SupabaseDB

    now = datetime.now(timezone.utc)
    old_ts = (now - timedelta(hours=3)).isoformat()
    recent_ts = (now - timedelta(minutes=5)).isoformat()

    doc = DocRow(id="d1", storage_bucket="documents", storage_path="a.pdf",
                 mime_type="application/pdf", title="A")
    fake = FakeDB([doc], {("documents", "a.pdf"): b"%PDF-"})
    fake.created_at["d1"] = old_ts
    assert fake.claim_pending().id == "d1"
    assert fake.requeue_stale_processing(minutes=60) == 0
    assert fake.status["d1"] == "processing"

    fake.processing_started_at["d1"] = old_ts
    assert fake.requeue_stale_processing(minutes=60) == 1
    assert fake.status["d1"] == "pending"

    class _Query:
        def __init__(self, rows, updates):
            self._rows = rows
            self._updates = updates
            self._patch = None
            self._filters = {}

        def select(self, _cols):
            return self

        def update(self, patch):
            self._patch = patch
            return self

        def eq(self, col, val):
            self._filters[col] = val
            return self

        def execute(self):
            if self._patch is not None:
                self._updates.append((self._filters.copy(), self._patch.copy()))
                return type("R", (), {"data": [{"id": self._filters.get("id")}]})()
            filtered = [r for r in self._rows if r.get("ingest_status") == self._filters.get("ingest_status")]
            return type("R", (), {"data": filtered})()

    updates = []
    sb = SupabaseDB.__new__(SupabaseDB)
    rows = [
        {"id": "recent-requeue", "ingest_status": "processing",
         "created_at": old_ts, "processing_started_at": recent_ts},
        {"id": "genuinely-stale", "ingest_status": "processing",
         "created_at": old_ts, "processing_started_at": old_ts},
    ]
    sb.c = type("C", (), {"table": lambda _self, _name: _Query(rows, updates)})()

    assert sb.requeue_stale_processing(minutes=60) == 1
    assert len(updates) == 1
    assert updates[0][0]["id"] == "genuinely-stale"
    assert updates[0][1]["processing_started_at"] is None


def test_fetch_all_orders_deterministically_before_range():
    from db import _fetch_all

    rows = [{"id": f"d{i:04d}"} for i in range(5)]
    calls = []

    class _PagedQuery:
        def __init__(self):
            self._order = None
            self._start = 0
            self._end = len(rows) - 1

        def order(self, col):
            self._order = col
            return self

        def range(self, start, end):
            assert self._order == "id"
            self._start = start
            self._end = end
            calls.append((self._order, start, end))
            return self

        def execute(self):
            return type("R", (), {"data": rows[self._start:self._end + 1]})()

    fetched = _fetch_all(lambda: _PagedQuery(), order_col="id", page_size=2)
    assert [r["id"] for r in fetched] == [r["id"] for r in rows]
    assert calls == [("id", 0, 1), ("id", 2, 3), ("id", 4, 5)]


def test_requeue_batches_updates_with_in_filter_and_projects_root_summary():
    from datetime import datetime, timedelta, timezone
    from db import SupabaseDB

    old_ts = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    in_calls = []

    class _BatchQuery:
        def __init__(self, table):
            self._table = table
            self._patch = None
            self._ids = None

        def select(self, cols):
            self._cols = cols
            return self

        def update(self, patch):
            self._patch = patch
            return self

        def eq(self, *_):
            return self

        def neq(self, *_):
            return self

        def in_(self, col, vals):
            assert col == "id"
            self._ids = list(vals)
            in_calls.append(self._ids)
            return self

        def execute(self):
            if self._patch is not None:
                return type("R", (), {"data": [{"id": i} for i in (self._ids or [])]})()
            if self._table == "documents":
                return type("R", (), {"data": [
                    {"id": "d1", "created_at": old_ts, "processing_started_at": old_ts},
                    {"id": "d2", "created_at": old_ts, "processing_started_at": old_ts},
                ]})()
            return type("R", (), {"data": [
                {"document_id": "d1", "root_summary": "Summary A", "documents": {"entity_type": "proposal"}},
            ]})()

    sb = SupabaseDB.__new__(SupabaseDB)
    sb.c = type("C", (), {"table": lambda _self, name: _BatchQuery(name)})()

    assert sb.requeue_stale_processing(minutes=60) == 2
    assert in_calls == [["d1", "d2"]]
    assert sb.requeue_stale_model("new-model") == 1
    assert in_calls == [["d1", "d2"], ["d1"]]
    assert sb.fetch_index_summaries() == [{"entity_type": "proposal", "root_summary": "Summary A"}]


def test_save_pages_uses_atomic_rpc_when_supported():
    from types import SimpleNamespace
    from db import SupabaseDB

    rpc_calls = []

    class _RpcClient:
        def rpc(self, fn, args):
            rpc_calls.append((fn, args))
            return self

        def execute(self):
            return SimpleNamespace(data=None)

    sb = SupabaseDB.__new__(SupabaseDB)
    sb.c = _RpcClient()
    pages = [SimpleNamespace(index=0, text="one"), SimpleNamespace(index=1, text="two")]
    sb.save_pages("d1", pages)
    assert rpc_calls == [(
        "rag_replace_doc_pages",
        {"p_document_id": "d1", "p_pages": [{"page": 1, "text": "one"}, {"page": 2, "text": "two"}]},
    )]

import pytest
from query_service import (
    parse_bearer, read_docs, handle_query, stream_query, log_query,
    find_similar,
)
from llm import FakeLLM, NOT_FOUND, REFUSAL_TEXT
from answer import Answer


class _FakeExec:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, data, raise_on_execute=False):
        self._data = data
        self._raise = raise_on_execute

    def select(self, *_): return self
    def insert(self, row): self.inserted = row; return self
    def limit(self, *_): return self
    def eq(self, *_): return self
    def gte(self, *_): return self
    def lte(self, *_): return self
    def order(self, *_, **__): return self
    def range(self, *_): return self
    def in_(self, *_): return self

    def execute(self):
        if self._raise:
            raise RuntimeError("db down")
        return _FakeExec(self._data)


class _FakeClient:
    def __init__(self, tables=None, raise_on_execute=False):
        self._tables = tables or {}
        self._raise = raise_on_execute

    def table(self, name):
        return _FakeQuery(self._tables.get(name, []), self._raise)


def _tree(title):
    return {"root": {"title": title, "summary": "s", "nodes": [
        {"title": "Intro", "summary": f"{title} intro", "page_start": 1, "page_end": 1, "nodes": []},
    ]}}


# ---------- parse_bearer ----------

def test_parse_bearer_ok():
    assert parse_bearer("Bearer abc.def") == "abc.def"


def test_parse_bearer_missing_raises():
    with pytest.raises(ValueError):
        parse_bearer(None)


def test_parse_bearer_malformed_raises():
    with pytest.raises(ValueError):
        parse_bearer("Basic xyz")


# ---------- read_docs ----------

def test_read_docs_object_join():
    client = _FakeClient({"doc_indexes": [
        {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
    ]})
    docs = read_docs(client)
    assert docs == [{"id": "d1", "title": "A", "storage_path": "", "tree": _tree("A")}]


def test_read_docs_list_join_and_missing():
    client = _FakeClient({"doc_indexes": [
        {"document_id": "d1", "tree": _tree("A"), "documents": [{"id": "d1", "title": "A"}]},
        {"document_id": "d2", "tree": _tree("B"), "documents": None},
    ]})
    docs = read_docs(client)
    assert docs[0]["title"] == "A"
    assert docs[1] == {"id": "d2", "title": "Document", "storage_path": "", "tree": _tree("B")}


# ---------- handle_query ----------

def test_handle_query_document_mode():
    client = _FakeClient({
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
        "doc_pages": [{"page": 1, "text": "A intro page body"}],
    })
    ans = handle_query("what is in the intro", client, FakeLLM())
    assert ans.mode == "document"
    assert len(ans.citations) == 1
    assert "A intro page body" in ans.text  # answer built from page text, not summary


def test_handle_query_document_mode_no_pages_refuses():
    # Doc indexed before P2 (no doc_pages rows): refuse rather than silently
    # fall back to summaries — requeue-all backfill is the deploy step.
    client = _FakeClient({"doc_indexes": [
        {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
    ]})
    ans = handle_query("what is in the intro", client, FakeLLM())
    assert ans.text == REFUSAL_TEXT
    assert ans.citations == []


def test_handle_query_structured_mode():
    client = _FakeClient({"documents": [{"ingest_status": "indexed"}]})
    ans = handle_query("COUNT documents by status", client, FakeLLM())
    assert ans.mode == "structured"
    assert "indexed: 1" in ans.text


def test_handle_query_hybrid_merges_numbers_and_citations():
    client = _FakeClient({
        "documents": [{"ingest_status": "indexed"}],
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
        "doc_pages": [{"page": 1, "text": "A intro page body"}],
    })
    ans = handle_query("HYBRID how are documents doing", client, FakeLLM())
    assert ans.mode == "hybrid"
    assert "indexed: 1" in ans.text
    assert "A intro" in ans.text
    assert len(ans.citations) == 1


def test_handle_query_hybrid_document_refusal_keeps_structured_half():
    client = _FakeClient({"documents": [{"ingest_status": "indexed"}], "doc_indexes": []})
    ans = handle_query("HYBRID how are documents doing", client, FakeLLM())
    assert ans.mode == "hybrid"
    assert "indexed: 1" in ans.text
    assert REFUSAL_TEXT not in ans.text
    assert ans.citations == []


def test_handle_query_structured_failure_falls_back_to_documents():
    class _Client(_FakeClient):
        def table(self, name):
            if name == "documents":  # analytics read blows up; doc path must still answer
                return _FakeQuery([], raise_on_execute=True)
            return super().table(name)
    client = _Client({"doc_indexes": []})
    ans = handle_query("COUNT documents by status", client, FakeLLM())
    assert ans.mode == "document"
    assert ans.text == REFUSAL_TEXT


# ---------- history (P3) ----------

def test_handle_query_history_reaches_prompts():
    seen = {}

    class SpyLLM(FakeLLM):
        def route(self, question, catalog, examples=None):
            seen["route_q"] = question
            return super().route(question, catalog, examples)

        def answer(self, question, context):
            seen["answer_q"] = question
            return super().answer(question, context)

    client = _FakeClient({
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
        "doc_pages": [{"page": 1, "text": "A intro page body"}],
    })
    history = [{"question": "What is LWMD?", "answer": "A division working on waste."}]
    handle_query("what about its projects?", client, SpyLLM(), history=history)
    for key in ("route_q", "answer_q"):
        assert "What is LWMD?" in seen[key]
        assert "what about its projects?" in seen[key]


def test_handle_query_history_caps_turns_and_answer_length():
    from query_service import _with_history, HISTORY_MAX_TURNS
    history = [{"question": f"q{i}", "answer": "a" * 1000} for i in range(5)]
    combined = _with_history("now", history)
    assert "q0" not in combined and "q1" not in combined      # only last 3 turns
    assert sum(1 for _ in range(5) if f"q{_}" in combined) == HISTORY_MAX_TURNS
    assert "a" * 301 not in combined                           # answers truncated


def test_handle_query_no_history_unchanged():
    client = _FakeClient({
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
        "doc_pages": [{"page": 1, "text": "A intro page body"}],
    })
    ans = handle_query("what is in the intro", client, FakeLLM(), history=None)
    assert "A intro page body" in ans.text


# ---------- select_corpus (P4) ----------

def test_select_corpus_no_collections_falls_back_to_all_docs():
    from query_service import select_corpus
    client = _FakeClient({"doc_indexes": [
        {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
    ]})
    docs = select_corpus("q", client, FakeLLM())
    assert [d["id"] for d in docs] == ["d1"]


def test_select_corpus_collection_pick_sees_summaries():
    from query_service import select_corpus
    seen = {}

    class SpyLLM(FakeLLM):
        def pick(self, question, titles):
            seen["labels"] = titles
            return super().pick(question, titles)

    client = _FakeClient({
        "collection_indexes": [
            {"collection_key": "proposal", "title": "Proposals", "summary": "Project proposals."},
            {"collection_key": "meeting", "title": "Meetings", "summary": "Meeting minutes."},
        ],
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
    })
    docs = select_corpus("q", client, SpyLLM())
    assert seen["labels"] == ["Proposals — Project proposals.", "Meetings — Meeting minutes."]
    assert [d["id"] for d in docs] == ["d1"]


def test_select_corpus_empty_collection_pick_refuses():
    from query_service import select_corpus

    class NoPickLLM(FakeLLM):
        def pick(self, question, titles):
            return []

    client = _FakeClient({
        "collection_indexes": [
            {"collection_key": "proposal", "title": "Proposals", "summary": "Project proposals."},
        ],
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
    })
    assert select_corpus("q", client, NoPickLLM()) == []
    ans = handle_query("q", client, NoPickLLM())
    assert ans.text == REFUSAL_TEXT


def test_read_docs_paginates():
    from query_service import read_docs, _PAGE_SIZE

    class _PagedQuery(_FakeQuery):
        def __init__(self, pages):
            super().__init__([])
            self._pages = pages
            self._page = 0

        def range(self, start, _end):
            self._page = start // _PAGE_SIZE
            return self

        def execute(self):
            pages = self._pages
            data = pages[self._page] if self._page < len(pages) else []
            return _FakeExec(data)

    full = [{"document_id": f"d{i}", "tree": _tree("A"),
             "documents": {"id": f"d{i}", "title": "A"}} for i in range(_PAGE_SIZE)]
    tail = [{"document_id": "dx", "tree": _tree("B"),
             "documents": {"id": "dx", "title": "B"}}]

    class _PagedClient(_FakeClient):
        def table(self, name):
            return _PagedQuery([full, tail])

    docs = read_docs(_PagedClient())
    assert len(docs) == _PAGE_SIZE + 1
    assert docs[-1]["id"] == "dx"


# ---------- route few-shots (P6) ----------

def test_route_labels_reach_route_prompt():
    seen = {}

    class SpyRouteLLM(FakeLLM):
        def route(self, question, catalog, examples=None):
            seen["examples"] = examples
            return super().route(question, catalog, examples)

    client = _FakeClient({
        "route_labels": [{"question": "how many phd students", "correct_route": "structured"}],
        "doc_indexes": [],
    })
    handle_query("q", client, SpyRouteLLM())
    assert seen["examples"] == [
        {"question": "how many phd students", "correct_route": "structured"}]


def test_read_route_labels_missing_table_is_empty():
    from query_service import read_route_labels
    assert read_route_labels(_FakeClient(raise_on_execute=True)) == []


def test_route_prompt_includes_labeled_examples():
    from llm import _route_user_prompt
    prompt = _route_user_prompt(
        "q", {"fn": "desc"},
        examples=[{"question": "how many phd students", "correct_route": "structured"}])
    assert 'Q: how many phd students' in prompt
    assert '"route": "structured"' in prompt


def test_export_labels_idempotent(tmp_path):
    import sys
    sys.path.insert(0, str((__import__('pathlib').Path(__file__).parent.parent / 'eval')))
    from export_labels import export
    gold = tmp_path / "gold.jsonl"
    gold.write_text('{"question": "existing", "expected_mode": "document"}\n', encoding="utf-8")
    rows = [{"question": "existing", "correct_route": "structured"},
            {"question": "new q", "correct_route": "hybrid"}]
    assert export(rows, gold) == 1
    assert export(rows, gold) == 0
    lines = [l for l in gold.read_text(encoding="utf-8").splitlines() if l]
    assert len(lines) == 2


# ---------- stream_query (P9) ----------

def _stream_client():
    return _FakeClient({
        "doc_indexes": [
            {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
        ],
        "doc_pages": [{"page": 1, "text": "A intro page body"}],
    })


def test_stream_query_document_tokens_then_done():
    events = list(stream_query("what is in the intro", _stream_client(), FakeLLM()))
    kinds = [k for k, _ in events]
    assert kinds[-1] == "done" and "token" in kinds
    tokens = "".join(v for k, v in events if k == "token")
    answer = events[-1][1]
    assert tokens == answer.text != REFUSAL_TEXT
    assert "A intro page body" in answer.text
    assert len(answer.citations) == 1


def test_stream_query_refusal_no_citations():
    client = _FakeClient({"doc_indexes": []})
    events = list(stream_query("anything", client, FakeLLM()))
    answer = events[-1][1]
    assert answer.text == REFUSAL_TEXT
    assert answer.citations == []


def test_stream_query_not_found_stream_becomes_refusal():
    class NotFoundStreamLLM(FakeLLM):
        def answer_stream(self, question, context):
            yield "NOT_"
            yield "FOUND"

    events = list(stream_query("q", _stream_client(), NotFoundStreamLLM()))
    answer = events[-1][1]
    assert answer.text == REFUSAL_TEXT
    assert answer.citations == []
    # sentinel never leaked as tokens
    assert all(NOT_FOUND not in v for k, v in events if k == "token")


def test_stream_query_structured_single_token():
    client = _FakeClient({"documents": [{"ingest_status": "indexed"}]})
    events = list(stream_query("COUNT documents by status", client, FakeLLM()))
    assert [k for k, _ in events] == ["token", "done"]
    assert events[-1][1].mode == "structured"


# ---------- log_query ----------

def test_log_query_returns_id():
    client = _FakeClient({"query_log": [{"id": "q1"}]})
    qid = log_query(client, "q", Answer("a", "document", []))
    assert qid == "q1"


def test_log_query_swallows_failure():
    client = _FakeClient(raise_on_execute=True)
    assert log_query(client, "q", Answer("a", "document", [])) is None


# ---------- find_similar ----------

def _similar_doc_rows():
    return [{"document_id": "d1", "tree": {"root": {"nodes": [
        {"title": "Nanomaterials synthesis", "summary": "Prior work on nano synthesis.",
         "page_start": 1, "page_end": 4}]}},
        "documents": {"id": "d1", "title": "2024 Project Report",
                      "storage_path": "reports/d1/r.pdf"}}]


def test_find_similar_returns_citation_dicts():
    client = _FakeClient({"doc_indexes": _similar_doc_rows()})
    matches = find_similar("nano synthesis proposal", client, FakeLLM())
    assert matches == [{"document_id": "d1", "title": "2024 Project Report",
                        "node_title": "Nanomaterials synthesis",
                        "page_start": 1, "page_end": 4,
                        "storage_path": "reports/d1/r.pdf"}]


def test_find_similar_empty_corpus():
    client = _FakeClient({"doc_indexes": []})
    assert find_similar("anything", client, FakeLLM()) == []


def test_log_query_records_latency():
    class _InsertTable:
        payload = None
        def insert(self, payload):
            self.payload = payload
            return self
        def execute(self):
            return _FakeExec([{"id": "q1"}])

    class _InsertClient:
        def __init__(self):
            self.tbl = _InsertTable()
        def table(self, _name):
            return self.tbl

    client = _InsertClient()
    row_id = log_query(client, "q?", Answer("ans", "document", []), latency_ms=123)
    assert row_id == "q1"
    assert client.tbl.payload["latency_ms"] == 123


# ---------- decision trace (RP3/RP4) ----------

class _CaptureQuery(_FakeQuery):
    def __init__(self, data, sink):
        super().__init__(data)
        self._sink = sink

    def insert(self, row):
        self._sink.append(row)
        return self


class _CaptureClient(_FakeClient):
    """Records every insert so tests can assert on logged columns."""
    def __init__(self, tables=None):
        super().__init__(tables)
        self.inserts = []

    def table(self, name):
        return _CaptureQuery(self._tables.get(name, []), self.inserts)


def test_handle_query_structured_carries_trace():
    client = _FakeClient({"documents": [{"ingest_status": "indexed"}]})
    ans = handle_query("COUNT documents by status", client, FakeLLM())
    assert ans.trace["route"] == "structured"
    assert ans.trace["function"] == "count_documents_by_status"
    assert "fallback" not in ans.trace


def test_handle_query_fallback_marks_trace():
    class _Client(_FakeClient):
        def table(self, name):
            if name == "documents":  # analytics read blows up -> document fallback
                return _FakeQuery([], raise_on_execute=True)
            return super().table(name)
    ans = handle_query("COUNT documents by status", _Client({"doc_indexes": []}), FakeLLM())
    assert ans.trace["route"] == "structured"
    assert ans.trace["fallback"] is True


def test_log_query_writes_trace_and_version():
    from query_service import CATALOG_VERSION
    client = _CaptureClient({"query_log": [{"id": "q1"}]})
    ans = Answer("42 projects.", "structured", [])
    ans.trace = {"route": "structured", "function": "count_projects_by_status",
                 "params": {"status": "Ongoing"}}
    log_query(client, "q", ans, latency_ms=5)
    row = client.inserts[0]
    assert row["route"] == "structured"
    assert row["function_name"] == "count_projects_by_status"
    assert row["function_params"] == {"status": "Ongoing"}
    assert row["refusal_reason"] is None
    assert row["catalog_version"] == CATALOG_VERSION


def test_log_query_records_refusal_reason():
    client = _CaptureClient({"query_log": [{"id": "q1"}]})
    log_query(client, "q", Answer(REFUSAL_TEXT, "document", []))
    assert client.inserts[0]["refusal_reason"] == "no_grounded_answer"

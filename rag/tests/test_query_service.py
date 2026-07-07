import pytest
from query_service import (
    parse_bearer, read_docs, handle_query, log_query,
    find_similar,
)
from llm import FakeLLM, REFUSAL_TEXT
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
    client = _FakeClient({"doc_indexes": [
        {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
    ]})
    ans = handle_query("what is in the intro", client, FakeLLM())
    assert ans.mode == "document"
    assert len(ans.citations) == 1


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

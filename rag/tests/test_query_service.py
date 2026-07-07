import pytest
from query_service import (
    parse_bearer, read_docs, answer_for_structured, handle_query, log_query,
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


# ---------- answer_for_structured ----------

def test_structured_non_whitelisted_falls_back_to_documents():
    # FakeLLM.summarize returns plain text (not JSON) -> no function -> document path.
    client = _FakeClient({"doc_indexes": []})
    ans = answer_for_structured("COUNT bogus things", client, FakeLLM())
    assert ans.mode == "document"
    assert ans.text == REFUSAL_TEXT  # empty corpus -> refusal


def test_structured_whitelisted_runs():
    class ProposingLLM(FakeLLM):
        def summarize(self, text):
            return '{"function": "count_documents_by_status", "params": {}}'
    client = _FakeClient({"documents": [{"ingest_status": "indexed"}]})
    ans = answer_for_structured("COUNT documents by status", client, ProposingLLM())
    assert ans.mode == "structured"
    assert "indexed: 1" in ans.text


# ---------- handle_query ----------

def test_handle_query_document_mode():
    client = _FakeClient({"doc_indexes": [
        {"document_id": "d1", "tree": _tree("A"), "documents": {"id": "d1", "title": "A"}},
    ]})
    ans = handle_query("what is in the intro", client, FakeLLM())
    assert ans.mode == "document"
    assert len(ans.citations) == 1


def test_handle_query_structured_mode_dispatches():
    # 'COUNT...' -> structured; FakeLLM proposal isn't JSON -> falls back to documents.
    client = _FakeClient({"doc_indexes": []})
    ans = handle_query("COUNT anything", client, FakeLLM())
    assert ans.mode == "document"


# ---------- log_query ----------

def test_log_query_returns_id():
    client = _FakeClient({"query_log": [{"id": "q1"}]})
    qid = log_query(client, "q", Answer("a", "document", []))
    assert qid == "q1"


def test_log_query_swallows_failure():
    client = _FakeClient(raise_on_execute=True)
    assert log_query(client, "q", Answer("a", "document", [])) is None

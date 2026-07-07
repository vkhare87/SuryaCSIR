from retrieval import traverse
from llm import FakeLLM, NOT_FOUND, REFUSAL_TEXT


def _doc(doc_id, title):
    return {
        "id": doc_id,
        "title": title,
        "tree": {"root": {"title": title, "summary": "s", "nodes": [
            {"title": "Intro", "summary": f"{title} intro", "page_start": 1, "page_end": 1, "nodes": []},
        ]}},
    }


def test_traverse_returns_answer_and_one_citation():
    docs = [_doc("d1", "Report A"), _doc("d2", "Report B")]
    ans = traverse(docs, "what is in the intro", FakeLLM())
    assert ans.mode == "document"
    assert len(ans.citations) == 1          # FakeLLM.pick -> [0]
    assert ans.citations[0].document_id == "d1"
    assert ans.citations[0].page_start == 1
    assert ans.text != ""


def test_traverse_empty_docs_refuses():
    ans = traverse([], "anything", FakeLLM())
    assert ans.citations == []
    assert ans.text == REFUSAL_TEXT


def test_traverse_no_picks_refuses():
    class NoPickLLM(FakeLLM):
        def pick(self, question, titles):
            return []
    ans = traverse([_doc("d1", "Report A")], "irrelevant question", NoPickLLM())
    assert ans.text == REFUSAL_TEXT
    assert ans.citations == []


def test_traverse_not_found_refuses():
    class NotFoundLLM(FakeLLM):
        def answer(self, question, context):
            return NOT_FOUND
    ans = traverse([_doc("d1", "Report A")], "question", NotFoundLLM())
    assert ans.text == REFUSAL_TEXT
    assert ans.citations == []


def test_traverse_blank_context_refuses():
    doc = {
        "id": "d1", "title": "Report A",
        "tree": {"root": {"title": "Report A", "summary": "", "nodes": [
            {"title": "Intro", "summary": "", "page_start": 1, "page_end": 1, "nodes": []},
        ]}},
    }
    ans = traverse([doc], "question", FakeLLM())
    assert ans.text == REFUSAL_TEXT
    assert ans.citations == []


def test_citation_carries_storage_path():
    docs = [{"id": "d1", "title": "Annual Report", "storage_path": "reports/d1/annual.pdf",
             "tree": {"root": {"nodes": [{"title": "Outcomes", "summary": "Great outcomes.",
                                          "page_start": 3, "page_end": 5}]}}}]
    ans = traverse(docs, "What outcomes?", FakeLLM())
    assert ans.citations[0].storage_path == "reports/d1/annual.pdf"


def test_citation_storage_path_defaults_empty():
    docs = [{"id": "d1", "title": "Annual Report",
             "tree": {"root": {"nodes": [{"title": "Outcomes", "summary": "Great outcomes.",
                                          "page_start": 3, "page_end": 5}]}}}]
    ans = traverse(docs, "What outcomes?", FakeLLM())
    assert ans.citations[0].storage_path == ""

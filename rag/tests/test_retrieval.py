from retrieval import traverse
from llm import FakeLLM


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


def test_traverse_empty_docs():
    ans = traverse([], "anything", FakeLLM())
    assert ans.citations == []
    assert "No documents" in ans.text

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


# ---------- select_docs (two-stage traversal) ----------

def test_select_docs_passthrough_small_corpus():
    from retrieval import select_docs
    docs = [_doc(f"d{i}", f"Doc {i}") for i in range(3)]
    assert select_docs(docs, "q", FakeLLM()) == docs


def test_select_docs_narrows_large_corpus():
    from retrieval import select_docs
    docs = [_doc(f"d{i}", f"Doc {i}") for i in range(20)]
    assert select_docs(docs, "q", FakeLLM()) == [docs[0]]  # FakeLLM.pick -> [0]


def test_select_docs_empty_picks_refuse():
    from retrieval import select_docs

    class NonePicker(FakeLLM):
        def pick(self, question, titles):
            return []

    docs = [_doc(f"d{i}", f"Doc {i}") for i in range(20)]
    assert select_docs(docs, "q", NonePicker()) == []
    assert traverse(docs, "q", NonePicker()).text == REFUSAL_TEXT


def test_traverse_large_corpus_stays_grounded():
    docs = [_doc(f"d{i}", f"Doc {i}") for i in range(20)]
    ans = traverse(docs, "q", FakeLLM())
    assert ans.citations
    assert ans.citations[0].document_id == "d0"


# ---------- P1: recursive descent over nested trees ----------

def _nested_doc(doc_id="d1", title="Report N"):
    return {
        "id": doc_id, "title": title,
        "tree": {"tree_version": 2, "root": {"title": title, "summary": "s", "nodes": [
            {"title": "Chapter 1", "summary": "ch1", "page_start": 1, "page_end": 10, "nodes": [
                {"title": "Section 1.1", "summary": "s11 detail", "page_start": 1, "page_end": 4, "nodes": []},
                {"title": "Section 1.2", "summary": "s12 detail", "page_start": 5, "page_end": 10, "nodes": []},
            ]},
            {"title": "Chapter 2", "summary": "ch2", "page_start": 11, "page_end": 20, "nodes": []},
        ]}},
    }


def test_descend_cites_leaf_page_range():
    ans = traverse([_nested_doc()], "q", FakeLLM())     # pick -> [0] at each level
    assert len(ans.citations) == 1
    c = ans.citations[0]
    assert c.node_title == "Section 1.1"
    assert (c.page_start, c.page_end) == (1, 4)          # leaf range, not chapter range


def test_descend_child_level_no_pick_refuses():
    class ChildNoPickLLM(FakeLLM):
        def pick(self, question, titles):
            return [0] if any("Chapter" in t for t in titles) else []
    ans = traverse([_nested_doc()], "q", ChildNoPickLLM())
    assert ans.text == REFUSAL_TEXT
    assert ans.citations == []


def test_descend_v1_flat_tree_unchanged():
    ans = traverse([_doc("d1", "Report A")], "q", FakeLLM())  # no tree_version, empty children
    assert ans.citations[0].node_title == "Intro"


# ---------- P2: answer from source page text ----------

def test_fetch_texts_answer_uses_page_text_not_summary():
    seen_spans = []

    def fetch_texts(spans):
        seen_spans.extend(spans)
        return ["actual page one text"]

    ans = traverse([_doc("d1", "Report A")], "q", FakeLLM(), fetch_texts=fetch_texts)
    assert ans.text.startswith("actual page one text")   # FakeLLM echoes first context line
    assert seen_spans == [("d1", 1, 1)]
    assert ans.citations[0].node_title == "Intro"


def test_fetch_texts_all_blank_refuses():
    ans = traverse([_doc("d1", "Report A")], "q", FakeLLM(), fetch_texts=lambda spans: ["  "])
    assert ans.text == REFUSAL_TEXT
    assert ans.citations == []


def test_context_budget_truncates_per_node():
    from retrieval import _context, CONTEXT_BUDGET

    node = {"title": "N", "summary": "s", "page_start": 1, "page_end": 2, "nodes": []}
    picked = [("d1", "T", "", node), ("d2", "T", "", node)]
    long = "x" * CONTEXT_BUDGET
    ctx = _context(picked, lambda spans: [long, long])
    # 2 picked nodes -> each capped at half the budget (+1 join newline)
    assert len(ctx) == CONTEXT_BUDGET + 1
    assert ctx.count("\n") == 1

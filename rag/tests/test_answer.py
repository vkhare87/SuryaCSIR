from answer import Answer, Citation


def test_answer_holds_citations():
    c = Citation(document_id="d1", title="Report", node_title="Intro",
                 page_start=1, page_end=2)
    a = Answer("hello", "document", [c])
    assert a.mode == "document"
    assert a.citations[0].document_id == "d1"
    assert a.citations[0].page_end == 2


def test_answer_defaults_empty_citations():
    assert Answer("x", "structured").citations == []

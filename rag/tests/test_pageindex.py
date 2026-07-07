from parse import ParsedDoc, Page
from pageindex import build_tree


class EchoLLM:
    model = "fake"

    def summarize(self, text: str) -> str:
        return text[:40]


def _pages(n):
    return [Page(index=i, text=f"page {i+1} body", needs_ocr=False) for i in range(n)]


def test_flat_tree_one_node_per_page():
    parsed = ParsedDoc(pages=_pages(3), toc=[])
    tree = build_tree(parsed, EchoLLM(), "Doc A")
    root = tree["root"]
    assert root["title"] == "Doc A"
    assert len(root["nodes"]) == 3
    assert root["nodes"][0]["page_start"] == 1
    assert root["nodes"][0]["page_end"] == 1
    assert root["nodes"][2]["page_start"] == 3


def test_toc_tree_uses_page_ranges():
    parsed = ParsedDoc(
        pages=_pages(5),
        toc=[(1, "Intro", 1), (1, "Methods", 3)],
    )
    tree = build_tree(parsed, EchoLLM(), "Doc B")
    nodes = tree["root"]["nodes"]
    assert [n["title"] for n in nodes] == ["Intro", "Methods"]
    assert nodes[0]["page_start"] == 1 and nodes[0]["page_end"] == 2
    assert nodes[1]["page_start"] == 3 and nodes[1]["page_end"] == 5


def test_tree_is_empty_all_blank_summaries():
    from pageindex import tree_is_empty
    tree = {"root": {"title": "T", "summary": "", "nodes": [
        {"title": "Page 1", "summary": "", "page_start": 1, "page_end": 1, "nodes": []},
        {"title": "Page 2", "summary": "  ", "page_start": 2, "page_end": 2, "nodes": []},
    ]}}
    assert tree_is_empty(tree)


def test_tree_is_empty_false_when_any_summary():
    from pageindex import tree_is_empty
    tree = {"root": {"title": "T", "summary": "s", "nodes": [
        {"title": "Page 1", "summary": "real text", "page_start": 1, "page_end": 1, "nodes": []},
    ]}}
    assert not tree_is_empty(tree)


def test_tree_is_empty_no_nodes():
    from pageindex import tree_is_empty
    assert tree_is_empty({"root": {"title": "T", "summary": "", "nodes": []}})

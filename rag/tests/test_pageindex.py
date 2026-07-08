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


# ---------- P1: multi-level trees ----------

def test_tree_version_present_toc_and_flat():
    from pageindex import TREE_VERSION
    flat = build_tree(ParsedDoc(pages=_pages(2), toc=[]), EchoLLM(), "F")
    toc = build_tree(ParsedDoc(pages=_pages(2), toc=[(1, "A", 1)]), EchoLLM(), "T")
    assert flat["tree_version"] == TREE_VERSION
    assert toc["tree_version"] == TREE_VERSION


def test_nested_toc_builds_children_with_page_ranges():
    parsed = ParsedDoc(
        pages=_pages(10),
        toc=[(1, "Intro", 1), (2, "Background", 2), (2, "Scope", 4),
             (1, "Methods", 6), (2, "Sampling", 7)],
    )
    tree = build_tree(parsed, EchoLLM(), "Doc N")
    top = tree["root"]["nodes"]
    assert [n["title"] for n in top] == ["Intro", "Methods"]
    intro, methods = top
    assert intro["page_start"] == 1 and intro["page_end"] == 5
    assert [c["title"] for c in intro["nodes"]] == ["Background", "Scope"]
    assert intro["nodes"][0]["page_end"] == 3          # next sibling page - 1
    assert intro["nodes"][1]["page_end"] == 5          # parent's end
    assert methods["page_end"] == 10
    assert methods["nodes"][0]["page_end"] == 10       # last leaf ends at last page


def test_toc_entries_deeper_than_max_depth_dropped():
    parsed = ParsedDoc(
        pages=_pages(6),
        toc=[(1, "A", 1), (2, "A1", 2), (3, "A1a", 3), (4, "too deep", 4)],
    )
    tree = build_tree(parsed, EchoLLM(), "Doc D")
    a1 = tree["root"]["nodes"][0]["nodes"][0]
    assert [c["title"] for c in a1["nodes"]] == ["A1a"]
    assert a1["nodes"][0]["nodes"] == []


def test_bottom_up_summaries_parent_from_children():
    parsed = ParsedDoc(
        pages=_pages(4),
        toc=[(1, "A", 1), (2, "A1", 1), (2, "A2", 3)],
    )
    tree = build_tree(parsed, EchoLLM(), "Doc S")
    a = tree["root"]["nodes"][0]
    a1, a2 = a["nodes"]
    assert a1["summary"].startswith("page 1 body")       # leaf: page text
    assert a2["summary"].startswith("page 3 body")
    assert a["summary"].startswith(a1["summary"][:10])   # parent: joined child summaries


def test_fanout_capped_into_group_nodes():
    from pageindex import MAX_FANOUT
    toc = [(1, f"S{i}", i + 1) for i in range(25)]
    parsed = ParsedDoc(pages=_pages(25), toc=toc)
    tree = build_tree(parsed, EchoLLM(), "Doc G")
    top = tree["root"]["nodes"]
    assert len(top) == 3                                  # 25 -> 10 + 10 + 5
    assert all(len(g["nodes"]) <= MAX_FANOUT for g in top)
    g0 = top[0]
    assert g0["title"] == "S0 … S9"
    assert g0["page_start"] == 1 and g0["page_end"] == 10
    assert g0["nodes"][0]["title"] == "S0"

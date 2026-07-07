def _page_text(parsed, start_1, end_1):
    return "\n".join(p.text for p in parsed.pages if start_1 <= p.index + 1 <= end_1)


def _flat_nodes(parsed, llm):
    nodes = []
    for p in parsed.pages:
        n = p.index + 1
        nodes.append({
            "title": f"Page {n}",
            "summary": llm.summarize(p.text),
            "page_start": n, "page_end": n, "nodes": [],
        })
    return nodes


def _toc_nodes(parsed, llm):
    top = [(title, pg) for lvl, title, pg in parsed.toc if lvl == 1]
    last_page = len(parsed.pages)
    nodes = []
    for i, (title, pg) in enumerate(top):
        end = (top[i + 1][1] - 1) if i + 1 < len(top) else last_page
        nodes.append({
            "title": title,
            "summary": llm.summarize(_page_text(parsed, pg, end)),
            "page_start": pg, "page_end": end, "nodes": [],
        })
    return nodes


def build_tree(parsed, llm, doc_title: str) -> dict:
    top_level = [t for t in parsed.toc if t[0] == 1]
    nodes = _toc_nodes(parsed, llm) if top_level else _flat_nodes(parsed, llm)
    root_summary = llm.summarize("\n".join(n["summary"] for n in nodes))
    return {"root": {"title": doc_title, "summary": root_summary, "nodes": nodes}}


def tree_is_empty(tree: dict) -> bool:
    """True when no node carries any summary text — e.g. a scanned PDF parsed with
    OCR disabled. Such a tree can never answer a query; indexing it would only
    hide the problem."""
    nodes = ((tree.get("root") or {}).get("nodes")) or []
    return not any((n.get("summary") or "").strip() for n in nodes)

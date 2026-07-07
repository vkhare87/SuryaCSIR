TREE_VERSION = 2
MAX_DEPTH = 3
MAX_FANOUT = 10


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


def _nest_toc(toc, last_page):
    """Nest (level, title, page) TOC entries into a tree, levels 1..MAX_DEPTH.
    page_end = next same-or-shallower entry's page - 1, else parent's end, else last page."""
    entries = [(lvl, title, pg) for lvl, title, pg in toc if 1 <= lvl <= MAX_DEPTH]
    roots = []
    stack = []  # (level, node)
    for i, (lvl, title, pg) in enumerate(entries):
        end = last_page
        for nlvl, _, npg in entries[i + 1:]:
            if nlvl <= lvl:
                end = max(npg - 1, pg)
                break
        node = {"title": title, "summary": "", "page_start": pg, "page_end": end, "nodes": []}
        while stack and stack[-1][0] >= lvl:
            stack.pop()
        if stack:
            stack[-1][1]["nodes"].append(node)
        else:
            roots.append(node)
        stack.append((lvl, node))
    _cap_fanout(roots, depth=1)
    return roots


def _cap_fanout(nodes, depth):
    """Chunk >MAX_FANOUT children into contiguous group nodes so each pick prompt
    stays bounded. Skipped at MAX_DEPTH — grouping there would exceed the depth cap."""
    for node in nodes:
        _cap_fanout(node["nodes"], depth + 1)
    if len(nodes) > MAX_FANOUT and depth < MAX_DEPTH:
        groups = []
        for i in range(0, len(nodes), MAX_FANOUT):
            chunk = nodes[i:i + MAX_FANOUT]
            groups.append({
                "title": f"{chunk[0]['title']} … {chunk[-1]['title']}",
                "summary": "",
                "page_start": chunk[0]["page_start"], "page_end": chunk[-1]["page_end"],
                "nodes": chunk,
            })
        nodes[:] = groups


def _summarize_bottom_up(node, parsed, llm):
    """Post-order: leaves summarize their page text, parents summarize child summaries."""
    if node["nodes"]:
        for child in node["nodes"]:
            _summarize_bottom_up(child, parsed, llm)
        node["summary"] = llm.summarize("\n".join(c["summary"] for c in node["nodes"]))
    else:
        node["summary"] = llm.summarize(_page_text(parsed, node["page_start"], node["page_end"]))


def build_tree(parsed, llm, doc_title: str) -> dict:
    top_level = [t for t in parsed.toc if t[0] == 1]
    if top_level:
        nodes = _nest_toc(parsed.toc, len(parsed.pages))
        for n in nodes:
            _summarize_bottom_up(n, parsed, llm)
    else:
        nodes = _flat_nodes(parsed, llm)
    root_summary = llm.summarize("\n".join(n["summary"] for n in nodes))
    return {"tree_version": TREE_VERSION,
            "root": {"title": doc_title, "summary": root_summary, "nodes": nodes}}


def tree_is_empty(tree: dict) -> bool:
    """True when no node carries any summary text — e.g. a scanned PDF parsed with
    OCR disabled. Such a tree can never answer a query; indexing it would only
    hide the problem. Bottom-up summaries propagate any leaf text to its level-1
    ancestor, so checking the first level stays sound for nested trees."""
    nodes = ((tree.get("root") or {}).get("nodes")) or []
    return not any((n.get("summary") or "").strip() for n in nodes)

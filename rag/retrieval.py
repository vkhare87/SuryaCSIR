from answer import Answer, Citation


def _flatten(docs):
    """docs: [{'id','title','tree'}] -> [(doc_id, doc_title, node)] over top-level nodes."""
    candidates = []
    for d in docs:
        root = (d.get("tree") or {}).get("root") or {}
        for node in root.get("nodes", []):
            candidates.append((d["id"], d["title"], node))
    return candidates


def traverse(docs, question: str, llm) -> Answer:
    candidates = _flatten(docs)
    if not candidates:
        return Answer("No documents available to answer this.", "document", [])

    titles = [f"{title} — {node['title']}" for _, title, node in candidates]
    picks = llm.pick(question, titles)

    context = "\n".join(candidates[i][2].get("summary", "") for i in picks)
    text = llm.summarize(context) if context else "No relevant sections found."

    citations = []
    for i in picks:
        doc_id, doc_title, node = candidates[i]
        citations.append(Citation(
            document_id=doc_id, title=doc_title, node_title=node["title"],
            page_start=node["page_start"], page_end=node["page_end"],
        ))
    return Answer(text, "document", citations)

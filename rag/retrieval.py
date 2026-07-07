from answer import Answer, Citation
from llm import NOT_FOUND, REFUSAL_TEXT


def _refusal() -> Answer:
    return Answer(REFUSAL_TEXT, "document", [])


def flatten(docs):
    """docs: [{'id','title','storage_path','tree'}] -> [(doc_id, doc_title, storage_path, node)]."""
    candidates = []
    for d in docs:
        root = (d.get("tree") or {}).get("root") or {}
        for node in root.get("nodes", []):
            candidates.append((d["id"], d["title"], d.get("storage_path", ""), node))
    return candidates


# Above this corpus size, pick documents before sections so the section-pick prompt
# stays bounded instead of listing every section of every document.
MAX_DOCS_FLAT = 8


def select_docs(docs, question: str, llm, max_docs: int = MAX_DOCS_FLAT):
    """Stage-1 document-level pick over root titles + summaries. Small corpora pass
    through untouched. Empty picks -> [] so traverse refuses (grounding invariant).
    ponytail: two stages (document -> section); add a collection stage if corpora
    outgrow a single doc-level prompt."""
    if len(docs) <= max_docs:
        return docs
    labels = [f"{d['title']} — {((d.get('tree') or {}).get('root') or {}).get('summary', '')}"
              for d in docs]
    picks = llm.pick(question, labels)
    return [docs[i] for i in picks[:max_docs]]


def descend(candidates, question: str, llm):
    """Recursive per-level pick over (doc_id, doc_title, storage_path, node) tuples.
    Picked nodes with children recurse; without children they are leaf results.
    Empty pick at a level drops that subtree — grounding is enforced by the caller's
    empty-final-set check, since a picked leaf is grounded regardless of siblings."""
    if not candidates:
        return []
    titles = [f"{title} — {node['title']}" for _, title, _, node in candidates]
    picks = llm.pick(question, titles)
    leaves, next_level = [], []
    for i in picks:
        doc_id, title, path, node = candidates[i]
        kids = node.get("nodes") or []
        if kids:
            next_level.extend((doc_id, title, path, k) for k in kids)
        else:
            leaves.append(candidates[i])
    return leaves + descend(next_level, question, llm)


def traverse(docs, question: str, llm) -> Answer:
    """Grounding invariant: every non-refusal answer cites the nodes it was built from;
    no relevant nodes / empty context / model NOT_FOUND all yield the refusal answer."""
    picked = descend(flatten(select_docs(docs, question, llm)), question, llm)
    if not picked:
        return _refusal()

    context = "\n".join(node.get("summary", "") for _, _, _, node in picked)
    if not context.strip():
        return _refusal()

    text = llm.answer(question, context)
    if not text or text.strip() == NOT_FOUND:
        return _refusal()

    citations = []
    for doc_id, doc_title, storage_path, node in picked:
        citations.append(Citation(
            document_id=doc_id, title=doc_title, node_title=node["title"],
            page_start=node["page_start"], page_end=node["page_end"],
            storage_path=storage_path,
        ))
    if not citations:  # belt-and-braces: non-refusal text must carry citations
        return _refusal()
    return Answer(text, "document", citations)

import re

from answer import Answer, Citation
from llm import NOT_FOUND, REFUSAL_TEXT


def _refusal() -> Answer:
    return Answer(REFUSAL_TEXT, "document", [])


# Candidates handed to one pick call. Above this, a cheap term-overlap score narrows the
# list first. The model is a better judge than the score, so keep the window generous —
# this exists to bound how much the model has to weigh, not to make the decision.
PREFILTER_KEEP = 12

# Words that match everything and therefore rank nothing.
_STOPWORDS = frozenset(
    "a an the of in on at to for and or is are was were be been by with from as that this "
    "it its did do does what which who whom whose when where why how much many any some "
    "has have had between during over about into per than then there their they i we you "
    "not no all both each more most other such only own same so too very can will just".split()
)


def _terms(question: str) -> set:
    return {t for t in re.findall(r"[a-z0-9]+", question.lower())
            if t not in _STOPWORDS and len(t) > 2}


def _overlap(terms: set, label: str) -> int:
    low = label.lower()
    return sum(1 for t in terms if t in low)


def prefilter(labels, question: str, keep: int = PREFILTER_KEEP):
    """Indices of the `keep` labels sharing the most terms with the question, in original
    order. Returns everything when there is nothing to narrow.

    Why this exists: the pick prompt is small (a few thousand tokens) but a reasoning
    model's cost scales with how many candidates it has to weigh, not with prompt bytes.
    Cutting 36 candidates to 12 took the pick call from ~90 s to under 1 s with no loss
    on the gold citation set. Ties and zero-score entries keep corpus order, so a
    question that shares no vocabulary with anything degrades to "the first `keep`"
    rather than to an arbitrary shuffle."""
    if len(labels) <= keep:
        return list(range(len(labels)))
    terms = _terms(question)
    if not terms:
        return list(range(keep))
    ranked = sorted(range(len(labels)), key=lambda i: (-_overlap(terms, labels[i]), i))
    return sorted(ranked[:keep])


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


# Section titles alone are often just "Page 7" — nothing for the model to reason
# over. The tree already holds a summary per node (that is the point of PageIndex),
# so the pick label carries it, capped so a wide corpus still fits one prompt.
SECTION_SUMMARY_CHARS = 240


def section_label(doc_title: str, node) -> str:
    label = f"{doc_title} — {node['title']}"
    summary = " ".join((node.get("summary") or "").split())[:SECTION_SUMMARY_CHARS]
    return f"{label}: {summary}" if summary else label


# Leaf nodes carried into one answer. Each costs a source-text fetch and a slice of the
# context budget, so an unbounded pick both slows the query and thins the evidence per
# citation. Measured ~1.5 s of serial fetch latency per extra picked node.
MAX_PICKS = 8


def descend(candidates, question: str, llm):
    """Recursive per-level pick over (doc_id, doc_title, storage_path, node) tuples.
    Picked nodes with children recurse; without children they are leaf results.
    Empty pick at a level drops that subtree — grounding is enforced by the caller's
    empty-final-set check, since a picked leaf is grounded regardless of siblings."""
    if not candidates:
        return []
    titles = [section_label(title, node) for _, title, _, node in candidates]
    window = prefilter(titles, question)
    picks = llm.pick(question, [titles[i] for i in window])
    leaves, next_level = [], []
    for local in picks[:MAX_PICKS]:
        doc_id, title, path, node = candidates[window[local]]
        kids = node.get("nodes") or []
        if kids:
            next_level.extend((doc_id, title, path, k) for k in kids)
        else:
            leaves.append(candidates[window[local]])
    return leaves + descend(next_level, question, llm)


# Total character budget for the answer context, split evenly across picked nodes.
CONTEXT_BUDGET = 8000


def _context(picked, fetch_texts):
    """fetch_texts=None -> summaries (navigation layer doubles as evidence, pre-P2
    behavior). Otherwise fetch the picked nodes' source page text and budget it."""
    if fetch_texts is None:
        return "\n".join(node.get("summary", "") for _, _, _, node in picked)
    spans = [(doc_id, node["page_start"], node["page_end"]) for doc_id, _, _, node in picked]
    texts = fetch_texts(spans)
    per = CONTEXT_BUDGET // max(1, len(picked))
    return "\n".join(t[:per] for t in texts if t and t.strip())


def pick_context(docs, question: str, llm, fetch_texts=None):
    """Shared descent + evidence assembly: (context, citations) or None when
    grounding fails (nothing picked / blank evidence). Callers turn None into
    the refusal answer."""
    picked = descend(flatten(select_docs(docs, question, llm)), question, llm)[:MAX_PICKS]
    if not picked:
        return None
    context = _context(picked, fetch_texts)
    if not context.strip():
        return None
    citations = [Citation(
        document_id=doc_id, title=doc_title, node_title=node["title"],
        page_start=node["page_start"], page_end=node["page_end"],
        storage_path=storage_path,
    ) for doc_id, doc_title, storage_path, node in picked]
    return context, citations


def traverse(docs, question: str, llm, fetch_texts=None) -> Answer:
    """Grounding invariant: every non-refusal answer cites the nodes it was built from;
    no relevant nodes / empty context / model NOT_FOUND all yield the refusal answer.
    fetch_texts(spans)->list[str] injects source page text as evidence (P2)."""
    pc = pick_context(docs, question, llm, fetch_texts)
    if pc is None:
        return _refusal()
    context, citations = pc

    text = llm.answer(question, context)
    if not text or text.strip() == NOT_FOUND:
        return _refusal()
    if not citations:  # belt-and-braces: non-refusal text must carry citations
        return _refusal()
    return Answer(text, "document", citations)

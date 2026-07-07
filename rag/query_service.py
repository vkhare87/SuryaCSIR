"""FastAPI-free query composition for Ask SURYA. api.py is a thin HTTP shell over this
module so the logic stays testable on hosts where fastapi/pydantic native wheels are
blocked (dev laptop WDAC)."""

import dataclasses

from answer import Answer
from llm import REFUSAL_TEXT
from router import decide
from retrieval import traverse, flatten, select_docs
from analytics import run_analytics, CATALOG


def parse_bearer(authorization) -> str:
    """'Bearer <jwt>' -> jwt. Raises ValueError; api.py maps it to HTTP 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ValueError("missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def read_docs(client):
    """RLS-scoped doc_indexes rows -> [{'id','title','storage_path','tree'}] for traversal."""
    rows = (client.table("doc_indexes")
            .select("document_id, tree, documents(id, title, storage_path)")
            .limit(200).execute().data) or []  # ponytail: paginate past 200 docs
    docs = []
    for r in rows:
        doc = r.get("documents") or {}
        if isinstance(doc, list):  # PostgREST may return the join as a 1-element list
            doc = doc[0] if doc else {}
        docs.append({"id": doc.get("id", r["document_id"]),
                     "title": doc.get("title", "Document"),
                     "storage_path": doc.get("storage_path", ""),
                     "tree": r["tree"]})
    return docs


def make_fetch_texts(client):
    """fetch_texts(spans) over doc_pages, RLS-scoped — same read gate as the tree."""
    def fetch_texts(spans):
        out = []
        for doc_id, page_start, page_end in spans:
            try:
                rows = (client.table("doc_pages").select("page, text")
                        .eq("document_id", doc_id)
                        .gte("page", page_start).lte("page", page_end)
                        .order("page").execute().data) or []
            except Exception:
                rows = []
            out.append("\n".join(r.get("text", "") for r in rows))
        return out
    return fetch_texts


def _run_structured(function, params, client):
    """None on any failure (bad params, db error) so the caller can fall back to
    the document path instead of surfacing a 500."""
    try:
        return run_analytics(function, params, client)
    except Exception:
        return None


def _merge_hybrid(structured, doc) -> Answer:
    """Numbers first, document evidence after. A refusing document half is dropped —
    the structured half is DB-grounded on its own, so no citations is acceptable there."""
    if doc.text == REFUSAL_TEXT:
        return Answer(structured.text, "hybrid", [])
    return Answer(f"{structured.text}\n\n{doc.text}", "hybrid", doc.citations)


def handle_query(question, client, llm):
    """Route and answer. client must be the caller's RLS-scoped client."""
    decision = decide(question, llm, CATALOG)
    fetch_texts = make_fetch_texts(client)
    if decision["route"] in ("structured", "hybrid"):
        structured = _run_structured(decision["function"], decision["params"], client)
        if structured is not None:
            if decision["route"] == "structured":
                return structured
            return _merge_hybrid(
                structured, traverse(read_docs(client), question, llm, fetch_texts))
    return traverse(read_docs(client), question, llm, fetch_texts)


def find_similar(text, client, llm):
    """Duplication check: rank corpus sections similar to a proposed topic.
    Returns citation-shaped dicts (no generated prose — matches only, so the
    result is inherently grounded)."""
    prompt = f"Find prior or ongoing work similar to: {text}"
    candidates = flatten(select_docs(read_docs(client), prompt, llm))
    if not candidates:
        return []
    titles = [f"{title} — {node['title']}" for _, title, _, node in candidates]
    picks = llm.pick(prompt, titles)
    matches = []
    for i in picks:
        doc_id, title, storage_path, node = candidates[i]
        matches.append({"document_id": doc_id, "title": title,
                        "node_title": node["title"],
                        "page_start": node["page_start"], "page_end": node["page_end"],
                        "storage_path": storage_path})
    return matches


def log_query(client, question, answer, latency_ms=None):
    """Persist the query as a row owned by the caller (RLS: user_id = auth.uid()).
    Best-effort — a logging failure must not break the answer. Returns row id or None."""
    try:
        row = (client.table("query_log").insert({
            "question": question, "mode": answer.mode, "answer": answer.text,
            "citations": [dataclasses.asdict(c) for c in answer.citations],
            "latency_ms": latency_ms,
        }).execute().data)
        return row[0]["id"] if row else None
    except Exception:
        return None

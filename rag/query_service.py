"""FastAPI-free query composition for Ask SURYA. api.py is a thin HTTP shell over this
module so the logic stays testable on hosts where fastapi/pydantic native wheels are
blocked (dev laptop WDAC)."""

import dataclasses
import json

from router import route
from retrieval import traverse
from analytics import run_analytics, ANALYTICS


def parse_bearer(authorization) -> str:
    """'Bearer <jwt>' -> jwt. Raises ValueError; api.py maps it to HTTP 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ValueError("missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def read_docs(client):
    """RLS-scoped doc_indexes rows -> [{'id','title','tree'}] for traversal."""
    rows = (client.table("doc_indexes")
            .select("document_id, tree, documents(id, title)")
            .limit(50).execute().data) or []
    docs = []
    for r in rows:
        doc = r.get("documents") or {}
        if isinstance(doc, list):  # PostgREST may return the join as a 1-element list
            doc = doc[0] if doc else {}
        docs.append({"id": doc.get("id", r["document_id"]),
                     "title": doc.get("title", "Document"), "tree": r["tree"]})
    return docs


def answer_for_structured(question, client, llm):
    """Ask the llm for {function, params}; run only if whitelisted, else fall back to
    document traversal. The whitelist check is the no-free-form-SQL guarantee."""
    try:
        proposal = json.loads(llm.summarize(question))
        name = proposal.get("function")
        params = proposal.get("params", {})
    except Exception:
        name = None
        params = {}
    if name not in ANALYTICS:
        return traverse(read_docs(client), question, llm)
    return run_analytics(name, params, client)


def handle_query(question, client, llm):
    """Route and answer. client must be the caller's RLS-scoped client."""
    if route(question, llm) == "structured":
        return answer_for_structured(question, client, llm)
    return traverse(read_docs(client), question, llm)


def log_query(client, question, answer):
    """Persist the query as a row owned by the caller (RLS: user_id = auth.uid()).
    Best-effort — a logging failure must not break the answer. Returns row id or None."""
    try:
        row = (client.table("query_log").insert({
            "question": question, "mode": answer.mode, "answer": answer.text,
            "citations": [dataclasses.asdict(c) for c in answer.citations],
        }).execute().data)
        return row[0]["id"] if row else None
    except Exception:
        return None

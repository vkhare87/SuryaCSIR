"""Ask SURYA query endpoint (T5). Thin FastAPI wrapper over the pure router/retrieval/
analytics modules. Reviewed, not unit-tested locally (needs live Supabase + OpenLLM).

Security: every read uses the caller's JWT via a scoped client, so RLS is the only
doc-scoping gate. Structured questions run only whitelisted analytics functions."""

import dataclasses
import json
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from auth import verify_token, scoped_client
from router import route
from retrieval import traverse
from analytics import run_analytics, ANALYTICS
from llm import make_llm

app = FastAPI(title="Ask SURYA")

_ANON_URL = os.environ["SUPABASE_URL"]
_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
_LLM = make_llm(
    os.environ.get("LLM_BACKEND", "fake"),
    os.environ.get("OPENLLM_BASE_URL", ""),
    os.environ.get("OPENLLM_MODEL", ""),
)


class QueryIn(BaseModel):
    question: str


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def _answer_for_structured(question, client):
    """Ask the llm for {function, params}; run only if whitelisted, else fall back."""
    try:
        proposal = json.loads(_LLM.summarize(question))  # openllm returns json; fake -> not json
        name = proposal.get("function")
        params = proposal.get("params", {})
    except Exception:
        name = None
        params = {}
    if name not in ANALYTICS:
        return traverse(_read_docs(client), question, _LLM)
    return run_analytics(name, params, client)


def _read_docs(client):
    rows = (client.table("doc_indexes")
            .select("document_id, tree, documents(id, title)")
            .limit(50).execute().data) or []
    docs = []
    for r in rows:
        doc = r.get("documents") or {}
        docs.append({"id": doc.get("id", r["document_id"]),
                     "title": doc.get("title", "Document"), "tree": r["tree"]})
    return docs


@app.post("/query")
def query(body: QueryIn, authorization: str | None = Header(default=None)):
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="empty question")
    jwt = _bearer(authorization)
    try:
        verify_token(jwt, _ANON_URL, _ANON_KEY)
    except PermissionError:
        raise HTTPException(status_code=401, detail="invalid token")
    client = scoped_client(_ANON_URL, _ANON_KEY, jwt)

    if route(question, _LLM) == "structured":
        answer = _answer_for_structured(question, client)
    else:
        answer = traverse(_read_docs(client), question, _LLM)

    payload = dataclasses.asdict(answer)
    payload["query_id"] = _log_query(client, question, answer)
    return payload


def _log_query(client, question, answer):
    """Persist the query as a row owned by the caller (RLS: user_id = auth.uid()).
    Best-effort — a logging failure must not break the answer."""
    try:
        row = (client.table("query_log").insert({
            "question": question, "mode": answer.mode, "answer": answer.text,
            "citations": [dataclasses.asdict(c) for c in answer.citations],
        }).execute().data)
        return row[0]["id"] if row else None
    except Exception:
        return None

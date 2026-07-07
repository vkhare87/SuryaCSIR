"""Ask SURYA query endpoint (T5). Thin FastAPI shell over query_service.py — all query
logic lives there so it stays testable where fastapi native wheels are blocked.

Security: every read uses the caller's JWT via a scoped client, so RLS is the only
doc-scoping gate. Structured questions run only whitelisted analytics functions."""

import dataclasses
import os
import time

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from auth import verify_token, scoped_client
from query_service import parse_bearer, handle_query, log_query, find_similar
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


@app.post("/query")
def query(body: QueryIn, authorization: str | None = Header(default=None)):
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="empty question")
    try:
        jwt = parse_bearer(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        verify_token(jwt, _ANON_URL, _ANON_KEY)
    except PermissionError:
        raise HTTPException(status_code=401, detail="invalid token")
    client = scoped_client(_ANON_URL, _ANON_KEY, jwt)

    started = time.perf_counter()
    answer = handle_query(question, client, _LLM)
    latency_ms = int((time.perf_counter() - started) * 1000)
    payload = dataclasses.asdict(answer)
    payload["query_id"] = log_query(client, question, answer, latency_ms=latency_ms)
    return payload


class SimilarIn(BaseModel):
    text: str


@app.post("/similar")
def similar(body: SimilarIn, authorization: str | None = Header(default=None)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty text")
    try:
        jwt = parse_bearer(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        verify_token(jwt, _ANON_URL, _ANON_KEY)
    except PermissionError:
        raise HTTPException(status_code=401, detail="invalid token")
    client = scoped_client(_ANON_URL, _ANON_KEY, jwt)
    return {"matches": find_similar(text, client, _LLM)}

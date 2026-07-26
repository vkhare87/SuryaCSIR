"""Ask SURYA query endpoint (T5). Thin FastAPI shell over query_service.py — all query
logic lives there so it stays testable where fastapi native wheels are blocked.

Security: every read uses the caller's JWT via a scoped client, so RLS is the only
doc-scoping gate. Structured questions run only whitelisted analytics functions."""

import dataclasses
import json
import os
import time
import urllib.error

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import verify_token, scoped_client
from query_service import parse_bearer, handle_query, stream_query, log_query, find_similar
from llm import make_llm
from mapping_service import suggest_mapping

app = FastAPI(title="Ask SURYA")

# Same-origin in prod (nginx proxies /rag/ under the SPA's own origin) so this is a
# no-op there. Laptop/demo runs the Vite dev server and uvicorn on different ports,
# so CORS_ORIGINS enables that split without touching the prod deploy.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

_ANON_URL = os.environ["SUPABASE_URL"]
_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
_LLM = make_llm(
    os.environ.get("LLM_BACKEND", "fake"),
    os.environ.get("OPENLLM_BASE_URL", ""),
    os.environ.get("OPENLLM_MODEL", ""),
)


class HistoryTurn(BaseModel):
    question: str
    answer: str


class QueryIn(BaseModel):
    question: str
    history: list[HistoryTurn] | None = None


def _authed_client(body_question: str, authorization):
    question = (body_question or "").strip()
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
    return question, scoped_client(_ANON_URL, _ANON_KEY, jwt)


@app.post("/query")
def query(body: QueryIn, authorization: str | None = Header(default=None)):
    question, client = _authed_client(body.question, authorization)

    started = time.perf_counter()
    history = [t.model_dump() for t in body.history] if body.history else None
    try:
        answer = handle_query(question, client, _LLM, history=history)
    except (TimeoutError, urllib.error.URLError):
        raise HTTPException(status_code=504, detail="model timeout")
    latency_ms = int((time.perf_counter() - started) * 1000)
    payload = dataclasses.asdict(answer)
    payload["query_id"] = log_query(client, question, answer, latency_ms=latency_ms)
    return payload


@app.post("/query/stream")
def query_stream(body: QueryIn, authorization: str | None = Header(default=None)):
    question, client = _authed_client(body.question, authorization)
    history = [t.model_dump() for t in body.history] if body.history else None

    def events():
        started = time.perf_counter()
        try:
            for kind, value in stream_query(question, client, _LLM, history=history):
                if kind == "token":
                    yield f"data: {json.dumps({'token': value})}\n\n"
                else:
                    latency_ms = int((time.perf_counter() - started) * 1000)
                    payload = dataclasses.asdict(value)
                    payload["query_id"] = log_query(client, question, value,
                                                    latency_ms=latency_ms)
                    yield f"data: {json.dumps({'done': payload})}\n\n"
        except (TimeoutError, urllib.error.URLError):
            yield f"data: {json.dumps({'error': 'model timeout'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


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


class TargetField(BaseModel):
    column: str
    label: str


class MapColumnsIn(BaseModel):
    raw_headers: list[str]
    target_fields: list[TargetField]


@app.post("/map-columns")
def map_columns(body: MapColumnsIn, authorization: str | None = Header(default=None)):
    """Phase C: propose raw-header -> canonical-column mappings for an import
    file with unrecognized headers. Advisory only — the caller (ImportFlow)
    still requires a human confirm before anything writes to HR tables."""
    try:
        jwt = parse_bearer(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        verify_token(jwt, _ANON_URL, _ANON_KEY)
    except PermissionError:
        raise HTTPException(status_code=401, detail="invalid token")
    if not body.raw_headers or not body.target_fields:
        raise HTTPException(status_code=400, detail="raw_headers and target_fields required")
    if len(body.raw_headers) > 400 or len(body.target_fields) > 400:
        raise HTTPException(status_code=400, detail="too many headers/fields (max 400)")

    target_fields = [f.model_dump() for f in body.target_fields]
    mapping = suggest_mapping(_LLM, body.raw_headers, target_fields)
    return {"mapping": mapping}

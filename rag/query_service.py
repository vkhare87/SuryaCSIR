"""FastAPI-free query composition for Ask SURYA. api.py is a thin HTTP shell over this
module so the logic stays testable on hosts where fastapi/pydantic native wheels are
blocked (dev laptop WDAC)."""

from concurrent.futures import ThreadPoolExecutor
import dataclasses
import os
import subprocess

from answer import Answer
from llm import NOT_FOUND, REFUSAL_TEXT
from router import decide
from retrieval import traverse, pick_context, flatten, select_docs, section_label
from analytics import run_analytics, CATALOG, AGGREGATE
from scope import scope_of, verdict, looks_like_self, SCOPE_REFUSAL_TEXT


def _catalog_version() -> str:
    """Definition provenance (RP4): stamp every logged answer with the code
    version that produced it. RAG_BUILD_SHA (set by deploy) wins; git fallback
    for dev; 'dev' when neither is available."""
    v = os.environ.get("RAG_BUILD_SHA", "").strip()
    if v:
        return v
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=5,
                             cwd=os.path.dirname(os.path.abspath(__file__)))
        return out.stdout.strip() or "dev"
    except Exception:
        return "dev"


CATALOG_VERSION = _catalog_version()


def parse_bearer(authorization) -> str:
    """'Bearer <jwt>' -> jwt. Raises ValueError; api.py maps it to HTTP 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ValueError("missing bearer token")
    return authorization.split(" ", 1)[1].strip()


_PAGE_SIZE = 200


def read_docs(client, entity_types=None):
    """RLS-scoped doc_indexes rows -> [{'id','title','storage_path','tree'}] for
    traversal. Paginated, so no corpus-size cap. entity_types narrows to the
    collections picked at the collection stage (inner join to filter on the
    parent document's entity_type)."""
    docs, page = [], 0
    while True:
        if entity_types is None:
            q = (client.table("doc_indexes")
                 .select("document_id, tree, documents(id, title, storage_path)"))
        else:
            q = (client.table("doc_indexes")
                 .select("document_id, tree, documents!inner(id, title, storage_path, entity_type)")
                 .in_("documents.entity_type", entity_types))
        rows = (q.order("document_id")
                .range(page * _PAGE_SIZE, (page + 1) * _PAGE_SIZE - 1)
                .execute().data) or []
        for r in rows:
            doc = r.get("documents") or {}
            if isinstance(doc, list):  # PostgREST may return the join as a 1-element list
                doc = doc[0] if doc else {}
            docs.append({"id": doc.get("id", r["document_id"]),
                         "title": doc.get("title", "Document"),
                         "storage_path": doc.get("storage_path", ""),
                         "tree": r["tree"]})
        if len(rows) < _PAGE_SIZE:
            return docs
        page += 1


# EI3 — ask from a record. Each kind: table, key column, columns that name it.
_ENTITIES = {
    "project": ("projects", "ProjectID", ("ProjectNo", "ProjectName", "DivisionCode", "PrincipalInvestigator")),
    "staff": ("staff", "ID", ("Name", "Designation", "Division")),
    "division": ("divisions", "divCode", ("divName",)),
    "instrument": ("equipment", "UInsID", ("Name", "Division")),
}


def entity_preamble(client, entity):
    """One line naming the record a question was asked from. The record is read
    with the caller's client, so a record they may not see raises LookupError.
    This is the only read before the scope gate: routing needs the name."""
    kind, rid = entity.get("type"), str(entity.get("id") or "")
    if kind not in _ENTITIES or not rid:
        raise LookupError("unknown record")
    table, key, cols = _ENTITIES[kind]
    rows = (client.table(table).select(", ".join((key,) + cols)).eq(key, rid).limit(1).execute().data) or []
    if not rows:
        raise LookupError("record not found")
    row = rows[0]
    named = " · ".join(str(row[c]) for c in cols if row.get(c))
    return f"This question is about {kind} {rid}" + (f" ({named})" if named else "") + "."


_ENTITY_DOC_TYPES = {
    "project": ["project"],
    "staff": ["staff", "staff_profile", "publication"],
    "division": ["division"],
    "instrument": ["instrument", "equipment"],
}


def entity_docs(client, entity):
    """That record's indexed documents (for a project, also its progress
    reports), or None when it has none; the caller then searches the whole
    corpus. Read only after the scope gate allows retrieval."""
    kind, rid = entity.get("type"), str(entity.get("id") or "")
    doc_types = _ENTITY_DOC_TYPES.get(kind)
    if not doc_types or not rid:
        return None
    select_cols = "document_id, tree, documents!inner(id, title, storage_path, entity_type, entity_id)"
    rows = (client.table("doc_indexes")
            .select(select_cols)
            .in_("documents.entity_type", doc_types)
            .eq("documents.entity_id", rid)
            .execute().data) or []
    if kind == "project":
        reports = (client.table("project_reports").select("id").eq("project_id", rid).execute().data) or []
        report_ids = [r["id"] for r in reports]
        if report_ids:
            rows = list(rows) + ((client.table("doc_indexes")
                                  .select(select_cols)
                                  .eq("documents.entity_type", "project_report")
                                  .in_("documents.entity_id", report_ids)
                                  .execute().data) or [])
    docs, seen_ids = [], set()
    for r in rows:
        doc = r.get("documents") or {}
        if isinstance(doc, list):
            doc = doc[0] if doc else {}
        doc_id = doc.get("id", r["document_id"])
        if doc_id in seen_ids:
            continue
        seen_ids.add(doc_id)
        docs.append({"id": doc_id, "title": doc.get("title", "Document"),
                     "storage_path": doc.get("storage_path", ""), "tree": r["tree"]})
    return docs or None


def read_collections(client):
    """collection_indexes rows for the collection-stage pick. Empty when the
    worker hasn't built collections yet — callers fall back to the flat corpus."""
    rows = (client.table("collection_indexes")
            .select("collection_key, title, summary").execute().data) or []
    return [r for r in rows if (r.get("summary") or "").strip()]


def select_corpus(question, client, llm):
    """Collection-stage descent: pick collections, then load only their docs.
    No collections built -> whole corpus (pre-P4 behavior). Empty picks -> []
    so traversal refuses (grounding invariant, same as select_docs)."""
    cols = read_collections(client)
    if not cols:
        return read_docs(client)
    labels = [f"{c.get('title', c['collection_key'])} — {c['summary']}" for c in cols]
    picks = llm.pick(question, labels)
    if not picks:
        return []
    types = [cols[i]["collection_key"] for i in picks]
    return read_docs(client, entity_types=types)


ROUTE_FEWSHOT_K = 8


def read_route_labels(client, k=ROUTE_FEWSHOT_K):
    """Most recent admin-labeled routes -> few-shots for the route prompt.
    Best-effort: an empty/missing table just means no extra examples."""
    try:
        rows = (client.table("route_labels")
                .select("question, correct_route")
                .order("created_at", desc=True).limit(k).execute().data) or []
    except Exception:
        return []
    return rows


_DOC_PAGE_BATCH = 500


def make_fetch_texts(client):
    """fetch_texts(spans) over doc_pages, RLS-scoped — same read gate as the tree."""
    def _fetch_doc_pages(doc_id, pages):
        try:
            sorted_pages = sorted(pages)
            out: dict[int, str] = {}
            for i in range(0, len(sorted_pages), _DOC_PAGE_BATCH):
                chunk = sorted_pages[i:i + _DOC_PAGE_BATCH]
                rows = (client.table("doc_pages").select("page, text")
                        .eq("document_id", doc_id)
                        .in_("page", chunk)
                        .order("page").execute().data) or []
                for r in rows:
                    if "page" in r:
                        out[r["page"]] = r.get("text", "")
            return out
        except Exception:
            return {}

    def fetch_texts(spans):
        if not spans:
            return []
        by_doc: dict[str, set[int]] = {}
        for doc_id, page_start, page_end in spans:
            if page_end >= page_start:
                by_doc.setdefault(doc_id, set()).update(range(page_start, page_end + 1))

        pages_by_doc: dict[str, dict[int, str]] = {}
        if len(by_doc) == 1:
            doc_id, pages = next(iter(by_doc.items()))
            pages_by_doc[doc_id] = _fetch_doc_pages(doc_id, pages)
        elif len(by_doc) > 1:
            with ThreadPoolExecutor(max_workers=min(4, len(by_doc))) as pool:
                futures = {pool.submit(_fetch_doc_pages, doc_id, pages): doc_id
                           for doc_id, pages in by_doc.items()}
                for fut, doc_id in futures.items():
                    pages_by_doc[doc_id] = fut.result()

        out = []
        for doc_id, page_start, page_end in spans:
            doc_pages = pages_by_doc.get(doc_id, {})
            out.append("\n".join(
                doc_pages[p] for p in range(page_start, page_end + 1) if p in doc_pages
            ))
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
        return Answer(structured.text, "hybrid", [], data=structured.data)
    return Answer(f"{structured.text}\n\n{doc.text}", "hybrid", doc.citations,
                  data=structured.data)


HISTORY_MAX_TURNS = 3
HISTORY_ANSWER_CHARS = 300


def _with_history(question, history, answers=True):
    """Prepend a condensed transcript so route, picks and answer all see the
    conversation. The raw question is what gets logged (api.py logs its own copy).
    answers=False is the router's copy: earlier questions give a follow-up its
    meaning, but client-sent answers are free text an asker could forge to steer
    the scope labels."""
    turns = [f"Q: {h.get('question', '')}"
             + (f"\nA: {(h.get('answer') or '')[:HISTORY_ANSWER_CHARS]}" if answers else "")
             for h in history[-HISTORY_MAX_TURNS:]]
    return "Earlier in this conversation:\n" + "\n".join(turns) + f"\n\nCurrent question: {question}"


def _refused(decision, reason):
    """SURYA's scope refusal. reason 'out_of_scope' is a strike (the HR sweep
    counts it); 'totals_only' is an ordinary question we cannot total honestly."""
    return Answer(SCOPE_REFUSAL_TEXT, "document", [], trace={
        "route": decision["route"], "function": decision.get("function"),
        "params": decision.get("params"), "refusal": reason,
        "topic": decision.get("topic"), "subject": decision.get("subject")})


def _scope_gate(decision, client, question):
    """None = full scope, carry on. Otherwise the Answer to return as-is: a
    refusal, or under a 'totals' verdict the one aggregate it may serve.
    question: the text the router saw (record line, earlier questions, the
    current question), so an asker who named themself earlier keeps that on a
    follow-up such as "and for 2024?"."""
    scope = scope_of(client)
    if scope.get("lookup_failed"):
        # The roles could not be read, so no scope can be checked: refuse
        # everything, never as a strike.
        return _refused(decision, "scope_unavailable")
    v = verdict(scope, decision.get("topic", "unknown"), decision.get("subject", "unknown"),
                decision.get("subject_division"))
    if v == "full":
        return None
    if v == "refuse":
        # Only a refusal we are sure of is a strike. A failed name read means
        # the self check could not run; self-like wording may be a model slip.
        if scope.get("name_lookup_failed"):
            return _refused(decision, "scope_unavailable")
        if looks_like_self(scope, question):
            return _refused(decision, "self_unsure")
        return _refused(decision, "out_of_scope")
    if decision["route"] == "structured" and decision.get("function") in AGGREGATE:
        answer = _run_structured(decision["function"], decision["params"], client)
        if answer is not None:
            answer.trace = {"route": "structured", "function": decision["function"],
                            "params": decision.get("params")}
            return answer
    return _refused(decision, "totals_only")


def _prepare(question, client, llm, history, entity):
    """(question with record line and history, the router's copy, route decision)."""
    if entity:
        question = entity_preamble(client, entity) + "\n" + question
    route_q = _with_history(question, history, answers=False) if history else question
    decision = decide(route_q, llm, CATALOG, examples=read_route_labels(client))
    full_q = _with_history(question, history) if history else question
    return full_q, route_q, decision


def handle_query(question, client, llm, history=None, entity=None):
    """Route, check scope, answer. client must be the caller's RLS-scoped client.
    history: optional [{'question','answer'}] recent turns for follow-ups.
    entity: optional {'type','id'}, the record the question was asked from."""
    question, route_q, decision = _prepare(question, client, llm, history, entity)
    gated = _scope_gate(decision, client, route_q)
    if gated is not None:
        return gated
    return _answer(question, entity_docs(client, entity) if entity else None, decision, client, llm)


def _answer(question, entity_docs, decision, client, llm):
    """Everything after the gate, for a decision already made and allowed."""
    trace = {"route": decision["route"], "function": decision.get("function"),
             "params": decision.get("params")}
    fetch_texts = make_fetch_texts(client)
    if decision["route"] in ("structured", "hybrid"):
        structured = _run_structured(decision["function"], decision["params"], client)
        if structured is not None:
            if decision["route"] == "structured":
                structured.trace = trace
                return structured
            merged = _merge_hybrid(
                structured, traverse(entity_docs or select_corpus(question, client, llm), question, llm, fetch_texts))
            merged.trace = trace
            return merged
        trace["fallback"] = True
    answer = traverse(entity_docs or select_corpus(question, client, llm), question, llm, fetch_texts)
    answer.trace = trace
    return answer


def stream_query(question, client, llm, history=None, entity=None):
    """Streaming variant of handle_query: yields ('token', str) chunks, then one
    ('done', Answer). Only the document path truly streams; structured/hybrid
    answers arrive as a single token. Grounding invariant matches traverse:
    NOT_FOUND / blank answers become the refusal with zero citations."""
    q, route_q, decision = _prepare(question, client, llm, history, entity)
    gated = _scope_gate(decision, client, route_q)
    if gated is not None:
        yield ("token", gated.text)
        yield ("done", gated)
        return
    docs = entity_docs(client, entity) if entity else None
    if decision["route"] in ("structured", "hybrid"):
        # Reuse the gated decision: routing again could relabel past the gate.
        answer = _answer(q, docs, decision, client, llm)
        yield ("token", answer.text)
        yield ("done", answer)
        return

    trace = {"route": "document", "function": None, "params": None}
    pc = pick_context(docs or select_corpus(q, client, llm), q, llm, make_fetch_texts(client))
    if pc is None:
        yield ("token", REFUSAL_TEXT)
        yield ("done", Answer(REFUSAL_TEXT, "document", [], trace=trace))
        return
    context, citations = pc

    # Hold tokens while the accumulated text could still be the NOT_FOUND sentinel;
    # once it can't be, flush and stream the rest through.
    buf, flushed = "", False
    for chunk in llm.answer_stream(q, context):
        buf += chunk
        if flushed:
            yield ("token", chunk)
        elif not NOT_FOUND.startswith(buf.strip()[:len(NOT_FOUND)]):
            flushed = True
            yield ("token", buf)
    text = buf.strip()
    if not text or text == NOT_FOUND or not citations:
        yield ("token", REFUSAL_TEXT)
        yield ("done", Answer(REFUSAL_TEXT, "document", [], trace=trace))
        return
    if not flushed:  # short answer that never cleared the sentinel guard
        yield ("token", buf)
    yield ("done", Answer(text, "document", citations, trace=trace))


def find_similar(text, client, llm):
    """Duplication check: rank corpus sections similar to a proposed topic.
    Returns citation-shaped dicts (no generated prose — matches only, so the
    result is inherently grounded)."""
    return similar_matches(read_docs(client), text, llm)


# A scientist checking a proposal for prior work reads a shortlist, not a shelf.
# Ranked by the model's own pick order, so the cut keeps its strongest matches.
MAX_SIMILAR_MATCHES = 6


def similar_matches(docs, text, llm):
    """Client-free core of find_similar, shared with the offline duplication eval."""
    prompt = f"Find prior or ongoing work similar to: {text}"
    candidates = flatten(select_docs(docs, prompt, llm))
    if not candidates:
        return []
    titles = [section_label(title, node) for _, title, _, node in candidates]
    picks = llm.pick(prompt, titles)[:MAX_SIMILAR_MATCHES]
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
        trace = answer.trace or {}
        row = (client.table("query_log").insert({
            "question": question, "mode": answer.mode, "answer": answer.text,
            "citations": [dataclasses.asdict(c) for c in answer.citations],
            "latency_ms": latency_ms,
            "route": trace.get("route"),
            "function_name": trace.get("function"),
            "function_params": trace.get("params"),
            "refusal_reason": trace.get("refusal")
                              or ("no_grounded_answer" if answer.text == REFUSAL_TEXT else None),
            "catalog_version": CATALOG_VERSION,
        }).execute().data)
        return row[0]["id"] if row else None
    except Exception:
        return None

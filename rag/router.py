import json

from scope import TOPICS, SUBJECTS

VALID_ROUTES = ("structured", "document", "hybrid")
_FALLBACK = {"route": "document", "function": None, "params": {}}
_UNKNOWN_SCOPE = {"topic": "unknown", "subject": "unknown", "subject_division": None}


def _extract_json(raw: str) -> dict:
    """Tolerate code fences / prose around the object: parse first '{' to last '}'."""
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(raw[start:end + 1])


def decide(question: str, llm, catalog: dict, examples=None) -> dict:
    """One LLM call -> {'route', 'function', 'params', 'topic', 'subject',
    'subject_division'}. Any parse or validation
    failure falls back to the document route — the safe branch (RLS-scoped
    traversal). Structured routes may only name a function present in `catalog`;
    that membership check is the no-free-form-SQL guarantee.
    examples: optional [{'question','correct_route'}] admin-labeled few-shots (P6)."""
    try:
        data = _extract_json(llm.route(question, catalog, examples))
    except Exception:
        return {**_FALLBACK, **_UNKNOWN_SCOPE}
    if not isinstance(data, dict):
        return {**_FALLBACK, **_UNKNOWN_SCOPE}
    return {**_route_part(data, catalog), **_scope_part(data)}


def _scope_part(data: dict) -> dict:
    """Scope labels for the guard (rag/scope.py). Anything off-list is 'unknown',
    which never refuses."""
    topic = str(data.get("topic", "")).strip().lower()
    subject = str(data.get("subject", "")).strip().lower()
    div = data.get("subject_division")
    div = div.strip() or None if isinstance(div, str) else None
    return {"topic": topic if topic in TOPICS else "unknown",
            "subject": subject if subject in SUBJECTS else "unknown",
            "subject_division": div}


def _route_part(data: dict, catalog: dict) -> dict:
    route = str(data.get("route", "")).strip().lower()
    if route not in VALID_ROUTES or route == "document":
        return dict(_FALLBACK)
    function = data.get("function")
    if function not in catalog:
        return dict(_FALLBACK)
    params = data.get("params")
    if not isinstance(params, dict):
        params = {}
    return {"route": route, "function": function, "params": params}

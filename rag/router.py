import json

VALID_ROUTES = ("structured", "document", "hybrid")
_FALLBACK = {"route": "document", "function": None, "params": {}}


def _extract_json(raw: str) -> dict:
    """Tolerate code fences / prose around the object: parse first '{' to last '}'."""
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    return json.loads(raw[start:end + 1])


def decide(question: str, llm, catalog: dict) -> dict:
    """One LLM call -> {'route', 'function', 'params'}. Any parse or validation
    failure falls back to the document route — the safe branch (RLS-scoped
    traversal). Structured routes may only name a function present in `catalog`;
    that membership check is the no-free-form-SQL guarantee."""
    try:
        data = _extract_json(llm.route(question, catalog))
    except Exception:
        return dict(_FALLBACK)

    route = str(data.get("route", "")).strip().lower()
    if route not in VALID_ROUTES:
        return dict(_FALLBACK)
    if route == "document":
        return dict(_FALLBACK)

    function = data.get("function")
    if function not in catalog:
        return dict(_FALLBACK)
    params = data.get("params")
    if not isinstance(params, dict):
        params = {}
    return {"route": route, "function": function, "params": params}

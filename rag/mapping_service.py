"""Column-mapping suggestion (Phase C, data-ingestion design doc). Pure logic,
split from api.py so it's testable under WDAC — mirrors query_service.py.

The LLM proposes; this validates. A hallucinated target column, or a target
reused by two raw headers, is safer left unmapped for the human to fix in the
existing ImportFlow preview grid than silently written to the wrong column."""

import json


def suggest_mapping(llm, raw_headers: list, target_fields: list) -> dict:
    """Returns {raw_header: target_column_or_None} for every raw_header."""
    valid_columns = {f["column"] for f in target_fields}
    try:
        reply = llm.map_columns(raw_headers, target_fields)
        parsed = json.loads(reply).get("mapping", {})
    except (ValueError, AttributeError, TypeError):
        parsed = {}

    result: dict = {}
    used_columns: set = set()
    for h in raw_headers:
        col = parsed.get(h)
        if col in valid_columns and col not in used_columns:
            result[h] = col
            used_columns.add(col)
        else:
            result[h] = None
    return result

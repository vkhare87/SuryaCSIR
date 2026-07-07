_TITLES = {
    "project_report": "Project Progress Reports",
    "pms_report": "PMS Appraisal Reports",
    "publication": "Publications",
    "staff_profile": "Expertise & CV",
    "proposal": "Proposals",
    "meeting": "Committee Documents",
}


def _title(key: str) -> str:
    return _TITLES.get(key, key.replace("_", " ").title())


def build_collection_summaries(rows, llm) -> list:
    """rows: [{'entity_type','root_summary'}] -> one collection per entity_type.
    Summary = llm over the member root summaries."""
    grouped = {}
    for r in rows:
        grouped.setdefault(r["entity_type"], []).append(r.get("root_summary") or "")

    out = []
    for key, summaries in grouped.items():
        out.append({
            "collection_key": key,
            "title": _title(key),
            "summary": llm.summarize("\n".join(s for s in summaries if s)),
            "document_count": len(summaries),
        })
    return out

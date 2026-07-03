from answer import Answer

# Whitelisted, parameterized analytics. The router's structured branch may only invoke names
# present here — never free-form SQL. Each fn takes (params: dict, client) and returns an
# Answer. `client` is the caller's RLS-scoped Supabase client, so results are role-scoped.


def _count_documents_by_status(params, client) -> Answer:
    rows = client.table("documents").select("ingest_status").execute().data or []
    counts = {}
    for r in rows:
        counts[r["ingest_status"]] = counts.get(r["ingest_status"], 0) + 1
    parts = ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) or "none"
    return Answer(f"Documents by ingestion status — {parts}.", "structured", [])


ANALYTICS = {
    "count_documents_by_status": _count_documents_by_status,
}


def run_analytics(name: str, params, client) -> Answer:
    fn = ANALYTICS.get(name)
    if fn is None:
        raise ValueError(f"Not a whitelisted analytics function: {name}")
    return fn(params, client)

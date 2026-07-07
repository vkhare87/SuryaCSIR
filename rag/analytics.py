from datetime import date, timedelta

from answer import Answer

# Whitelisted, parameterized analytics. The router's structured branch may only invoke names
# present here — never free-form SQL. Each fn takes (params: dict, client) and returns an
# Answer. `client` is the caller's RLS-scoped Supabase client, so results are role-scoped.
# ponytail: filters run in Python after a plain select — institute-scale row counts,
# no query-builder surface to validate.


def _rows(client, table, columns):
    return client.table(table).select(columns).execute().data or []


def _counts(rows, key):
    counts = {}
    for r in rows:
        counts[r.get(key) or "unknown"] = counts.get(r.get(key) or "unknown", 0) + 1
    return counts


def _fmt_counts(counts) -> str:
    return ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) or "none"


def _num(value) -> float:
    try:
        return float(str(value).replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


def _parse_date(value):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _count_documents_by_status(params, client) -> Answer:
    counts = _counts(_rows(client, "documents", "ingest_status"), "ingest_status")
    return Answer(f"Documents by ingestion status — {_fmt_counts(counts)}. "
                  "(source: documents table)", "structured", [])


def _count_projects_by_division(params, client) -> Answer:
    rows = _rows(client, "projects", "DivisionCode, ProjectStatus")
    status = params.get("status")
    if status:
        rows = [r for r in rows if str(r.get("ProjectStatus", "")).lower() == str(status).lower()]
    counts = _counts(rows, "DivisionCode")
    label = f" with status '{status}'" if status else ""
    return Answer(f"Projects{label} by division — {_fmt_counts(counts)}. "
                  "(source: projects table)", "structured", [])


def _count_projects_by_status(params, client) -> Answer:
    counts = _counts(_rows(client, "projects", "ProjectStatus"), "ProjectStatus")
    return Answer(f"Projects by status — {_fmt_counts(counts)}. "
                  "(source: projects table)", "structured", [])


def _project_expenditure_summary(params, client) -> Answer:
    rows = _rows(client, "projects", "DivisionCode, SanctionedCost, UtilizedAmount")
    division = params.get("division_code")
    if division:
        rows = [r for r in rows if str(r.get("DivisionCode", "")).lower() == str(division).lower()]
    sanctioned = sum(_num(r.get("SanctionedCost")) for r in rows)
    utilized = sum(_num(r.get("UtilizedAmount")) for r in rows)
    pct = (utilized / sanctioned * 100) if sanctioned else 0.0
    scope = f"division {division}" if division else "all divisions"
    return Answer(f"Expenditure across {len(rows)} project(s) in {scope} — "
                  f"sanctioned {sanctioned:,.0f}, utilized {utilized:,.0f} "
                  f"({pct:.1f}% utilization). (source: projects table)", "structured", [])


def _patent_pipeline_counts(params, client) -> Answer:
    rows = _rows(client, "ip_intelligence", "type, status")
    patents = [r for r in rows if r.get("type") == "Patent"]
    counts = _counts(patents, "status")
    return Answer(f"Patent pipeline — {_fmt_counts(counts)} "
                  f"(of {len(rows)} IP records overall). "
                  "(source: ip_intelligence table)", "structured", [])


def _count_publications_by_division(params, client) -> Answer:
    rows = _rows(client, "scientific_outputs", "division_code, year")
    year = params.get("year")
    if year is not None:
        rows = [r for r in rows if str(r.get("year")) == str(year)]
    counts = _counts(rows, "division_code")
    label = f" in {year}" if year is not None else ""
    return Answer(f"Publications{label} by division — {_fmt_counts(counts)}. "
                  "(source: scientific_outputs table)", "structured", [])


def _count_staff_by_division(params, client) -> Answer:
    counts = _counts(_rows(client, "staff", "Division"), "Division")
    return Answer(f"Staff by division — {_fmt_counts(counts)}. "
                  "(source: staff table)", "structured", [])


def _overdue_phd_milestones(params, client) -> Answer:
    rows = _rows(client, "phd_milestones", "milestone, due_date, completed_date")
    today = date.today()
    overdue = [r for r in rows
               if not r.get("completed_date")
               and (_parse_date(r.get("due_date")) or today) < today]
    counts = _counts(overdue, "milestone")
    return Answer(f"Overdue PhD milestones: {len(overdue)} — {_fmt_counts(counts)}. "
                  "(source: phd_milestones table)", "structured", [])


def _mou_status_summary(params, client) -> Answer:
    rows = _rows(client, "mous", "status, valid_until")
    counts = _counts(rows, "status")
    horizon = date.today() + timedelta(days=90)
    expiring = sum(1 for r in rows
                   if r.get("status") == "Active"
                   and (_parse_date(r.get("valid_until")) or horizon) < horizon)
    return Answer(f"MOUs by status — {_fmt_counts(counts)}; "
                  f"{expiring} active MOU(s) expire within 90 days. "
                  "(source: mous table)", "structured", [])


def _tech_transfer_summary(params, client) -> Answer:
    rows = _rows(client, "tech_transfers", "status, value_lakhs")
    counts = _counts(rows, "status")
    total = sum(_num(r.get("value_lakhs")) for r in rows)
    return Answer(f"Technology transfers by status — {_fmt_counts(counts)}; "
                  f"total agreement value {total:,.2f} lakhs. "
                  "(source: tech_transfers table)", "structured", [])


ANALYTICS = {
    "count_documents_by_status": _count_documents_by_status,
    "count_projects_by_division": _count_projects_by_division,
    "count_projects_by_status": _count_projects_by_status,
    "project_expenditure_summary": _project_expenditure_summary,
    "patent_pipeline_counts": _patent_pipeline_counts,
    "count_publications_by_division": _count_publications_by_division,
    "count_staff_by_division": _count_staff_by_division,
    "overdue_phd_milestones": _overdue_phd_milestones,
    "mou_status_summary": _mou_status_summary,
    "tech_transfer_summary": _tech_transfer_summary,
}

# One-line descriptions shown to the router LLM. Keys must mirror ANALYTICS
# (enforced by test_analytics), keeping prompt and whitelist in lockstep.
CATALOG = {
    "count_documents_by_status": "Count institute documents grouped by ingestion status.",
    "count_projects_by_division": "Count projects per division; optional param 'status' filters by project status.",
    "count_projects_by_status": "Count projects grouped by status (Ongoing, Completed, ...).",
    "project_expenditure_summary": "Total sanctioned vs utilized project funds and utilization %; optional param 'division_code'.",
    "patent_pipeline_counts": "Patent counts by pipeline stage (Filed, Published, Granted).",
    "count_publications_by_division": "Count research publications per division; optional param 'year'.",
    "count_staff_by_division": "Count staff members per division.",
    "overdue_phd_milestones": "Count PhD scholar milestones past their due date and not completed, by milestone type.",
    "mou_status_summary": "MOU counts by status plus active MOUs expiring within 90 days.",
    "tech_transfer_summary": "Technology-transfer counts by status and total agreement value in lakhs.",
}


def run_analytics(name: str, params, client) -> Answer:
    fn = ANALYTICS.get(name)
    if fn is None:
        raise ValueError(f"Not a whitelisted analytics function: {name}")
    return fn(params, client)

import re
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
    """CSIR-AMPRI's own HR records write dates as '28.12.1970', and project sheets
    use '28/12/1970'; ISO-only parsing silently dropped every real staff row, so
    succession risk and retirement analytics saw only seeded demo data.
    Mirrors parseDate() in src/utils/dateUtils.ts."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        pass
    match = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$", text)
    if match:
        day, month, year = (int(g) for g in match.groups())
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def _add_years(d, years):
    """d shifted by whole years; Feb-29 in a non-leap target lands on Feb-28."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(month=2, day=28, year=d.year + years)


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


def _recorded(value) -> bool:
    """True when a figure was actually supplied. Utilisation comes from Finance &
    Accounts, not the projects register, so it is routinely blank — and summing
    blanks to 0 reports 'nothing was spent', which is a different and much worse
    claim than 'we do not hold this figure'."""
    return str(value or "").strip() != ""


def _project_expenditure_summary(params, client) -> Answer:
    rows = _rows(client, "projects", "DivisionCode, SanctionedCost, UtilizedAmount")
    division = params.get("division_code")
    if division:
        rows = [r for r in rows if str(r.get("DivisionCode", "")).lower() == str(division).lower()]
    sanctioned = sum(_num(r.get("SanctionedCost")) for r in rows)
    with_util = [r for r in rows if _recorded(r.get("UtilizedAmount"))]
    scope = f"division {division}" if division else "all divisions"

    if not with_util:
        return Answer(f"Expenditure across {len(rows)} project(s) in {scope} — "
                      f"sanctioned {sanctioned:,.0f}. Utilisation is not recorded for "
                      f"any of these projects, so no utilisation percentage can be "
                      f"reported. (source: projects table)", "structured", [])

    utilized = sum(_num(r.get("UtilizedAmount")) for r in with_util)
    util_sanctioned = sum(_num(r.get("SanctionedCost")) for r in with_util)
    pct = (utilized / util_sanctioned * 100) if util_sanctioned else 0.0
    coverage = ("" if len(with_util) == len(rows) else
                f" Utilisation is recorded for {len(with_util)} of {len(rows)} project(s); "
                f"the percentage covers only those.")
    return Answer(f"Expenditure across {len(rows)} project(s) in {scope} — "
                  f"sanctioned {sanctioned:,.0f}, utilized {utilized:,.0f} "
                  f"({pct:.1f}% utilization).{coverage} (source: projects table)",
                  "structured", [])


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


def _expertise_search(params, client) -> Answer:
    """Expertise discovery: rank in-house staff whose Expertise/CoreArea matches a
    topic. Human-capital routing — 'who here has worked on X'. Ranked: match in both
    fields ahead of one field."""
    topic = str(params.get("topic") or "").strip().lower()
    if not topic:
        return Answer("No topic supplied for expertise search. "
                      "(source: staff table)", "structured", [])
    terms = [t for t in topic.replace(",", " ").split() if len(t) > 2] or [topic]
    rows = _rows(client, "staff", "Name, Designation, Division, CoreArea, Expertise")
    scored = []
    for r in rows:
        core = str(r.get("CoreArea") or "").lower()
        exp = str(r.get("Expertise") or "").lower()
        score = sum(1 for t in terms if t in core) + sum(1 for t in terms if t in exp)
        if score:
            scored.append((score, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        return Answer(f"No staff found with expertise matching '{params.get('topic')}'. "
                      "(source: staff table)", "structured", [])
    top = scored[:10]
    listing = "; ".join(
        f"{r.get('Name') or 'Unknown'} ({r.get('Designation') or '—'}, "
        f"div {r.get('Division') or '—'})" for _, r in top)
    more = f" (+{len(scored) - len(top)} more)" if len(scored) > len(top) else ""
    return Answer(f"{len(scored)} staff match expertise '{params.get('topic')}' — "
                  f"{listing}{more}. (source: staff table)", "structured", [])


# Utilization variance beyond this many percentage points from expected linear burn
# flags a project (covenant-style early warning).
_BUDGET_VARIANCE_PP = 25.0


def _project_budget_variance(params, client) -> Answer:
    """Budget early-warning: for active projects, compare utilization % against the
    expected linear burn implied by elapsed time, and flag exhaustion/overrun.
    Financial analogue: loan-covenant breach monitoring."""
    threshold = _num(params.get("threshold_pp")) or _BUDGET_VARIANCE_PP
    rows = _rows(client, "projects",
                 "ProjectNo, ProjectName, ProjectStatus, StartDate, CompletioDate, "
                 "SanctionedCost, UtilizedAmount")
    today = date.today()
    flags = []
    assessable = 0
    for r in rows:
        if str(r.get("ProjectStatus", "")).lower() in ("completed", "closed"):
            continue
        sanctioned = _num(r.get("SanctionedCost"))
        if sanctioned <= 0:
            continue
        # No utilisation figure means unassessed, not on-budget. Treating blanks as
        # zero spend made every project look massively under-burnt, so the analytic
        # returned a reassuring "nothing breaches the threshold" over no data at all.
        if not _recorded(r.get("UtilizedAmount")):
            continue
        assessable += 1
        util_pct = _num(r.get("UtilizedAmount")) / sanctioned * 100
        name = r.get("ProjectNo") or r.get("ProjectName") or "unknown"
        if util_pct > 100:
            flags.append(f"{name}: OVERRUN ({util_pct:.0f}% of budget spent)")
            continue
        start, end = _parse_date(r.get("StartDate")), _parse_date(r.get("CompletioDate"))
        if start and end and end > start:
            elapsed_pct = max(0.0, min(100.0, (today - start).days / (end - start).days * 100))
            variance = util_pct - elapsed_pct
            if abs(variance) >= threshold:
                direction = "ahead of" if variance > 0 else "behind"
                flags.append(f"{name}: {util_pct:.0f}% spent vs {elapsed_pct:.0f}% time "
                             f"elapsed ({direction} burn by {abs(variance):.0f}pp)")
        elif util_pct >= 90:
            flags.append(f"{name}: near exhaustion ({util_pct:.0f}% spent, no timeline)")
    if not assessable:
        return Answer("Budget variance cannot be assessed: no active project has a "
                      "recorded utilisation figure. (source: projects table)",
                      "structured", [])
    if not flags:
        return Answer(f"No active projects breach the budget-variance threshold "
                      f"({assessable} project(s) assessed). (source: projects table)",
                      "structured", [])
    return Answer(f"{len(flags)} project(s) flagged for budget variance — "
                  f"{'; '.join(flags[:15])}"
                  f"{' …' if len(flags) > 15 else ''}. (source: projects table)",
                  "structured", [])


# CSIR superannuation age; horizon (years) for succession-risk lookahead.
_RETIREMENT_AGE = 60
_SUCCESSION_YEARS = 3


# HR records leave unknown expertise as the literal 'N/A', which is not a capability
# anyone can inherit — treat it as blank so it neither raises nor absorbs risk.
_NO_EXPERTISE = {"", "n/a", "na", "none", "-"}


def _expertise_key(row) -> str:
    """The capability a person actually carries. 'Expertise' is the specific field
    ('Radiation Shielding'); CoreArea is the broad discipline bucket ('Material
    Science', 'Group-I') that dozens share, so keying succession risk on CoreArea
    finds nothing real. Prefer Expertise, fall back to CoreArea."""
    for field in ("Expertise", "CoreArea"):
        value = str(row.get(field) or "").strip().lower()
        if value not in _NO_EXPERTISE:
            return value
    return ""


def _expertise_succession_risk(params, client) -> Answer:
    """Key-person risk: staff retiring within N years whose CoreArea is held by no
    colleague remaining after them. Financial analogue: single-point-of-failure /
    uninsured concentration."""
    years = int(_num(params.get("years")) or _SUCCESSION_YEARS)
    rows = _rows(client, "staff", "Name, Designation, Division, DOB, CoreArea, Expertise")
    today = date.today()
    horizon = _add_years(today, years)
    retiring, staying_areas = [], set()
    for r in rows:
        dob = _parse_date(r.get("DOB"))
        area = _expertise_key(r)
        retire_on = _add_years(dob, _RETIREMENT_AGE) if dob else None
        if retire_on and today <= retire_on <= horizon:
            retiring.append((r, retire_on, area))
        elif area:
            staying_areas.add(area)
    at_risk = [(r, retire_on) for r, retire_on, core in retiring
               if core and core not in staying_areas]
    if not at_risk:
        return Answer(f"No unique-expertise succession risk within {years} year(s). "
                      "(source: staff table)", "structured", [])
    listing = "; ".join(
        f"{r.get('Name') or 'Unknown'} ({_expertise_key(r) or '—'}, "
        f"div {r.get('Division') or '—'}, retires {retire_on.isoformat()})"
        for r, retire_on in sorted(at_risk, key=lambda x: x[1]))
    return Answer(f"{len(at_risk)} staff retiring within {years} year(s) hold expertise "
                  f"no colleague covers — {listing}. (source: staff table)",
                  "structured", [])


def _match_staff(rows, needle):
    """Substring match on Name, exact on ID — mirrors relations.ts norm() logic."""
    n = needle.strip().lower()
    return [r for r in rows
            if n in str(r.get("Name") or "").lower()
            or n == str(r.get("ID") or "").lower()]


def _staff_profile(params, client) -> Answer:
    name = str(params.get("name") or "").strip()
    if not name:
        return Answer("No staff name supplied. (source: staff table)", "structured", [])
    rows = _rows(client, "staff",
                 "ID, Name, Designation, Division, CoreArea, Expertise, Email")
    matches = _match_staff(rows, name)
    if not matches:
        return Answer(f"No staff member matching '{name}'. (source: staff table)",
                      "structured", [])
    if len(matches) > 1:
        listing = "; ".join(
            f"{r.get('Name')} ({r.get('Designation') or '—'}, div {r.get('Division') or '—'})"
            for r in matches[:10])
        return Answer(f"{len(matches)} staff match '{name}' — {listing}. "
                      "Ask again with a fuller name. (source: staff table)",
                      "structured", [], data={"candidates": matches[:10]})
    r = matches[0]
    return Answer(f"{r.get('Name')} — {r.get('Designation') or '—'}, "
                  f"division {r.get('Division') or '—'}, "
                  f"core area {r.get('CoreArea') or '—'}, "
                  f"expertise {r.get('Expertise') or '—'}, "
                  f"email {r.get('Email') or '—'}. (source: staff table)",
                  "structured", [], data={"staff": r})


def _projects_for_staff(params, client) -> Answer:
    name = str(params.get("name") or "").strip()
    if not name:
        return Answer("No staff name supplied. (source: staff, projects tables)",
                      "structured", [])
    people = _match_staff(_rows(client, "staff", "ID, Name"), name)
    if not people:
        return Answer(f"No staff member matching '{name}'. (source: staff table)",
                      "structured", [])
    person = people[0]
    full = str(person.get("Name") or "").strip().lower()
    sid = str(person.get("ID") or "").strip().lower()
    projects = _rows(client, "projects",
                     "ProjectNo, ProjectName, ProjectStatus, PrincipalInvestigator")
    team_nos = {str(r.get("ProjectNo"))
                for r in _rows(client, "project_staff", "ProjectNo, StaffName")
                if str(r.get("StaffName") or "").strip().lower() == full}
    led, member = [], []
    for p in projects:
        pi = str(p.get("PrincipalInvestigator") or "").strip().lower()
        if pi and pi in (full, sid):
            led.append(p)
        elif str(p.get("ProjectNo")) in team_nos:
            member.append(p)
    data = {"staff_name": person.get("Name"), "leads": led[:10], "member_of": member[:10]}
    if not led and not member:
        return Answer(f"{person.get('Name')} has no recorded projects. "
                      "(source: projects, project_staff tables)", "structured", [],
                      data=data)
    fmt = lambda p: (f"{p.get('ProjectNo')} {p.get('ProjectName') or ''} "
                     f"[{p.get('ProjectStatus') or '—'}]").strip()
    parts = []
    if led:
        parts.append(f"leads {len(led)}: " + "; ".join(fmt(p) for p in led[:10]))
    if member:
        parts.append(f"team member on {len(member)}: " + "; ".join(fmt(p) for p in member[:10]))
    return Answer(f"{person.get('Name')} — " + ". ".join(parts) +
                  ". (source: projects, project_staff tables)", "structured", [],
                  data=data)


def _division_summary(params, client) -> Answer:
    code = str(params.get("division_code") or "").strip()
    if not code:
        return Answer("No division code supplied. (source: divisions table)",
                      "structured", [])
    divisions = _rows(client, "divisions",
                      "divCode, divName, divHoD, divCurrentStrength, divSanctionedstrength")
    div = next((d for d in divisions
                if str(d.get("divCode") or "").lower() == code.lower()), None)
    if div is None:
        return Answer(f"No division with code '{code}'. (source: divisions table)",
                      "structured", [])
    dc = str(div.get("divCode"))
    staff_count = sum(1 for r in _rows(client, "staff", "Division")
                      if str(r.get("Division") or "") == dc)
    proj_rows = [r for r in _rows(client, "projects", "DivisionCode, ProjectStatus")
                 if str(r.get("DivisionCode") or "") == dc]
    status_counts = _counts(proj_rows, "ProjectStatus")
    return Answer(f"{div.get('divName')} ({dc}) — HoD {div.get('divHoD') or '—'}, "
                  f"strength {div.get('divCurrentStrength')}/{div.get('divSanctionedstrength')} "
                  f"(current/sanctioned), staff on record: {staff_count}, "
                  f"projects by status: {_fmt_counts(status_counts)}. "
                  "(source: divisions, staff, projects tables)", "structured", [],
                  data={"division": div, "staff_count": staff_count,
                        "projects_by_status": status_counts})


def _project_team(params, client) -> Answer:
    no = str(params.get("project_no") or "").strip()
    name = str(params.get("project_name") or "").strip().lower()
    if not no and not name:
        return Answer("No project number or name supplied. (source: projects table)",
                      "structured", [])
    projects = _rows(client, "projects",
                     "ProjectNo, ProjectName, ProjectStatus, PrincipalInvestigator")
    if no:
        proj = next((p for p in projects
                     if str(p.get("ProjectNo") or "").lower() == no.lower()), None)
    else:
        proj = next((p for p in projects
                     if name in str(p.get("ProjectName") or "").lower()), None)
    if proj is None:
        return Answer(f"No project matching '{no or params.get('project_name')}'. "
                      "(source: projects table)", "structured", [])
    pi_raw = str(proj.get("PrincipalInvestigator") or "").strip()
    pi_matches = _match_staff(_rows(client, "staff", "ID, Name"), pi_raw) if pi_raw else []
    pi_name = pi_matches[0].get("Name") if pi_matches else (pi_raw or "—")
    team = [str(r.get("StaffName"))
            for r in _rows(client, "project_staff", "ProjectNo, StaffName")
            if str(r.get("ProjectNo")) == str(proj.get("ProjectNo"))]
    team_str = "; ".join(team) if team else "none recorded"
    return Answer(f"{proj.get('ProjectNo')} {proj.get('ProjectName') or ''} "
                  f"[{proj.get('ProjectStatus') or '—'}] — PI: {pi_name}; "
                  f"team: {team_str}. (source: projects, project_staff tables)",
                  "structured", [],
                  data={"project": proj, "pi": pi_name, "team": team})


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
    "expertise_search": _expertise_search,
    "project_budget_variance": _project_budget_variance,
    "expertise_succession_risk": _expertise_succession_risk,
    "staff_profile": _staff_profile,
    "projects_for_staff": _projects_for_staff,
    "division_summary": _division_summary,
    "project_team": _project_team,
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
    "expertise_search": "Find in-house staff with expertise in a topic; required param 'topic' (free text). Answers 'who has worked on X'.",
    "project_budget_variance": "Flag active projects whose spend deviates from expected burn or nears exhaustion/overrun; optional param 'threshold_pp'.",
    "expertise_succession_risk": "List staff retiring within N years whose expertise no colleague covers; optional param 'years'.",
    "staff_profile": "Profile of one named staff member — designation, division, core area, expertise, email; required param 'name'. Answers 'who is X'.",
    "projects_for_staff": "Projects a named staff member leads (as PI) or works on as team member; required param 'name'. Answers 'what is X working on'.",
    "division_summary": "One division's summary — head of division, current/sanctioned strength, staff count, project counts by status; required param 'division_code'.",
    "project_team": "PI and team members of one project; param 'project_no' (exact) or 'project_name' (fragment). Answers 'who works on project X'.",
}


def run_analytics(name: str, params, client) -> Answer:
    fn = ANALYTICS.get(name)
    if fn is None:
        raise ValueError(f"Not a whitelisted analytics function: {name}")
    return fn(params, client)

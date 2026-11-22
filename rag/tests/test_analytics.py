from datetime import date

import pytest
from analytics import run_analytics, ANALYTICS, CATALOG


class _FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeClient:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeTable(self._rows)


def test_unknown_function_rejected():
    with pytest.raises(ValueError):
        run_analytics("drop_everything", {}, _FakeClient([]))


def test_whitelisted_function_runs():
    rows = [{"ingest_status": "indexed"}, {"ingest_status": "indexed"},
            {"ingest_status": "pending"}]
    ans = run_analytics("count_documents_by_status", {}, _FakeClient(rows))
    assert ans.mode == "structured"
    assert "indexed: 2" in ans.text
    assert "pending: 1" in ans.text


def test_registry_names_are_callable():
    assert all(callable(fn) for fn in ANALYTICS.values())


def test_catalog_mirrors_analytics():
    assert set(CATALOG) == set(ANALYTICS)


def test_projects_by_division_with_status_filter():
    rows = [{"DivisionCode": "CMD", "ProjectStatus": "Ongoing"},
            {"DivisionCode": "CMD", "ProjectStatus": "Completed"},
            {"DivisionCode": "LWMD", "ProjectStatus": "Ongoing"}]
    ans = run_analytics("count_projects_by_division", {"status": "ongoing"}, _FakeClient(rows))
    assert "CMD: 1" in ans.text
    assert "LWMD: 1" in ans.text


def test_expenditure_summary_math_and_division_filter():
    rows = [{"DivisionCode": "CMD", "SanctionedCost": "1,000", "UtilizedAmount": "250"},
            {"DivisionCode": "LWMD", "SanctionedCost": "500", "UtilizedAmount": "500"}]
    ans = run_analytics("project_expenditure_summary", {"division_code": "CMD"}, _FakeClient(rows))
    assert "sanctioned 1,000" in ans.text
    assert "25.0% utilization" in ans.text


def test_expenditure_summary_zero_sanctioned_no_crash():
    """Empty input must not divide by zero. It now reports the absence explicitly
    rather than printing a 0.0% utilisation that reads as 'nothing was spent'."""
    ans = run_analytics("project_expenditure_summary", {}, _FakeClient([]))
    assert "not recorded" in ans.text


def test_patent_pipeline_counts_patents_only():
    rows = [{"type": "Patent", "status": "Filed"},
            {"type": "Patent", "status": "Granted"},
            {"type": "Copyright", "status": "Granted"}]
    ans = run_analytics("patent_pipeline_counts", {}, _FakeClient(rows))
    assert "Filed: 1" in ans.text
    assert "Granted: 1" in ans.text
    assert "3 IP records overall" in ans.text


def test_publications_year_filter():
    rows = [{"division_code": "CMD", "year": 2024},
            {"division_code": "CMD", "year": 2025}]
    ans = run_analytics("count_publications_by_division", {"year": 2025}, _FakeClient(rows))
    assert "CMD: 1" in ans.text


def test_overdue_phd_milestones_date_logic():
    rows = [{"milestone": "Coursework", "due_date": "2020-01-01", "completed_date": None},
            {"milestone": "Coursework", "due_date": "2020-01-01", "completed_date": "2020-02-01"},
            {"milestone": "Thesis", "due_date": "2999-01-01", "completed_date": None},
            {"milestone": "Synopsis", "due_date": None, "completed_date": None}]
    ans = run_analytics("overdue_phd_milestones", {}, _FakeClient(rows))
    assert "Overdue PhD milestones: 1" in ans.text
    assert "Coursework: 1" in ans.text


def test_mou_summary_counts_expiring():
    rows = [{"status": "Active", "valid_until": "2020-01-01"},
            {"status": "Active", "valid_until": "2999-01-01"},
            {"status": "Expired", "valid_until": "2019-01-01"}]
    ans = run_analytics("mou_status_summary", {}, _FakeClient(rows))
    assert "Active: 2" in ans.text
    assert "1 active MOU(s) expire within 90 days" in ans.text


def test_tech_transfer_total_value():
    rows = [{"status": "Signed", "value_lakhs": 10.5},
            {"status": "Executed", "value_lakhs": "4.5"}]
    ans = run_analytics("tech_transfer_summary", {}, _FakeClient(rows))
    assert "Signed: 1" in ans.text
    assert "15.00 lakhs" in ans.text


def test_all_functions_answer_on_empty_tables():
    for name in ANALYTICS:
        ans = run_analytics(name, {}, _FakeClient([]))
        assert ans.mode == "structured"
        assert ans.citations == []


def test_expertise_search_reads_expertise_find():
    """Ask SURYA gives the finder's people, in the finder's order."""
    found = [
        {"staff_id": "A", "name": "Dr A", "designation": "Sci C", "division": "CMD", "confirmed_terms": 1,
         "evidence_count": 0, "active_projects": 5, "overload": True, "retires_on": "2031-01-31"},
        {"staff_id": "B", "name": "Dr B", "designation": "Sci B", "division": "NST", "confirmed_terms": 0,
         "evidence_count": 2, "active_projects": 1, "overload": False, "retires_on": None},
    ]
    ans = run_analytics("expertise_search", {"topic": "corrosion"},
                        _FakeMultiClient({"rpc:expertise_find": {"corrosion": found}}))
    assert "2 staff match" in ans.text
    assert ans.text.index("Dr A") < ans.text.index("Dr B")
    assert "confirmed" in ans.text and "overloaded" in ans.text and "retires 2031-01-31" in ans.text
    assert "expertise_find" in ans.text


def test_expertise_search_no_topic():
    ans = run_analytics("expertise_search", {}, _FakeClient([{"Name": "X"}]))
    assert "No topic" in ans.text


def test_budget_variance_flags_overrun_and_burn_drift():
    rows = [
        {"ProjectNo": "P-OVER", "ProjectStatus": "Active", "SanctionedCost": "100",
         "UtilizedAmount": "120", "StartDate": "2024-01-01", "CompletioDate": "2027-01-01"},
        {"ProjectNo": "P-FAST", "ProjectStatus": "Active", "SanctionedCost": "100",
         "UtilizedAmount": "95", "StartDate": "2999-01-01", "CompletioDate": "3000-01-01"},
        {"ProjectNo": "P-OK", "ProjectStatus": "Active", "SanctionedCost": "100",
         "UtilizedAmount": "5", "StartDate": "2999-01-01", "CompletioDate": "3000-01-01"},
        {"ProjectNo": "P-DONE", "ProjectStatus": "Completed", "SanctionedCost": "100",
         "UtilizedAmount": "200"},
    ]
    ans = run_analytics("project_budget_variance", {}, _FakeClient(rows))
    assert "P-OVER: OVERRUN" in ans.text
    assert "P-FAST" in ans.text          # 95% spent, ~0% elapsed -> ahead of burn
    assert "P-OK" not in ans.text        # 5% spent, ~0% elapsed -> within threshold
    assert "P-DONE" not in ans.text      # completed, skipped


def test_budget_variance_none_flagged():
    """A project burning in line with elapsed time is not flagged. Uses a recorded
    utilisation figure — a blank one is now 'unassessed', not 'on budget'."""
    today = date.today()
    rows = [{"ProjectNo": "P1", "ProjectName": "on track", "ProjectStatus": "Active",
             "StartDate": today.replace(year=today.year - 1).isoformat(),
             "CompletioDate": today.replace(year=today.year + 1).isoformat(),
             "SanctionedCost": "1000", "UtilizedAmount": "500"}]
    ans = run_analytics("project_budget_variance", {}, _FakeClient(rows))
    assert "No active projects breach" in ans.text
    assert "1 project(s) assessed" in ans.text


def test_succession_risk_flags_unique_expertise():
    today = date.today()
    retiring_dob = today.replace(year=today.year - 58).isoformat()   # retires in ~2y
    young_dob = today.replace(year=today.year - 30).isoformat()
    rows = [
        {"Name": "Dr Sole", "Designation": "Sci G", "Division": "CMD",
         "DOB": retiring_dob, "CoreArea": "Rare craft"},
        {"Name": "Dr Shared", "Designation": "Sci F", "Division": "CMD",
         "DOB": retiring_dob, "CoreArea": "Common area"},
        {"Name": "Dr Young", "Designation": "Sci B", "Division": "CMD",
         "DOB": young_dob, "CoreArea": "Common area"},
    ]
    ans = run_analytics("expertise_succession_risk", {"years": 3}, _FakeClient(rows))
    assert "Dr Sole" in ans.text          # unique area, no cover
    assert "Dr Shared" not in ans.text     # 'Common area' also held by Dr Young


def test_succession_risk_uses_confirmed_tags():
    """A confirmed tag replaces the free-text field: Dr Sole's 'rare craft' is
    covered once Dr Young confirms the same term."""
    today = date.today()
    tables = {
        "staff": [
            {"ID": "S1", "Name": "Dr Sole", "Division": "CMD",
             "DOB": today.replace(year=today.year - 58).isoformat(), "CoreArea": "Rare craft"},
            {"ID": "S2", "Name": "Dr Young", "Division": "CMD",
             "DOB": today.replace(year=today.year - 30).isoformat(), "CoreArea": "Other"},
        ],
        "expertise_terms": [{"id": "t1", "label": "Rare craft", "status": "ACTIVE"}],
        "staff_expertise": [{"staff_id": "S2", "term_id": "t1", "confirmed_at": "2026-11-13"}],
    }
    ans = run_analytics("expertise_succession_risk", {"years": 3}, _FakeMultiClient(tables))
    assert "No unique-expertise succession risk" in ans.text
    tables["staff_expertise"][0]["confirmed_at"] = None
    assert "Dr Sole" in run_analytics("expertise_succession_risk", {"years": 3}, _FakeMultiClient(tables)).text


def test_metric_quotes_metric_value():
    """Ask SURYA quotes metric_value: the number the scorecard shows."""
    class _C(_FakeMultiClient):
        def rpc(self, name, params):
            assert name == "metric_value" and params == {"p_key": "projects_active", "p_scope": {"division": "D1"}}
            return _FakeTable(7)
    reg = [{"key": "projects_active", "label": "Active projects", "definition": "Projects at stage ACTIVE", "unit": "count", "sort": 30}]
    ans = run_analytics("metric", {"key": "projects_active", "division": "D1"}, _C({"metrics": reg}))
    assert "Active projects for division D1: 7." in ans.text
    assert "Metrics available — projects_active" in run_analytics("metric", {}, _C({"metrics": reg})).text


def test_succession_risk_none():
    ans = run_analytics("expertise_succession_risk", {}, _FakeClient([]))
    assert "No unique-expertise succession risk" in ans.text


class _FakeMultiClient:
    """Per-table rows: _FakeMultiClient({'staff': [...], 'projects': [...]})."""
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeTable(self._tables.get(name, []))

    def rpc(self, name, params):
        # "rpc:<name>" maps the RPC's first argument to the rows it returns.
        return _FakeTable(self._tables.get("rpc:" + name, {}).get(next(iter(params.values())), []))


def _fact(section, record_id, title, role):
    return {"section": section, "record_id": record_id, "title": title, "role": role}


# What staff_profile_facts returns per staff ID — people linked by key, not name.
_FACTS = {"rpc:staff_profile_facts": {
    "S001": [_fact("PROJECT", "P-1", "Composite Panels", "PI"),
             _fact("PROJECT", "P-2", "Alloy Study", "Project Associate"),
             _fact("OUTPUT", "O-1", "Panels paper", "Author 1 · J")],
    "S002": [_fact("PROJECT", "P-2", "Alloy Study", "PI"),
             _fact("PROJECT", "P-3", "Waste Valorisation", "PI")],
}}


_STAFF = [
    {"ID": "S001", "Name": "Anil Sharma", "Designation": "Sr. Scientist",
     "Division": "CMD", "CoreArea": "Composites", "Expertise": "polymer composites",
     "Email": "anil@ampri.res.in"},
    {"ID": "S002", "Name": "Rekha Sharma", "Designation": "Scientist",
     "Division": "LWMD", "CoreArea": "Metallurgy", "Expertise": "alloys",
     "Email": "rekha@ampri.res.in"},
]

_PROJECTS = [
    {"ProjectNo": "GAP-001", "ProjectName": "Composite Panels", "DivisionCode": "CMD",
     "ProjectStatus": "Ongoing", "PrincipalInvestigator": "Anil Sharma"},
    {"ProjectNo": "GAP-002", "ProjectName": "Alloy Study", "DivisionCode": "LWMD",
     "ProjectStatus": "Ongoing", "PrincipalInvestigator": "Rekha Sharma"},
    {"ProjectNo": "GAP-003", "ProjectName": "Waste Valorisation", "DivisionCode": "LWMD",
     "ProjectStatus": "Completed", "PrincipalInvestigator": "S002"},
]

_PROJECT_STAFF = [
    {"ProjectNo": "GAP-002", "StaffName": "Anil Sharma"},
]


def test_staff_profile_unique_match():
    ans = run_analytics("staff_profile", {"name": "anil"},
                        _FakeMultiClient({"staff": _STAFF}))
    assert "Anil Sharma" in ans.text
    assert "Sr. Scientist" in ans.text
    assert "CMD" in ans.text
    assert "Rekha" not in ans.text


def test_staff_profile_ambiguous_lists_candidates():
    ans = run_analytics("staff_profile", {"name": "sharma"},
                        _FakeMultiClient({"staff": _STAFF}))
    assert "Anil Sharma" in ans.text
    assert "Rekha Sharma" in ans.text


def test_staff_profile_no_match_and_missing_param():
    client = _FakeMultiClient({"staff": _STAFF})
    assert "No staff member matching" in run_analytics("staff_profile", {"name": "zzz"}, client).text
    assert "No staff name supplied" in run_analytics("staff_profile", {}, client).text


def test_projects_for_staff_from_profile_facts():
    client = _FakeMultiClient({"staff": _STAFF, **_FACTS})
    ans = run_analytics("projects_for_staff", {"name": "anil sharma"}, client)
    assert "P-1" in ans.text and "P-2" in ans.text and "P-3" not in ans.text
    ans2 = run_analytics("projects_for_staff", {"name": "rekha"}, client)
    assert "P-2" in ans2.text and "P-3" in ans2.text


def test_projects_for_staff_never_guesses_between_two_people():
    ans = run_analytics("projects_for_staff", {"name": "sharma"},
                        _FakeMultiClient({"staff": _STAFF, **_FACTS}))
    assert "2 staff match" in ans.text and "P-1" not in ans.text


def test_staff_profile_counts_the_linked_record():
    ans = run_analytics("staff_profile", {"name": "anil"}, _FakeMultiClient({"staff": _STAFF, **_FACTS}))
    assert "2 projects, 1 publications" in ans.text


def test_projects_for_staff_unknown_person():
    client = _FakeMultiClient({"staff": _STAFF, **_FACTS})
    assert "No staff member matching" in run_analytics(
        "projects_for_staff", {"name": "zzz"}, client).text


_DIVISIONS = [
    {"divCode": "CMD", "divName": "Composites & Materials", "divHoD": "Anil Sharma",
     "divCurrentStrength": 12, "divSanctionedstrength": 15},
]


def test_division_summary():
    client = _FakeMultiClient({"divisions": _DIVISIONS, "staff": _STAFF,
                               "projects": _PROJECTS})
    ans = run_analytics("division_summary", {"division_code": "cmd"}, client)
    assert "Composites & Materials" in ans.text
    assert "Anil Sharma" in ans.text          # HoD
    assert "strength 12/15" in ans.text
    assert "staff on record: 1" in ans.text   # only Anil is in CMD
    assert "Ongoing: 1" in ans.text           # GAP-001


def test_division_summary_unknown_code_and_missing_param():
    client = _FakeMultiClient({"divisions": _DIVISIONS})
    assert "No division with code" in run_analytics(
        "division_summary", {"division_code": "XXX"}, client).text
    assert "No division code supplied" in run_analytics(
        "division_summary", {}, client).text


def test_project_team_by_number():
    client = _FakeMultiClient({"projects": _PROJECTS, "staff": _STAFF,
                               "project_staff": _PROJECT_STAFF})
    ans = run_analytics("project_team", {"project_no": "GAP-002"}, client)
    assert "Alloy Study" in ans.text
    assert "PI: Rekha Sharma" in ans.text
    assert "Anil Sharma" in ans.text          # team member


def test_project_team_by_name_fragment():
    client = _FakeMultiClient({"projects": _PROJECTS, "staff": _STAFF,
                               "project_staff": _PROJECT_STAFF})
    ans = run_analytics("project_team", {"project_name": "composite"}, client)
    assert "GAP-001" in ans.text
    assert "PI: Anil Sharma" in ans.text


def test_project_team_not_found():
    client = _FakeMultiClient({"projects": _PROJECTS})
    assert "No project matching" in run_analytics(
        "project_team", {"project_no": "GAP-999"}, client).text


# ---------- typed payloads (RP1) — new entity functions ship structured data ----------

def test_staff_profile_typed_data():
    ans = run_analytics("staff_profile", {"name": "anil"},
                        _FakeMultiClient({"staff": _STAFF}))
    assert ans.data["staff"]["Name"] == "Anil Sharma"
    assert ans.data["staff"]["Division"] == "CMD"


def test_staff_profile_ambiguous_typed_candidates():
    ans = run_analytics("staff_profile", {"name": "sharma"},
                        _FakeMultiClient({"staff": _STAFF}))
    assert [c["Name"] for c in ans.data["candidates"]] == ["Anil Sharma", "Rekha Sharma"]


def test_projects_for_staff_typed_data():
    client = _FakeMultiClient({"staff": _STAFF, **_FACTS})
    ans = run_analytics("projects_for_staff", {"name": "anil sharma"}, client)
    assert ans.data["staff_name"] == "Anil Sharma"
    assert [p["ProjectID"] for p in ans.data["leads"]] == ["P-1"]
    assert [p["ProjectID"] for p in ans.data["member_of"]] == ["P-2"]


def test_division_summary_typed_data():
    client = _FakeMultiClient({"divisions": _DIVISIONS, "staff": _STAFF,
                               "projects": _PROJECTS})
    ans = run_analytics("division_summary", {"division_code": "cmd"}, client)
    assert ans.data["division"]["divCode"] == "CMD"
    assert ans.data["staff_count"] == 1
    assert ans.data["projects_by_status"] == {"Ongoing": 1}


def test_project_team_typed_data():
    client = _FakeMultiClient({"projects": _PROJECTS, "staff": _STAFF,
                               "project_staff": _PROJECT_STAFF})
    ans = run_analytics("project_team", {"project_no": "GAP-002"}, client)
    assert ans.data["project"]["ProjectNo"] == "GAP-002"
    assert ans.data["pi"] == "Rekha Sharma"
    assert ans.data["team"] == ["Anil Sharma"]


def test_parse_date_accepts_real_csir_formats():
    """Real HR/project records use dd.mm.yyyy and dd/mm/yyyy, not ISO. Parsing only
    ISO made succession risk skip every real staff row and answer from demo data."""
    from analytics import _parse_date
    from datetime import date
    assert _parse_date("1970-12-28") == date(1970, 12, 28)
    assert _parse_date("28.12.1970") == date(1970, 12, 28)
    assert _parse_date("28/12/1970") == date(1970, 12, 28)
    assert _parse_date("3.10.1967") == date(1967, 10, 3)
    assert _parse_date("") is None
    assert _parse_date(None) is None
    assert _parse_date("not a date") is None
    assert _parse_date("32.13.1970") is None


def test_expertise_key_prefers_specific_field_and_ignores_na():
    """Real records carry a specific 'Expertise' and a coarse 'CoreArea' bucket that
    dozens share; unknown expertise is the literal 'N/A'. Keying succession risk on
    CoreArea, or treating 'N/A' as a capability, finds nothing real."""
    from analytics import _expertise_key
    assert _expertise_key({"Expertise": "Radiation Shielding", "CoreArea": "Physics"}) == "radiation shielding"
    assert _expertise_key({"Expertise": "N/A", "CoreArea": "Material Science"}) == "material science"
    assert _expertise_key({"Expertise": "N/A", "CoreArea": ""}) == ""
    assert _expertise_key({}) == ""


class _FakeClient:
    """Minimal PostgREST stand-in: .table(name).select(cols).execute().data"""
    def __init__(self, rows): self._rows = rows
    def table(self, _name): return self
    def select(self, _cols): return self
    def execute(self):
        return type("R", (), {"data": self._rows})()


def test_expenditure_reports_absent_utilisation_not_zero_spend():
    """Blank utilisation is 'we do not hold the figure', not 'nothing was spent' —
    summing blanks printed a confident 0.0% against ~41 crore of real sanctions."""
    from analytics import _project_expenditure_summary
    rows = [{"DivisionCode": "FMCD", "SanctionedCost": "1000", "UtilizedAmount": ""},
            {"DivisionCode": "ARC", "SanctionedCost": "500", "UtilizedAmount": None}]
    text = _project_expenditure_summary({}, _FakeClient(rows)).text
    assert "not recorded" in text
    assert "0.0% utilization" not in text
    assert "1,500" in text          # sanctioned total still reported


def test_expenditure_percentage_covers_only_recorded_projects():
    from analytics import _project_expenditure_summary
    rows = [{"DivisionCode": "A", "SanctionedCost": "1000", "UtilizedAmount": "500"},
            {"DivisionCode": "B", "SanctionedCost": "1000", "UtilizedAmount": ""}]
    text = _project_expenditure_summary({}, _FakeClient(rows)).text
    assert "50.0% utilization" in text          # 500/1000, not 500/2000
    assert "recorded for 1 of 2" in text


def test_budget_variance_says_unassessable_rather_than_all_clear():
    """'No project breaches the threshold' over zero data reads as reassurance."""
    from analytics import _project_budget_variance
    rows = [{"ProjectNo": "P1", "ProjectName": "x", "ProjectStatus": "Active",
             "StartDate": "2024-01-01", "CompletioDate": "2027-01-01",
             "SanctionedCost": "1000", "UtilizedAmount": ""}]
    text = _project_budget_variance({}, _FakeClient(rows)).text
    assert "cannot be assessed" in text


def test_rows_paginates_beyond_postgrest_1000_row_cap():
    from analytics import _rows

    all_rows = [{"id": i} for i in range(2350)]

    class _PagedTable:
        def __init__(self, data, orders):
            self._data = data
            self._start = 0
            self._end = len(data) - 1
            self._order_col = None
            self._orders = orders

        def select(self, _cols):
            return self

        def order(self, col):
            self._order_col = col
            self._orders.append(col)
            return self

        def range(self, start, end):
            assert self._order_col is not None, "order() must be called before range()"
            self._start = start
            self._end = end
            return self

        def execute(self):
            # Simulate PostgREST capping any page to 1000 rows max
            hi = min(self._end + 1, self._start + 1000, len(self._data))
            return type("R", (), {"data": self._data[self._start:hi]})()

    class _PagedClient:
        def __init__(self, data):
            self._data = data
            self.calls = 0
            self.orders = []

        def table(self, _name):
            self.calls += 1
            return _PagedTable(self._data, self.orders)

    client = _PagedClient(all_rows)
    fetched = _rows(client, "staff", "id")
    assert len(fetched) == 2350
    assert fetched[0]["id"] == 0
    assert fetched[-1]["id"] == 2349
    assert client.calls == 3
    assert client.orders == ["ID", "ID", "ID"]


def test_division_summary_pushes_filters_to_query_builder():
    calls = []

    class _FilteringTable:
        def __init__(self, table_name):
            self._table = table_name
            self._eq = {}
            self._ilike = {}

        def select(self, _cols):
            return self

        def eq(self, col, val):
            self._eq[col] = val
            return self

        def ilike(self, col, val):
            self._ilike[col] = val
            return self

        def execute(self):
            calls.append((self._table, dict(self._eq), dict(self._ilike)))
            if self._table == "divisions":
                return type("R", (), {"data": [{
                    "divCode": "CMD", "divName": "Materials",
                    "divHoD": "Dr A", "divCurrentStrength": 5, "divSanctionedstrength": 8,
                }]})()
            if self._table == "staff":
                return type("R", (), {"data": [{"Division": "CMD"}]})()
            return type("R", (), {"data": [{"DivisionCode": "CMD", "ProjectStatus": "Ongoing"}]})()

    class _FilteringClient:
        def table(self, name):
            return _FilteringTable(name)

    ans = run_analytics("division_summary", {"division_code": "CMD"}, _FilteringClient())
    assert "CMD" in ans.text
    assert calls == [
        ("divisions", {}, {"divCode": "CMD"}),
        ("staff", {"Division": "CMD"}, {}),
        ("projects", {"DivisionCode": "CMD"}, {}),
    ]


class _PostgrestSimTable:
    """Filter-aware table evaluating eq, ilike, and or_ predicates like PostgREST."""

    def __init__(self, rows):
        self._rows = rows
        self._predicates = []

    def select(self, _cols):
        return self

    def _match_ilike(self, val, pattern):
        import re as _re
        text = str(val or "")
        # Unescape \% and \_ after building regex
        regex_parts = []
        i = 0
        while i < len(pattern):
            ch = pattern[i]
            if ch == "\\" and i + 1 < len(pattern):
                regex_parts.append(_re.escape(pattern[i + 1]))
                i += 2
            elif ch == "%":
                regex_parts.append(".*")
                i += 1
            elif ch == "_":
                regex_parts.append(".")
                i += 1
            else:
                regex_parts.append(_re.escape(ch))
                i += 1
        return _re.fullmatch("".join(regex_parts), text, _re.IGNORECASE | _re.DOTALL) is not None

    def _eval_clause(self, row, clause):
        # Supports col.eq.val, col.ilike.pat, col.in.("a","b")
        col, op, rest = clause.split(".", 2)
        if op == "eq":
            return str(row.get(col) or "") == rest
        if op == "ilike":
            return self._match_ilike(row.get(col), rest)
        if op == "in":
            assert rest.startswith("(") and rest.endswith(")")
            inner = rest[1:-1]
            vals = [v.strip().strip('"') for v in inner.split(",") if v.strip()]
            return str(row.get(col) or "") in vals
        raise AssertionError(f"Unsupported op: {op}")

    def eq(self, col, val):
        self._predicates.append(lambda r: str(r.get(col) or "") == str(val))
        return self

    def ilike(self, col, pattern):
        self._predicates.append(lambda r: self._match_ilike(r.get(col), pattern))
        return self

    def or_(self, expr):
        # Split on commas outside parentheses
        clauses, buf, depth = [], [], 0
        for ch in expr:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if ch == "," and depth == 0:
                clauses.append("".join(buf))
                buf = []
            else:
                buf.append(ch)
        if buf:
            clauses.append("".join(buf))
        self._predicates.append(lambda r: any(self._eval_clause(r, c) for c in clauses))
        return self

    def execute(self):
        data = [r for r in self._rows if all(p(r) for p in self._predicates)]
        return type("R", (), {"data": data})()


class _PostgrestSimClient:
    """Tables through the PostgREST filter simulator; rpc("staff_profile_facts")
    answers from `facts`, keyed by staff ID (the person's linked records)."""
    def __init__(self, tables, facts=None):
        self._tables = tables
        self._facts = facts or {}

    def table(self, name):
        return _PostgrestSimTable(self._tables.get(name, []))

    def rpc(self, name, params):
        assert name == "staff_profile_facts"
        return _PostgrestSimTable(self._facts.get(params["p_staff_id"], []))


def _project_fact(project_id, title, role):
    return {"section": "PROJECT", "record_id": project_id, "title": title, "role": role}


def test_staff_and_projects_lookup_by_lowercase_id_through_filters():
    client = _PostgrestSimClient({"staff": _STAFF}, facts={
        "S001": [_project_fact("P-1", "GAP-001 Alpha", "PI"), _project_fact("P-2", "GAP-002 Beta", "Team member")],
    })
    prof = run_analytics("staff_profile", {"name": "s001"}, client)
    assert "Anil Sharma" in prof.text
    projs = run_analytics("projects_for_staff", {"name": "s001"}, client)
    assert "GAP-001" in projs.text and "GAP-002" in projs.text


def test_projects_for_staff_counts_linked_records_only_not_name_matches():
    """20261113000005 / P2: projects come from the person's links. A project
    whose PI text merely resembles the name is not counted."""
    client = _PostgrestSimClient({
        "staff": [{"ID": "S001", "Name": "Sharma, Anil"}, {"ID": "S002", "Name": "Rekha Nair"}],
        "projects": [{"ProjectNo": "GAP-009", "ProjectName": "Name only", "PrincipalInvestigator": " Sharma, Anil "}],
    }, facts={"S001": [_project_fact("P-1", "GAP(001) Beta", "Team member")]})
    ans = run_analytics("projects_for_staff", {"name": "S001"}, client)
    assert "GAP(001)" in ans.text
    assert "GAP-009" not in ans.text

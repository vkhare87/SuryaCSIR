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


def test_expertise_search_ranks_by_field_matches():
    rows = [
        {"Name": "Dr A", "Designation": "Sci C", "Division": "CMD",
         "CoreArea": "Corrosion coatings", "Expertise": "corrosion, coatings"},
        {"Name": "Dr B", "Designation": "Sci B", "Division": "NST",
         "CoreArea": "Battery materials", "Expertise": "corrosion testing"},
        {"Name": "Dr C", "Designation": "Sci D", "Division": "EEC",
         "CoreArea": "Photonics", "Expertise": "optics"},
    ]
    ans = run_analytics("expertise_search", {"topic": "corrosion"}, _FakeClient(rows))
    assert "2 staff match" in ans.text
    # Dr A (both fields) ranks before Dr B (one field)
    assert ans.text.index("Dr A") < ans.text.index("Dr B")
    assert "Dr C" not in ans.text


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


def test_succession_risk_none():
    ans = run_analytics("expertise_succession_risk", {}, _FakeClient([]))
    assert "No unique-expertise succession risk" in ans.text


class _FakeMultiClient:
    """Per-table rows: _FakeMultiClient({'staff': [...], 'projects': [...]})."""
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeTable(self._tables.get(name, []))


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


def test_projects_for_staff_pi_by_name_and_id_plus_team_membership():
    client = _FakeMultiClient({"staff": _STAFF, "projects": _PROJECTS,
                               "project_staff": _PROJECT_STAFF})
    # Anil: PI of GAP-001, team member of GAP-002.
    ans = run_analytics("projects_for_staff", {"name": "anil sharma"}, client)
    assert "GAP-001" in ans.text and "GAP-002" in ans.text
    assert "GAP-003" not in ans.text
    # Rekha: PI of GAP-002 by name and GAP-003 by staff ID.
    ans2 = run_analytics("projects_for_staff", {"name": "rekha"}, client)
    assert "GAP-002" in ans2.text and "GAP-003" in ans2.text


def test_projects_for_staff_unknown_person():
    client = _FakeMultiClient({"staff": _STAFF, "projects": _PROJECTS,
                               "project_staff": _PROJECT_STAFF})
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
    client = _FakeMultiClient({"staff": _STAFF, "projects": _PROJECTS,
                               "project_staff": _PROJECT_STAFF})
    ans = run_analytics("projects_for_staff", {"name": "anil sharma"}, client)
    assert ans.data["staff_name"] == "Anil Sharma"
    assert [p["ProjectNo"] for p in ans.data["leads"]] == ["GAP-001"]
    assert [p["ProjectNo"] for p in ans.data["member_of"]] == ["GAP-002"]


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

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
    ans = run_analytics("project_expenditure_summary", {}, _FakeClient([]))
    assert "0.0% utilization" in ans.text


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

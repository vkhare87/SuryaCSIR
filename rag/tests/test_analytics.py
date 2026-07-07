import pytest
from analytics import run_analytics, ANALYTICS


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

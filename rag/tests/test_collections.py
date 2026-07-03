from corpus import build_collection_summaries
from llm import FakeLLM


def test_groups_by_entity_type_with_counts():
    rows = [
        {"entity_type": "project_report", "root_summary": "report one"},
        {"entity_type": "project_report", "root_summary": "report two"},
        {"entity_type": "publication", "root_summary": "paper one"},
    ]
    cols = {c["collection_key"]: c for c in build_collection_summaries(rows, FakeLLM())}
    assert set(cols) == {"project_report", "publication"}
    assert cols["project_report"]["document_count"] == 2
    assert cols["publication"]["document_count"] == 1
    assert cols["project_report"]["title"] == "Project Progress Reports"


def test_unknown_entity_type_titlecased():
    rows = [{"entity_type": "site_visit", "root_summary": "x"}]
    cols = build_collection_summaries(rows, FakeLLM())
    assert cols[0]["title"] == "Site Visit"

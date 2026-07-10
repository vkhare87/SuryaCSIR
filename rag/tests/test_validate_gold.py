import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eval"))

import validate_gold  # noqa: E402

CORPUS = [{
    "id": "d1", "title": "2024 Annual Report", "storage_path": "r.pdf",
    "tree": {"root": {"title": "2024 Annual Report", "summary": "", "nodes": [
        {"title": "Finance", "summary": "", "page_start": 1, "page_end": 10, "nodes": [
            {"title": "Budget Utilization", "summary": "", "page_start": 3, "page_end": 6, "nodes": []},
        ]},
    ]}},
}]


def test_labels_include_nested_children():
    labels = validate_gold.corpus_labels(CORPUS)
    assert "2024 annual report — budget utilization" in labels  # depth-2 node
    assert "2024 annual report — finance" in labels


def test_citation_case_resolvable_and_not():
    errs = validate_gold.check_citations(
        [{"question": "q", "expected_citation": "Budget Utilization"}], CORPUS, "f")
    assert errs == []
    errs = validate_gold.check_citations(
        [{"question": "q", "expected_citation": "Budgett Utilisation"}], CORPUS, "f")
    assert len(errs) == 1 and "Budget Utilization" in errs[0]  # suggests nearest


def test_citation_missing_fields():
    errs = validate_gold.check_citations([{"question": "q"}], CORPUS, "f")
    assert len(errs) == 1 and "expected_citation" in errs[0]


def test_duplication_case_checks_every_overlap():
    errs = validate_gold.check_duplication(
        [{"topic": "t", "overlapping": ["Finance", "No Such Node"]}], CORPUS, "f")
    assert len(errs) == 1 and "No Such Node" in errs[0]
    assert validate_gold.check_duplication(
        [{"topic": "t", "overlapping": ["finance"]}], CORPUS, "f") == []


def test_duplication_empty_overlapping_rejected():
    errs = validate_gold.check_duplication([{"topic": "t", "overlapping": []}], CORPUS, "f")
    assert len(errs) == 1


def test_router_mode_whitelist():
    errs = validate_gold.check_router([{"question": "q", "expected_mode": "documnet"}], "f")
    assert len(errs) == 1
    assert validate_gold.check_router(
        [{"question": "q", "expected_mode": "document"}], "f") == []


def test_duplicate_questions_flagged():
    errs = validate_gold.check_router(
        [{"question": "Same?", "expected_mode": "document"},
         {"question": "Same?", "expected_mode": "hybrid"}], "f")
    assert any("duplicate" in e for e in errs)


def test_load_jsonl_reports_line_numbers(tmp_path):
    p = tmp_path / "g.jsonl"
    p.write_text('{"ok": 1}\n\nnot json\n', encoding="utf-8")
    cases, errs = validate_gold.load_jsonl(str(p))
    assert len(cases) == 1 and len(errs) == 1 and ":3:" in errs[0]

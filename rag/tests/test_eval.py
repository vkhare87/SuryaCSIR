import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eval"))

from run_eval import run_eval  # noqa: E402
from llm import FakeLLM  # noqa: E402


def test_accuracy_perfect_when_convention_matches():
    cases = [
        {"question": "COUNT things", "expected_mode": "structured"},
        {"question": "what is X", "expected_mode": "document"},
    ]
    result = run_eval(cases, FakeLLM())
    assert result["total"] == 2
    assert result["mode_correct"] == 2
    assert result["accuracy"] == 1.0


def test_accuracy_counts_mismatches():
    cases = [{"question": "what is X", "expected_mode": "structured"}]  # FakeLLM -> document
    result = run_eval(cases, FakeLLM())
    assert result["accuracy"] == 0.0


from run_eval import run_citation_eval  # noqa: E402


def _corpus():
    return [{"id": "d1", "title": "2024 Annual Report", "storage_path": "r.pdf",
             "tree": {"root": {"nodes": [{"title": "Water Research Outcomes",
                                          "summary": "Membrane pilot succeeded.",
                                          "page_start": 2, "page_end": 3}]}}}]


def test_citation_eval_scores_hits():
    cases = [{"question": "What did the water pilot achieve?",
              "expected_citation": "water research outcomes"}]
    result = run_citation_eval(cases, _corpus(), FakeLLM())
    assert result == {"total": 1, "hits": 1, "hit_rate": 1.0}


def test_citation_eval_scores_misses():
    cases = [{"question": "What did the water pilot achieve?",
              "expected_citation": "completely different section"}]
    result = run_citation_eval(cases, _corpus(), FakeLLM())
    assert result["hits"] == 0

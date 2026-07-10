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


from run_eval import run_duplication_eval, avoided_duplication_cost  # noqa: E402


def _dup_corpus():
    # FakeLLM.pick always returns [0], so the first node is the sole match.
    return [{"id": "d1", "title": "2024 Project Report", "storage_path": "r.pdf",
             "tree": {"root": {"nodes": [
                 {"title": "Nanomaterials synthesis", "summary": "Prior nano work.",
                  "page_start": 1, "page_end": 4},
                 {"title": "Fly-ash bricks", "summary": "Unrelated.",
                  "page_start": 5, "page_end": 8}]}}}]


def test_duplication_eval_hit_scores_recall_and_precision():
    cases = [{"topic": "nano synthesis proposal",
              "overlapping": ["2024 Project Report — Nanomaterials synthesis"]}]
    r = run_duplication_eval(cases, _dup_corpus(), FakeLLM())
    assert r == {"cases": 1, "recall": 1.0, "precision": 1.0,
                 "expected": 1, "hits": 1, "returned": 1, "relevant": 1}


def test_duplication_eval_miss_scores_zero_recall_and_precision():
    # Expected item is the second node; FakeLLM returns only the first -> miss + noise.
    cases = [{"topic": "brick manufacturing proposal",
              "overlapping": ["2024 Project Report — Fly-ash bricks"]}]
    r = run_duplication_eval(cases, _dup_corpus(), FakeLLM())
    assert r["recall"] == 0.0
    assert r["precision"] == 0.0


def test_duplication_eval_empty_corpus():
    cases = [{"topic": "anything", "overlapping": ["x"]}]
    r = run_duplication_eval(cases, [], FakeLLM())
    assert r["recall"] == 0.0
    assert r["returned"] == 0


def test_avoided_duplication_cost():
    assert avoided_duplication_cost(0.7, 5_000_000, 2) == 7_000_000

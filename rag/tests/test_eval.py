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

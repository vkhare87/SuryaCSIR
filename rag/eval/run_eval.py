"""Offline eval harness for the Ask SURYA router. Scores router.route() against a gold set.

The seed gold.jsonl aligns with FakeLLM's 'COUNT'-prefix convention so `LLM_BACKEND=fake`
gives a 1.0 smoke score. Replace with real institute Q&A and run against OPENLLM for a
meaningful accuracy number. Retrieval-quality scoring (expected citation) is a T6+ follow-up."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from router import route  # noqa: E402
from retrieval import traverse  # noqa: E402
from llm import make_llm, REFUSAL_TEXT  # noqa: E402


def run_eval(cases, llm) -> dict:
    """Score router mode per case; cases flagged expect_refusal also assert that
    traversal over an empty corpus refuses (grounding invariant, zero citations)."""
    total = len(cases)
    correct = sum(1 for c in cases if route(c["question"], llm) == c["expected_mode"])
    refusal_cases = [c for c in cases if c.get("expect_refusal")]
    refusal_ok = 0
    for c in refusal_cases:
        ans = traverse([], c["question"], llm)
        if ans.text == REFUSAL_TEXT and ans.citations == []:
            refusal_ok += 1
    return {"total": total, "mode_correct": correct,
            "accuracy": (correct / total) if total else 0.0,
            "refusal_total": len(refusal_cases), "refusal_correct": refusal_ok}


def _load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    gold = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gold.jsonl")
    llm = make_llm(os.environ.get("LLM_BACKEND", "fake"),
                   os.environ.get("OPENLLM_BASE_URL", ""),
                   os.environ.get("OPENLLM_MODEL", ""))
    result = run_eval(_load(gold), llm)
    print(f"[eval] {result['mode_correct']}/{result['total']} "
          f"router mode correct (accuracy {result['accuracy']:.2f}); "
          f"refusal {result['refusal_correct']}/{result['refusal_total']}")


if __name__ == "__main__":
    main()

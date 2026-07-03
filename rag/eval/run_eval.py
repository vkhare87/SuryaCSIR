"""Offline eval harness for the Ask SURYA router. Scores router.route() against a gold set.

The seed gold.jsonl aligns with FakeLLM's 'COUNT'-prefix convention so `LLM_BACKEND=fake`
gives a 1.0 smoke score. Replace with real institute Q&A and run against OPENLLM for a
meaningful accuracy number. Retrieval-quality scoring (expected citation) is a T6+ follow-up."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from router import route  # noqa: E402
from llm import make_llm  # noqa: E402


def run_eval(cases, llm) -> dict:
    total = len(cases)
    correct = sum(1 for c in cases if route(c["question"], llm) == c["expected_mode"])
    return {"total": total, "mode_correct": correct,
            "accuracy": (correct / total) if total else 0.0}


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
          f"router mode correct (accuracy {result['accuracy']:.2f})")


if __name__ == "__main__":
    main()

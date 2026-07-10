"""Offline eval harness for the Ask SURYA router. Scores router.decide() route labels
(structured | document | hybrid) against gold.jsonl.

gold.jsonl holds realistic institute questions, so the accuracy number is meaningful
only with `LLM_BACKEND=openllm` on the host. Under the default FakeLLM, only the
prefix-convention cases ('COUNT…', 'How many…', 'HYBRID…') route structured/hybrid —
the smoke score is a floor, not the metric.

Citation eval (retrieval-accuracy metric): runs automatically when corpus.json +
gold_citations.jsonl exist next to this file. Corpus dump (run on host, service role):
  select json_agg(json_build_object('id', d.id, 'title', d.title,
         'storage_path', d.storage_path, 'tree', i.tree))
  from doc_indexes i join documents d on d.id = i.document_id;
Save the result as rag/eval/corpus.json."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from router import decide  # noqa: E402
from retrieval import traverse  # noqa: E402
from analytics import CATALOG  # noqa: E402
from llm import make_llm, REFUSAL_TEXT  # noqa: E402
from query_service import similar_matches  # noqa: E402


def run_eval(cases, llm) -> dict:
    """Score router mode per case; cases flagged expect_refusal also assert that
    traversal over an empty corpus refuses (grounding invariant, zero citations)."""
    total = len(cases)
    correct = sum(1 for c in cases
                  if decide(c["question"], llm, CATALOG)["route"] == c["expected_mode"])
    refusal_cases = [c for c in cases if c.get("expect_refusal")]
    refusal_ok = 0
    for c in refusal_cases:
        ans = traverse([], c["question"], llm)
        if ans.text == REFUSAL_TEXT and ans.citations == []:
            refusal_ok += 1
    return {"total": total, "mode_correct": correct,
            "accuracy": (correct / total) if total else 0.0,
            "refusal_total": len(refusal_cases), "refusal_correct": refusal_ok}


def run_citation_eval(cases, corpus, llm) -> dict:
    """Retrieval-accuracy metric (dissertation target: >=80%). A case hits when any
    returned citation's 'title — node_title' contains expected_citation (case-insensitive)."""
    hits = 0
    for c in cases:
        ans = traverse(corpus, c["question"], llm)
        labels = [f"{ct.title} — {ct.node_title}".lower() for ct in ans.citations]
        if any(c["expected_citation"].lower() in label for label in labels):
            hits += 1
    total = len(cases)
    return {"total": total, "hits": hits, "hit_rate": (hits / total) if total else 0.0}


def run_duplication_eval(cases, corpus, llm) -> dict:
    """Duplication-detection metric (dissertation targets: recall >=70%, precision >=60%).
    Each case seeds a proposed topic and the 'title — node_title' substrings of the
    corpus items known to overlap it. Micro-averaged across cases."""
    expected_total = hit_total = returned_total = relevant_returned = 0
    for c in cases:
        matches = similar_matches(corpus, c["topic"], llm)
        labels = [f"{m['title']} — {m['node_title']}".lower() for m in matches]
        expected = [e.lower() for e in c["overlapping"]]
        expected_total += len(expected)
        hit_total += sum(1 for e in expected if any(e in lb for lb in labels))
        returned_total += len(labels)
        relevant_returned += sum(1 for lb in labels if any(e in lb for e in expected))
    return {"cases": len(cases),
            "recall": (hit_total / expected_total) if expected_total else 0.0,
            "precision": (relevant_returned / returned_total) if returned_total else 0.0,
            "expected": expected_total, "hits": hit_total,
            "returned": returned_total, "relevant": relevant_returned}


def avoided_duplication_cost(recall: float, avg_cost: float, attempts_per_year: float) -> float:
    """A2 financial metric: expected annual cost avoidance from duplication detection.
    = recall x average sanctioned project cost x duplicate attempts caught per year."""
    return recall * avg_cost * attempts_per_year


def _load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    gold = os.path.join(base, "gold.jsonl")
    llm = make_llm(os.environ.get("LLM_BACKEND", "fake"),
                   os.environ.get("OPENLLM_BASE_URL", ""),
                   os.environ.get("OPENLLM_MODEL", ""))
    result = run_eval(_load(gold), llm)
    print(f"[eval] {result['mode_correct']}/{result['total']} "
          f"router mode correct (accuracy {result['accuracy']:.2f}); "
          f"refusal {result['refusal_correct']}/{result['refusal_total']}")

    corpus_path = os.path.join(base, "corpus.json")
    gold_cit = os.path.join(base, "gold_citations.jsonl")
    if os.path.exists(corpus_path) and os.path.exists(gold_cit):
        with open(corpus_path, encoding="utf-8") as f:
            corpus = json.load(f)
        cit = run_citation_eval(_load(gold_cit), corpus, llm)
        print(f"[eval] citation hit-rate {cit['hits']}/{cit['total']} "
              f"({cit['hit_rate']:.2f}; dissertation target >= 0.80)")

    gold_dup = os.path.join(base, "gold_duplication.jsonl")
    if os.path.exists(corpus_path) and os.path.exists(gold_dup):
        with open(corpus_path, encoding="utf-8") as f:
            corpus = json.load(f)
        dup = run_duplication_eval(_load(gold_dup), corpus, llm)
        print(f"[eval] duplication recall {dup['hits']}/{dup['expected']} "
              f"({dup['recall']:.2f}; target >= 0.70), "
              f"precision {dup['relevant']}/{dup['returned']} "
              f"({dup['precision']:.2f}; target >= 0.60)")
        avg_cost = float(os.environ.get("AVG_PROJECT_COST_INR", "0"))
        if avg_cost > 0:
            attempts = float(os.environ.get("DUPLICATE_ATTEMPTS_PER_YEAR", "1"))
            saved = avoided_duplication_cost(dup["recall"], avg_cost, attempts)
            print(f"[eval] expected annual duplication cost avoidance: "
                  f"INR {saved:,.0f} (recall x {avg_cost:,.0f} x {attempts:g}/yr)")


if __name__ == "__main__":
    main()

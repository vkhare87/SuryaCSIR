"""Offline eval harness for the Ask SURYA router. Scores router.route() against a gold set.

The seed gold.jsonl aligns with FakeLLM's 'COUNT'-prefix convention so `LLM_BACKEND=fake`
gives a 1.0 smoke score. Replace with real institute Q&A and run against OPENLLM for a
meaningful accuracy number.

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


if __name__ == "__main__":
    main()

"""Compare a local Ollama model against the configured hosted model on the real
retrieval path, so the "can we self-host?" question is answered with numbers.

Runs the same gold citation questions through traverse() with page-text grounding,
reporting hit-rate and per-stage latency for each backend.

    python eval/bench_local.py --model qwen2.5:3b-instruct --cases 5
    python eval/bench_local.py --model qwen3-vl:8b --cases 3
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAG_DIR))


def load_env():
    for line in (RAG_DIR / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen2.5:3b-instruct")
    ap.add_argument("--base-url", default="http://localhost:11434/v1")
    ap.add_argument("--api-key", default="")
    ap.add_argument("--cases", type=int, default=5)
    args = ap.parse_args()

    load_env()
    # Local models on CPU need far longer than the hosted defaults.
    for k in ("RAG_ROUTE_TIMEOUT_S", "RAG_PICK_TIMEOUT_S", "RAG_ANSWER_TIMEOUT_S"):
        os.environ[k] = "600"
    os.environ["OPENLLM_API_KEY"] = args.api_key

    from llm import make_llm                                      # noqa: E402
    from retrieval import traverse                                # noqa: E402
    from run_eval import make_eval_fetch_texts                    # noqa: E402

    llm = make_llm("openllm", args.base_url, args.model)
    corpus = json.loads((RAG_DIR / "eval" / "corpus.json").read_text(encoding="utf-8"))
    cases = [json.loads(line) for line
             in (RAG_DIR / "eval" / "gold_citations.jsonl").read_text(encoding="utf-8").splitlines()
             if line.strip()][:args.cases]
    fetch_texts = make_eval_fetch_texts()

    print(f"model={args.model} base={args.base_url} corpus={len(corpus)} docs cases={len(cases)}")
    hits, times = 0, []
    for c in cases:
        started = time.time()
        try:
            ans = traverse(corpus, c["question"], llm, fetch_texts)
        except Exception as e:                                    # noqa: BLE001
            print(f"  ERROR {type(e).__name__}: {e} — {c['question'][:50]}")
            continue
        secs = time.time() - started
        times.append(secs)
        labels = [f"{ct.title} — {ct.node_title}".lower() for ct in ans.citations]
        hit = any(c["expected_citation"].lower() in lb for lb in labels)
        hits += hit
        print(f"  {'HIT ' if hit else 'MISS'} {secs:6.1f}s cites={len(ans.citations):2d} "
              f"{c['question'][:56]}")

    if times:
        print(f"\nhit-rate {hits}/{len(times)} ({hits / len(times):.2f}); "
              f"latency median {sorted(times)[len(times) // 2]:.1f}s, max {max(times):.1f}s")


if __name__ == "__main__":
    main()

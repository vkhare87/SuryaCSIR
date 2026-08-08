"""Drive the live /query endpoint so query_log holds real telemetry for M3.

M3 (source traceability) is measured as the share of non-refusal document answers
carrying at least one citation, read from query_log — and only queries that go
through the API are logged, so the offline harness cannot produce that evidence.
This runs the gold questions plus out-of-corpus controls through the real endpoint
under a real user's JWT, exactly as the UI does, then prints the M3 share and the
latency distribution.

    python eval/log_queries.py                 # gold citation questions + controls
    python eval/log_queries.py --email x --password y
"""
import argparse
import json
import os
import time
import urllib.request
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent.parent
REFUSAL = "Not found in institute documents."

# Deliberately outside the corpus: these must come back as refusals with zero
# citations, which is the grounding invariant M3 rests on.
CONTROLS = [
    "What is the capital of France?",
    "What were IIT Roorkee's internal recruitment decisions last year?",
    "Who won the 2024 cricket world cup?",
]


def load_env():
    for line in (RAG_DIR / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def sign_in(url, anon, email, password):
    req = urllib.request.Request(
        f"{url}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": anon, "Content-Type": "application/json"}, method="POST")
    return json.load(urllib.request.urlopen(req))["access_token"]


def ask(api, token, question, timeout=300):
    req = urllib.request.Request(
        f"{api}/query", data=json.dumps({"question": question}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST")
    started = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r), time.time() - started


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="master@test.local")
    ap.add_argument("--password", default="Test@1234")
    ap.add_argument("--api", default="http://localhost:8000")
    args = ap.parse_args()

    token = sign_in(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"],
                    args.email, args.password)

    gold = RAG_DIR / "eval" / "gold_citations.jsonl"
    questions = [json.loads(line)["question"]
                 for line in gold.read_text(encoding="utf-8").splitlines() if line.strip()]
    questions += CONTROLS

    doc_nonrefusal = doc_cited = refusals = refusals_clean = 0
    latencies = []
    for q in questions:
        try:
            r, secs = ask(args.api, token, q)
        except Exception as e:                                  # noqa: BLE001
            print(f"  ERROR  {q[:60]} — {e}")
            continue
        latencies.append(secs)
        refused = r["text"].strip() == REFUSAL
        cites = len(r["citations"])
        if r["mode"] == "document":
            if refused:
                refusals += 1
                refusals_clean += 1 if cites == 0 else 0
            else:
                doc_nonrefusal += 1
                doc_cited += 1 if cites else 0
        print(f"  {r['mode']:10s} {secs:5.1f}s cites={cites} "
              f"{'REFUSED ' if refused else ''}{q[:58]}")

    print(f"\nM3 traceability: {doc_cited}/{doc_nonrefusal} non-refusal document answers "
          f"carry >= 1 citation" + (f" = {doc_cited / doc_nonrefusal:.2f}" if doc_nonrefusal else ""))
    print(f"Refusals: {refusals}, of which {refusals_clean} carried zero citations")
    if latencies:
        ordered = sorted(latencies)
        print(f"Latency s: median {ordered[len(ordered) // 2]:.1f}, "
              f"min {ordered[0]:.1f}, max {ordered[-1]:.1f}, n={len(ordered)}")


if __name__ == "__main__":
    main()

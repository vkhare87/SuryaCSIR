"""Exercise every dissertation use case (UC-1..UC-7) through the live API.

One representative question per use case, asked exactly as a user would, under a
real JWT. Prints the routed mode, latency, citation count and the answer, so a
use case that silently stops working is visible rather than assumed.

    python eval/uc_check.py
"""
import json
import os
import time
import urllib.request
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent.parent
REFUSAL = "Not found in institute documents."

# (use case, question, what a passing answer looks like)
CASES = [
    ("UC-1 portfolio", "What is the total sanctioned cost versus utilised amount across all projects?",
     "structured; names the projects table"),
    ("UC-1 budget variance", "Which projects are overspending relative to their timeline?",
     "structured; budget-variance function"),
    ("UC-1 portfolio mix", "How many projects does each division run?", "structured"),
    ("UC-3 expertise", "Who has worked on red mud based materials?", "structured; expertise search"),
    ("UC-3 succession", "Which retiring scientists hold expertise no one else covers?",
     "structured; succession-risk function"),
    ("UC-5 patents", "How many patents are filed, published and granted?", "structured; patent pipeline"),
    ("UC-5 transfers", "What is the total value of technology transfer agreements?", "structured"),
    ("UC-5 MOUs", "Which MOUs are active and which expire in the next 90 days?", "structured"),
    ("UC-7 document", "Which AMPRI technologies were licensed to companies between January 2020 and February 2021?",
     "document; >=1 citation"),
    ("UC-7 document", "What are CSIR's ongoing Mission Mode Projects?", "document; >=1 citation"),
    ("UC-7 refusal", "What is the capital of France?", "refusal; zero citations"),
    ("UC-2/UC-4 similar", "__SIMILAR__Red mud based radiation shielding tiles for X-ray attenuation",
     "similar-work matches with citations"),
]


def load_env():
    for line in (RAG_DIR / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def post(url, payload, token, timeout=300):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST")
    started = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r), time.time() - started


def main():
    load_env()
    api = os.environ.get("RAG_API", "http://localhost:8000")
    req = urllib.request.Request(
        f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": "master@test.local", "password": "Test@1234"}).encode(),
        headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Content-Type": "application/json"},
        method="POST")
    token = json.load(urllib.request.urlopen(req))["access_token"]

    for label, question, expectation in CASES:
        if question.startswith("__SIMILAR__"):
            topic = question.replace("__SIMILAR__", "")
            try:
                r, secs = post(f"{api}/similar", {"text": topic}, token)
            except Exception as e:                                # noqa: BLE001
                print(f"\n{label}\n  FAILED {type(e).__name__}: {e}")
                continue
            matches = r.get("matches", r if isinstance(r, list) else [])
            print(f"\n{label}  [{expectation}]\n  {secs:5.1f}s  matches={len(matches)}")
            for m in matches[:4]:
                print(f"    - {m.get('title')} — {m.get('node_title')} (p.{m.get('page_start')})")
            continue

        try:
            r, secs = post(f"{api}/query", {"question": question}, token)
        except Exception as e:                                    # noqa: BLE001
            print(f"\n{label}\n  Q: {question}\n  FAILED {type(e).__name__}: {e}")
            continue
        refused = r["text"].strip() == REFUSAL
        fn = (r.get("trace") or {}).get("function")
        print(f"\n{label}  [{expectation}]")
        print(f"  Q: {question}")
        print(f"  -> mode={r['mode']} fn={fn} {secs:5.1f}s cites={len(r['citations'])}"
              f"{' REFUSED' if refused else ''}")
        print(f"  {r['text'][:260]}")


if __name__ == "__main__":
    main()

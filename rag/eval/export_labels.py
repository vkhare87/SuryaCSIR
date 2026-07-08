"""Append admin-labeled routes (route_labels table) to the router gold set.

Run on the host with the service key (labels are institute data, the gold set
lives in the repo):

    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python eval/export_labels.py

Skips questions already present in gold.jsonl, so re-running is idempotent.
"""

import json
import os
import sys
from pathlib import Path

GOLD = Path(__file__).parent / "gold.jsonl"


def export(rows, gold_path=GOLD) -> int:
    existing = set()
    if gold_path.exists():
        with open(gold_path, encoding="utf-8") as f:
            existing = {json.loads(line)["question"] for line in f if line.strip()}
    added = 0
    with open(gold_path, "a", encoding="utf-8") as f:
        for r in rows:
            if r["question"] in existing:
                continue
            f.write(json.dumps({"question": r["question"],
                                "expected_mode": r["correct_route"]}) + "\n")
            existing.add(r["question"])
            added += 1
    return added


def main():
    from supabase import create_client
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    rows = (client.table("route_labels")
            .select("question, correct_route").execute().data) or []
    n = export(rows)
    print(f"[eval] appended {n} labeled case(s) to {GOLD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

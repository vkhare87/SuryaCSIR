"""Queue a document into the RAG ingestion pipeline — one command, for demos.

The worker must already be running:

    rag/.venv/Scripts/python.exe rag/run_worker.py

Then, in another terminal:

    # queue a PDF from disk
    python scripts/queue_demo_document.py --file "C:/path/to/report.pdf" --title "Q3 Progress Report"

    # or re-use a PDF already in the documents bucket (no local file needed)
    python scripts/queue_demo_document.py --clone-smallest --title "DEMO — Ingestion Demo"

    # watch it move pending -> processing -> indexed
    python scripts/queue_demo_document.py --watch

    # remove everything this script created
    python scripts/queue_demo_document.py --cleanup

Every row it inserts is titled with a DEMO- prefix unless you pass --title, and
--cleanup only ever removes rows whose storage_path sits under demo/.
"""
import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent.parent / "rag"
DEMO_PREFIX = "demo/"


def load_env():
    for line in (RAG_DIR / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def client():
    from supabase import create_client
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("rag/.env must define SUPABASE_URL and SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def template_row(c):
    """An existing document supplies the not-null columns (owner, entity) we must copy."""
    rows = c.table("documents").select("*").limit(1).execute().data
    if not rows:
        raise SystemExit("no existing document to copy owner/entity metadata from")
    return rows[0]


def smallest_existing(c):
    rows = c.table("documents").select("storage_path,file_size").execute().data
    rows = [r for r in rows if not (r["storage_path"] or "").startswith(DEMO_PREFIX)]
    if not rows:
        raise SystemExit("no source document available to clone")
    return min(rows, key=lambda r: int(r["file_size"] or 0))["storage_path"]


def queue(c, blob: bytes, dest_name: str, title: str) -> str:
    dest = f"{DEMO_PREFIX}{dest_name}"
    store = c.storage.from_("documents")
    try:                                   # replace any earlier copy at this path
        store.remove([dest])
    except Exception:                      # noqa: BLE001 - absent object is fine
        pass
    store.upload(dest, blob, {"content-type": "application/pdf", "upsert": "true"})

    # storage_path is unique per bucket, so clear a stale row before re-inserting.
    c.table("documents").delete().eq("storage_path", dest).execute()
    t = template_row(c)
    row = {
        "title": title,
        "file_name": dest_name,
        "storage_bucket": "documents",
        "storage_path": dest,
        "mime_type": "application/pdf",
        "file_size": len(blob),
        "owner_id": t["owner_id"],
        "entity_type": t["entity_type"],
        "entity_id": t["entity_id"],
        "doc_type": t["doc_type"],
        "access_tier": "institute",
        "ingest_status": "pending",
        "ingest_attempts": 0,
    }
    doc = c.table("documents").insert(row).execute().data[0]
    print(f"queued  {doc['id']}  status=pending  path={dest}")
    return doc["id"]


def watch(c, doc_id: str | None = None, timeout_s: int = 300):
    """Print each status change until the document leaves the queue."""
    seen = None
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        q = c.table("documents").select("id,title,ingest_status,ingest_error")
        rows = (q.eq("id", doc_id) if doc_id
                else q.like("storage_path", f"{DEMO_PREFIX}%")).execute().data
        if not rows:
            print("no queued demo document found")
            return
        status = rows[0]["ingest_status"]
        if status != seen:
            print(f"{datetime.now():%H:%M:%S}  {status}")
            seen = status
        if status in ("indexed", "failed", "skipped"):
            if rows[0].get("ingest_error"):
                print("error:", rows[0]["ingest_error"])
            idx = (c.table("doc_indexes").select("page_count,built_at")
                   .eq("document_id", rows[0]["id"]).execute().data)
            if idx:
                print(f"index: {idx[0]['page_count']} page(s), built {idx[0]['built_at']}")
            return
        time.sleep(3)
    print(f"still {seen} after {timeout_s}s — is the worker running? (rag/run_worker.py)")


def cleanup(c):
    rows = (c.table("documents").select("id,storage_path")
            .like("storage_path", f"{DEMO_PREFIX}%").execute().data)
    for r in rows:
        c.table("documents").delete().eq("id", r["id"]).execute()
        try:
            c.storage.from_("documents").remove([r["storage_path"]])
        except Exception:                  # noqa: BLE001
            pass
        print("removed", r["storage_path"])
    if not rows:
        print("nothing to clean up")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="PDF on disk to ingest")
    ap.add_argument("--clone-smallest", action="store_true",
                    help="re-use the smallest PDF already in the bucket")
    ap.add_argument("--title", default="DEMO — Ingestion Pipeline Demonstration")
    ap.add_argument("--watch", action="store_true", help="follow status until it settles")
    ap.add_argument("--cleanup", action="store_true", help="remove every demo/ document")
    args = ap.parse_args()

    load_env()
    c = client()

    if args.cleanup:
        cleanup(c)
        return

    doc_id = None
    if args.file:
        p = Path(args.file)
        if not p.exists():
            raise SystemExit(f"no such file: {p}")
        doc_id = queue(c, p.read_bytes(), p.name, args.title)
    elif args.clone_smallest:
        src = smallest_existing(c)
        blob = c.storage.from_("documents").download(src)
        doc_id = queue(c, blob, "DEMO_ingestion_pipeline_demo.pdf", args.title)
    elif not args.watch:
        ap.error("pass --file, --clone-smallest, --watch, or --cleanup")

    watch(c, doc_id)


if __name__ == "__main__":
    sys.exit(main())

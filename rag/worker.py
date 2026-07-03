import os
import sys
import time

from config import load_config
from parse import parse_pdf
from pageindex import build_tree
from ocr import make_ocr
from llm import make_llm
from corpus import build_collection_summaries


def process_document(doc, db, ocr, llm) -> None:
    try:
        if doc.mime_type != "application/pdf":
            db.mark(doc.id, "skipped")
            return
        data = db.download(doc.storage_bucket, doc.storage_path)
        parsed = parse_pdf(data, ocr)
        tree = build_tree(parsed, llm, doc.title)
        db.save_index(doc.id, tree, getattr(llm, "model", "unknown"), len(parsed.pages))
        db.mark(doc.id, "indexed")
    except Exception as e:  # per-doc isolation: never halt the loop
        db.mark(doc.id, "failed", str(e))


def run_once(db, ocr, llm) -> int:
    count = 0
    while True:
        doc = db.claim_pending()
        if doc is None:
            return count
        process_document(doc, db, ocr, llm)
        count += 1


def build_collections(db, llm) -> int:
    """Rebuild collection_indexes from the current doc_indexes root summaries."""
    rows = db.fetch_index_summaries()
    collections = build_collection_summaries(rows, llm)
    db.save_collections(collections, getattr(llm, "model", "unknown"))
    return len(collections)


def main():
    cfg = load_config(os.environ)
    ocr = make_ocr(cfg.ocr_backend)
    llm = make_llm(cfg.llm_backend, cfg.openllm_base_url, cfg.openllm_model)
    from db import SupabaseDB
    db = SupabaseDB(cfg)
    if "--build-collections" in sys.argv:
        n = build_collections(db, llm)
        print(f"[rag] built {n} collection index(es)", flush=True)
        return
    once = "--once" in sys.argv
    while True:
        n = run_once(db, ocr, llm)
        print(f"[rag] processed {n} document(s)", flush=True)
        if once:
            return
        time.sleep(cfg.poll_interval_s)


if __name__ == "__main__":
    main()

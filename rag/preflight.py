"""Host preflight for the E2E deployment day (deploy/README.md).
Run BEFORE installing services:  py -3.12 preflight.py --worker|--api
Prints [ok]/[FAIL]/[skip] per prerequisite; exit 1 if any [FAIL]."""

import json
import os
import shutil
import subprocess
import sys
import urllib.request

from config import REQUIRED

# Table/column -> baseline migration that ships it (2026-07-12 restructure).
# Extend when new post-baseline migrations land.
_RAG_BASELINE = "20260712000008_rag_documents.sql"
_HR_BASELINE = "20260712000003_hr_core.sql"

SCHEMA_PROBES = [
    ("documents", "id, ingest_attempts", _RAG_BASELINE),
    ("doc_indexes", "document_id", _RAG_BASELINE),
    ("doc_pages", "document_id", _RAG_BASELINE),
    ("query_log", "id, latency_ms", _RAG_BASELINE),
    ("route_labels", "query_id", _RAG_BASELINE),
    ("collection_indexes", "collection_key", _RAG_BASELINE),
    # structured-analytics sources (analytics.py reads these HR tables)
    ("mous", "status, valid_until", _HR_BASELINE),
    ("tech_transfers", "status, value_lakhs", _HR_BASELINE),
    ("phd_milestones", "milestone, due_date, completed_date", _HR_BASELINE),
]

_MIGRATION_HINTS = {  # substring of the error -> migration that ships it
    "route_labels": _RAG_BASELINE,
    "doc_pages": _RAG_BASELINE,
    "latency_ms": _RAG_BASELINE,
    "ingest_attempts": _RAG_BASELINE,
    "collection_indexes": _RAG_BASELINE,
    "query_log": _RAG_BASELINE,
    "doc_indexes": _RAG_BASELINE,
    "documents": _RAG_BASELINE,
    "mous": _HR_BASELINE,
    "tech_transfers": _HR_BASELINE,
    "phd_milestones": _HR_BASELINE,
}


def required_env(mode):
    keys = list(REQUIRED)
    if mode == "api":
        keys.remove("SUPABASE_SERVICE_KEY")
    return keys


def check_python(version_info):
    if version_info[:2] == (3, 12):
        return True, f"Python {'.'.join(map(str, version_info[:3]))}"
    return False, (f"Python {'.'.join(map(str, version_info[:3]))} — need 3.12 "
                   "(PyMuPDF ships no 3.13/3.14 wheel; see deploy/README.md §2)")


def check_env(env, mode):
    missing = [k for k in required_env(mode) if not env.get(k)]
    if missing:
        return False, "missing: " + ", ".join(missing)
    return True, f"all {len(required_env(mode))} vars set ({mode} mode)"


def check_native_imports():
    """Import fitz/pydantic_core in a SUBPROCESS: under WDAC the import can
    hard-kill the process, so an inline import would kill preflight itself."""
    proc = subprocess.run(
        [sys.executable, "-c", "import fitz, pydantic_core; print('ok')"],
        capture_output=True, text=True, timeout=60)
    if proc.returncode == 0 and "ok" in proc.stdout:
        return True, "fitz + pydantic_core import cleanly"
    return False, ("native DLLs blocked or missing — WDAC must allow "
                   "site-packages DLLs (deploy/README.md §1). "
                   f"stderr: {proc.stderr.strip()[:200]}")


def check_model_listed(models_payload, model):
    ids = [m.get("id", "") for m in models_payload.get("data", [])]
    if model in ids:
        return True, f"'{model}' is served"
    return False, f"'{model}' not in {ids} — run: ollama pull {model}"


def check_ollama(base_url, model):
    try:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/models", timeout=10) as r:
            return check_model_listed(json.load(r), model)
    except Exception as e:
        return False, f"cannot reach {base_url}/models — is the Ollama service running? ({e})"


def classify_probe_error(message):
    for key, migration in _MIGRATION_HINTS.items():
        if key in message:
            return False, (f"'{key}' missing — run supabase db push "
                           f"(ships in supabase/migrations/{migration})")
    return False, message[:200]


def check_schema(client):
    failures = []
    for table, cols, _migration in SCHEMA_PROBES:
        try:
            client.table(table).select(cols).limit(1).execute()
        except Exception as e:
            failures.append(classify_probe_error(str(e))[1])
    if failures:
        return False, "; ".join(failures)
    return True, f"all {len(SCHEMA_PROBES)} tables/columns present"


def check_tesseract():
    path = shutil.which("tesseract")
    if path:
        return True, path
    return False, "tesseract not on PATH — scanned PDFs will fail (deploy/README.md §2.4)"


def main():
    mode = "api" if "--api" in sys.argv else "worker"
    env = os.environ
    results = [("python 3.12", *check_python(sys.version_info)),
               (f"env ({mode})", *check_env(env, mode)),
               ("native DLLs", *check_native_imports())]

    if env.get("LLM_BACKEND") == "openllm" and env.get("OPENLLM_BASE_URL"):
        results.append(("ollama", *check_ollama(env["OPENLLM_BASE_URL"],
                                                env.get("OPENLLM_MODEL", ""))))
    else:
        results.append(("ollama", None, "LLM_BACKEND != openllm — skipped"))

    if mode == "worker" and env.get("SUPABASE_URL") and env.get("SUPABASE_SERVICE_KEY"):
        from supabase import create_client
        client = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
        results.append(("db schema", *check_schema(client)))
    else:
        results.append(("db schema", None, "api mode / env missing — skipped (anon key can't distinguish RLS-denied from missing)"))

    if env.get("OCR_BACKEND") == "tesseract":
        results.append(("tesseract", *check_tesseract()))
    else:
        results.append(("tesseract", None, "OCR_BACKEND != tesseract — skipped"))

    failed = False
    for name, ok, detail in results:
        tag = "ok" if ok else ("skip" if ok is None else "FAIL")
        failed = failed or ok is False
        print(f"[{tag:4}] {name}: {detail}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

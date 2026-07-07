# T4 — RAG Ingestion MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain the `documents.ingest_status='pending'` queue with a standalone Python worker that parses each document, builds a hierarchical PageIndex tree, stores it in a new `doc_indexes` table, and surfaces pipeline health in a minimal admin page.

**Architecture:** New top-level `rag/` Python package (own venv, not in the npm build) running a polling loop. LLM summarization and OCR sit behind adapters with deterministic fakes so the entire pipeline runs and tests offline. A `doc_indexes` migration + admin-only requeue RPC store output; a `/admin/rag` SPA page monitors and retries.

**Tech Stack:** Python 3.11+, PyMuPDF (fitz), pytesseract, supabase-py, pytest. SPA side: React 19 + TS, supabase-js, Tailwind 4.

## Global Constraints

- Worker lives in `rag/` at repo root — sibling of `src/` and `scripts/`. Not part of Vite/npm build.
- Python: flat module layout, tests under `rag/tests/`, `pytest` configured with `pythonpath = .`.
- LLM + OCR MUST be behind adapters; tests use `FakeLLM` + `NullOCR` and hit no network.
- Migration timestamp: `20260702020000_doc_indexes.sql` (follows T2's `20260702010000`). Never edit `00000000000000_init.sql`.
- RLS on every new table. Never patch `documents.ingest_status` from the client — use the `rag_requeue_document` RPC.
- SPA: semantic Tailwind tokens only (`bg-surface`, `text-text-muted`), never raw colors. `import type` for type-only imports. Pages `export default`; libs/hooks named export. Derived data in `useMemo`.
- Do not commit `.env`. Provide `rag/.env.example` only.

---

### Task 1: `rag/` scaffolding + config

**Files:**
- Create: `rag/requirements.txt`
- Create: `rag/pytest.ini`
- Create: `rag/config.py`
- Create: `rag/.env.example`
- Create: `rag/README.md`
- Create: `rag/tests/__init__.py`
- Test: `rag/tests/test_config.py`

**Interfaces:**
- Produces: `Config` dataclass with fields `supabase_url: str`, `supabase_service_key: str`, `openllm_base_url: str`, `openllm_model: str`, `ocr_backend: str`, `llm_backend: str`, `poll_interval_s: int`, `batch_size: int`. Function `load_config(env: dict) -> Config` that raises `ValueError` listing every missing required key.

- [ ] **Step 1: Write requirements + pytest config + env example**

`rag/requirements.txt`:
```
pymupdf==1.24.10
pytesseract==0.3.13
pillow==10.4.0
supabase==2.7.4
```
`rag/pytest.ini`:
```ini
[pytest]
pythonpath = .
testpaths = tests
```
`rag/.env.example`:
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENLLM_BASE_URL=http://localhost:8000/v1
OPENLLM_MODEL=llama-3.1-8b
OCR_BACKEND=null          # null | tesseract
LLM_BACKEND=fake          # fake | openllm
POLL_INTERVAL_S=30
BATCH_SIZE=5
```

- [ ] **Step 2: Write the failing test**

`rag/tests/test_config.py`:
```python
import pytest
from config import load_config

BASE = {
    "SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k",
    "OPENLLM_BASE_URL": "http://llm/v1", "OPENLLM_MODEL": "m",
    "OCR_BACKEND": "null", "LLM_BACKEND": "fake",
    "POLL_INTERVAL_S": "30", "BATCH_SIZE": "5",
}

def test_load_config_parses_ints():
    cfg = load_config(BASE)
    assert cfg.poll_interval_s == 30
    assert cfg.batch_size == 5
    assert cfg.llm_backend == "fake"

def test_load_config_missing_required_raises():
    broken = {k: v for k, v in BASE.items() if k != "SUPABASE_SERVICE_KEY"}
    with pytest.raises(ValueError) as e:
        load_config(broken)
    assert "SUPABASE_SERVICE_KEY" in str(e.value)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'config'`.

- [ ] **Step 4: Write `rag/config.py`**

```python
from dataclasses import dataclass

REQUIRED = [
    "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENLLM_BASE_URL",
    "OPENLLM_MODEL", "OCR_BACKEND", "LLM_BACKEND",
    "POLL_INTERVAL_S", "BATCH_SIZE",
]

@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_key: str
    openllm_base_url: str
    openllm_model: str
    ocr_backend: str
    llm_backend: str
    poll_interval_s: int
    batch_size: int

def load_config(env: dict) -> Config:
    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise ValueError(f"Missing required env: {', '.join(missing)}")
    return Config(
        supabase_url=env["SUPABASE_URL"],
        supabase_service_key=env["SUPABASE_SERVICE_KEY"],
        openllm_base_url=env["OPENLLM_BASE_URL"],
        openllm_model=env["OPENLLM_MODEL"],
        ocr_backend=env["OCR_BACKEND"],
        llm_backend=env["LLM_BACKEND"],
        poll_interval_s=int(env["POLL_INTERVAL_S"]),
        batch_size=int(env["BATCH_SIZE"]),
    )
```
Create empty `rag/tests/__init__.py`. Write `rag/README.md` with: purpose (drains `documents` ingest queue), setup (`python -m venv .venv`, `pip install -r requirements.txt`, tesseract system dep for real OCR), run (`python worker.py` / `python worker.py --once`), test (`python -m pytest`), and the adapter env switches (`OCR_BACKEND`, `LLM_BACKEND`).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd rag && python -m pytest tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add rag/requirements.txt rag/pytest.ini rag/config.py rag/.env.example rag/README.md rag/tests/
git commit -m "feat(rag): T4 worker scaffolding + config loader"
```

---

### Task 2: `parse.py` — PDF text extraction + OCR fallback wiring

**Files:**
- Create: `rag/parse.py`
- Test: `rag/tests/test_parse.py`

**Interfaces:**
- Consumes: `OCR` protocol (Task 3) — for tests, a stub object with `image_to_text(png: bytes) -> str`.
- Produces:
  - `@dataclass Page: index: int, text: str, needs_ocr: bool`
  - `@dataclass ParsedDoc: pages: list[Page], toc: list[tuple[int, str, int]]`
  - `parse_pdf(data: bytes, ocr) -> ParsedDoc` — extracts text per page; if a page has no
    extractable text, renders it and fills `text` from `ocr.image_to_text`, sets `needs_ocr=True`.

- [ ] **Step 1: Write the failing test**

`rag/tests/test_parse.py`:
```python
import fitz
from parse import parse_pdf

class StubOCR:
    def __init__(self): self.calls = 0
    def image_to_text(self, png: bytes) -> str:
        self.calls += 1
        return "ocr-text"

def _text_pdf(pages_text):
    doc = fitz.open()
    for t in pages_text:
        p = doc.new_page()
        p.insert_text((72, 72), t)
    data = doc.tobytes()
    doc.close()
    return data

def _blank_pdf():
    doc = fitz.open()
    doc.new_page()          # no text -> triggers OCR
    data = doc.tobytes()
    doc.close()
    return data

def test_parse_extracts_text_per_page():
    parsed = parse_pdf(_text_pdf(["hello world", "second page"]), StubOCR())
    assert len(parsed.pages) == 2
    assert "hello world" in parsed.pages[0].text
    assert parsed.pages[0].needs_ocr is False

def test_parse_empty_page_falls_back_to_ocr():
    ocr = StubOCR()
    parsed = parse_pdf(_blank_pdf(), ocr)
    assert ocr.calls == 1
    assert parsed.pages[0].needs_ocr is True
    assert parsed.pages[0].text == "ocr-text"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_parse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'parse'`.

- [ ] **Step 3: Write `rag/parse.py`**

```python
from dataclasses import dataclass
import fitz  # PyMuPDF

@dataclass
class Page:
    index: int
    text: str
    needs_ocr: bool

@dataclass
class ParsedDoc:
    pages: list
    toc: list

def parse_pdf(data: bytes, ocr) -> ParsedDoc:
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        pages = []
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if text:
                pages.append(Page(index=i, text=text, needs_ocr=False))
            else:
                pix = page.get_pixmap(dpi=200)
                png = pix.tobytes("png")
                pages.append(Page(index=i, text=ocr.image_to_text(png), needs_ocr=True))
        toc = [(lvl, title, pg) for lvl, title, pg in doc.get_toc()]
        return ParsedDoc(pages=pages, toc=toc)
    finally:
        doc.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd rag && python -m pytest tests/test_parse.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add rag/parse.py rag/tests/test_parse.py
git commit -m "feat(rag): PDF parse with OCR fallback per page"
```

---

### Task 3: `ocr.py` — OCR adapters

**Files:**
- Create: `rag/ocr.py`
- Test: `rag/tests/test_ocr.py`

**Interfaces:**
- Produces:
  - `class NullOCR` with `image_to_text(png: bytes) -> str` returning `""`.
  - `class TesseractOCR` with the same method (pytesseract over PIL image). Not unit-tested (needs system tesseract); covered by the `make_ocr` selector test only.
  - `make_ocr(backend: str)` returning `NullOCR()` for `"null"`, `TesseractOCR()` for `"tesseract"`, else `ValueError`.

- [ ] **Step 1: Write the failing test**

`rag/tests/test_ocr.py`:
```python
import pytest
from ocr import NullOCR, make_ocr

def test_null_ocr_returns_empty():
    assert NullOCR().image_to_text(b"anything") == ""

def test_make_ocr_selects_null():
    assert isinstance(make_ocr("null"), NullOCR)

def test_make_ocr_unknown_raises():
    with pytest.raises(ValueError):
        make_ocr("bogus")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_ocr.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ocr'`.

- [ ] **Step 3: Write `rag/ocr.py`**

```python
import io

class NullOCR:
    """Stub OCR for offline/dev. Real scans need TesseractOCR."""
    def image_to_text(self, png: bytes) -> str:
        return ""

class TesseractOCR:
    def image_to_text(self, png: bytes) -> str:
        import pytesseract
        from PIL import Image
        return pytesseract.image_to_string(Image.open(io.BytesIO(png))).strip()

def make_ocr(backend: str):
    if backend == "null":
        return NullOCR()
    if backend == "tesseract":
        return TesseractOCR()
    raise ValueError(f"Unknown OCR_BACKEND: {backend}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd rag && python -m pytest tests/test_ocr.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add rag/ocr.py rag/tests/test_ocr.py
git commit -m "feat(rag): OCR adapters (Null + Tesseract) with selector"
```

---

### Task 4: `llm.py` — summarization adapters

**Files:**
- Create: `rag/llm.py`
- Test: `rag/tests/test_llm.py`

**Interfaces:**
- Produces:
  - `class FakeLLM` with `model = "fake"` and `summarize(text: str) -> str` returning the first
    line, truncated to 80 chars (deterministic).
  - `class OpenLLMClient(base_url, model)` with `summarize(text: str) -> str` POSTing an
    OpenAI-compatible `/chat/completions` request. Not unit-tested (needs a live endpoint).
  - `make_llm(backend: str, base_url: str, model: str)` → `FakeLLM()` for `"fake"`,
    `OpenLLMClient(base_url, model)` for `"openllm"`, else `ValueError`.

- [ ] **Step 1: Write the failing test**

`rag/tests/test_llm.py`:
```python
import pytest
from llm import FakeLLM, make_llm

def test_fake_llm_deterministic_and_truncates():
    llm = FakeLLM()
    long = "x" * 200
    s = llm.summarize(long)
    assert s == "x" * 80
    assert llm.summarize(long) == s          # deterministic
    assert llm.model == "fake"

def test_fake_llm_first_line_only():
    assert FakeLLM().summarize("line one\nline two") == "line one"

def test_make_llm_unknown_raises():
    with pytest.raises(ValueError):
        make_llm("bogus", "http://x", "m")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_llm.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'llm'`.

- [ ] **Step 3: Write `rag/llm.py`**

```python
import json
import urllib.request

_PROMPT = "Summarize the following document section in one sentence:\n\n"

class FakeLLM:
    model = "fake"
    def summarize(self, text: str) -> str:
        first = text.strip().splitlines()[0] if text.strip() else ""
        return first[:80]

class OpenLLMClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model
    def summarize(self, text: str) -> str:
        body = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": _PROMPT + text[:4000]}],
            "temperature": 0.0,
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body, headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        return data["choices"][0]["message"]["content"].strip()

def make_llm(backend: str, base_url: str, model: str):
    if backend == "fake":
        return FakeLLM()
    if backend == "openllm":
        return OpenLLMClient(base_url, model)
    raise ValueError(f"Unknown LLM_BACKEND: {backend}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd rag && python -m pytest tests/test_llm.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add rag/llm.py rag/tests/test_llm.py
git commit -m "feat(rag): LLM summarization adapters (Fake + OpenLLM)"
```

---

### Task 5: `pageindex.py` — hierarchical tree builder

**Files:**
- Create: `rag/pageindex.py`
- Test: `rag/tests/test_pageindex.py`

**Interfaces:**
- Consumes: `ParsedDoc`, `Page` from `parse.py`; an llm with `summarize(text) -> str`.
- Produces: `build_tree(parsed: ParsedDoc, llm, doc_title: str) -> dict` shaped as
  `{"root": {"title", "summary", "nodes": [ {"title","summary","page_start","page_end","nodes":[]}, ... ]}}`.
  Flat mode (no TOC): one child node per page (`page_start==page_end==page number, 1-based`).
  TOC mode (TOC present): one child node per top-level TOC entry, `page_start` = its page,
  `page_end` = next entry's page − 1 (last entry → last page). Root summary = summary of
  concatenated node summaries.

- [ ] **Step 1: Write the failing test**

`rag/tests/test_pageindex.py`:
```python
from parse import ParsedDoc, Page
from pageindex import build_tree

class EchoLLM:
    model = "fake"
    def summarize(self, text: str) -> str:
        return text[:40]

def _pages(n):
    return [Page(index=i, text=f"page {i+1} body", needs_ocr=False) for i in range(n)]

def test_flat_tree_one_node_per_page():
    parsed = ParsedDoc(pages=_pages(3), toc=[])
    tree = build_tree(parsed, EchoLLM(), "Doc A")
    root = tree["root"]
    assert root["title"] == "Doc A"
    assert len(root["nodes"]) == 3
    assert root["nodes"][0]["page_start"] == 1
    assert root["nodes"][0]["page_end"] == 1
    assert root["nodes"][2]["page_start"] == 3

def test_toc_tree_uses_page_ranges():
    parsed = ParsedDoc(
        pages=_pages(5),
        toc=[(1, "Intro", 1), (1, "Methods", 3)],
    )
    tree = build_tree(parsed, EchoLLM(), "Doc B")
    nodes = tree["root"]["nodes"]
    assert [n["title"] for n in nodes] == ["Intro", "Methods"]
    assert nodes[0]["page_start"] == 1 and nodes[0]["page_end"] == 2
    assert nodes[1]["page_start"] == 3 and nodes[1]["page_end"] == 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_pageindex.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pageindex'`.

- [ ] **Step 3: Write `rag/pageindex.py`**

```python
def _page_text(parsed, start_1, end_1):
    return "\n".join(p.text for p in parsed.pages if start_1 <= p.index + 1 <= end_1)

def _flat_nodes(parsed, llm):
    nodes = []
    for p in parsed.pages:
        n = p.index + 1
        nodes.append({
            "title": f"Page {n}",
            "summary": llm.summarize(p.text),
            "page_start": n, "page_end": n, "nodes": [],
        })
    return nodes

def _toc_nodes(parsed, llm):
    top = [(title, pg) for lvl, title, pg in parsed.toc if lvl == 1]
    last_page = len(parsed.pages)
    nodes = []
    for i, (title, pg) in enumerate(top):
        end = (top[i + 1][1] - 1) if i + 1 < len(top) else last_page
        nodes.append({
            "title": title,
            "summary": llm.summarize(_page_text(parsed, pg, end)),
            "page_start": pg, "page_end": end, "nodes": [],
        })
    return nodes

def build_tree(parsed, llm, doc_title: str) -> dict:
    top_level = [t for t in parsed.toc if t[0] == 1]
    nodes = _toc_nodes(parsed, llm) if top_level else _flat_nodes(parsed, llm)
    root_summary = llm.summarize("\n".join(n["summary"] for n in nodes))
    return {"root": {"title": doc_title, "summary": root_summary, "nodes": nodes}}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd rag && python -m pytest tests/test_pageindex.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add rag/pageindex.py rag/tests/test_pageindex.py
git commit -m "feat(rag): PageIndex tree builder (flat + TOC modes)"
```

---

### Task 6: `db.py` — DB adapter (protocol + Supabase impl + fake)

**Files:**
- Create: `rag/db.py`
- Test: `rag/tests/test_db.py`

**Interfaces:**
- Produces:
  - `@dataclass DocRow: id: str, storage_bucket: str, storage_path: str, mime_type: str, title: str`
  - `class FakeDB` (in-memory) implementing the DB surface used by the worker:
    - `claim_pending() -> DocRow | None` — returns the next `pending` doc and flips it to
      `processing`; `None` when none remain.
    - `download(bucket: str, path: str) -> bytes`
    - `save_index(document_id: str, tree: dict, model: str, page_count: int) -> None`
    - `mark(document_id: str, status: str, error: str | None = None) -> None`
  - `class SupabaseDB(config)` — same surface backed by supabase-py. Not unit-tested (needs a
    live project); the worker is tested against `FakeDB`.
  - Test helpers on `FakeDB`: constructor seeds `docs`, `storage`; exposes `.indexes` dict and
    `.status[doc_id]`.

- [ ] **Step 1: Write the failing test**

`rag/tests/test_db.py`:
```python
from db import FakeDB, DocRow

def _seed():
    doc = DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                 mime_type="application/pdf", title="T")
    return FakeDB(docs=[doc], storage={("b", "p.pdf"): b"bytes"})

def test_claim_returns_then_none():
    db = _seed()
    first = db.claim_pending()
    assert first.id == "d1"
    assert db.status["d1"] == "processing"
    assert db.claim_pending() is None      # already claimed

def test_save_index_and_mark():
    db = _seed()
    db.claim_pending()
    db.save_index("d1", {"root": {}}, "fake", 2)
    db.mark("d1", "indexed")
    assert db.indexes["d1"]["page_count"] == 2
    assert db.status["d1"] == "indexed"

def test_download_returns_bytes():
    db = _seed()
    assert db.download("b", "p.pdf") == b"bytes"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'db'`.

- [ ] **Step 3: Write `rag/db.py`**

```python
from dataclasses import dataclass, field

@dataclass
class DocRow:
    id: str
    storage_bucket: str
    storage_path: str
    mime_type: str
    title: str

class FakeDB:
    def __init__(self, docs, storage):
        self._docs = {d.id: d for d in docs}
        self.status = {d.id: "pending" for d in docs}
        self.storage = storage
        self.indexes = {}
    def claim_pending(self):
        for did, st in self.status.items():
            if st == "pending":
                self.status[did] = "processing"
                return self._docs[did]
        return None
    def download(self, bucket, path):
        return self.storage[(bucket, path)]
    def save_index(self, document_id, tree, model, page_count):
        self.indexes[document_id] = {"tree": tree, "model": model, "page_count": page_count}
    def mark(self, document_id, status, error=None):
        self.status[document_id] = status

class SupabaseDB:
    def __init__(self, config):
        from supabase import create_client
        self.c = create_client(config.supabase_url, config.supabase_service_key)
    def claim_pending(self):
        # Atomic claim: flip exactly one pending row to processing.
        # ponytail: single-worker assumed; add SELECT ... FOR UPDATE SKIP LOCKED
        #           RPC if we ever run >1 worker.
        rows = (self.c.table("documents").select("*")
                .eq("ingest_status", "pending").limit(1).execute().data)
        if not rows:
            return None
        row = rows[0]
        upd = (self.c.table("documents").update({"ingest_status": "processing"})
               .eq("id", row["id"]).eq("ingest_status", "pending").execute().data)
        if not upd:
            return None  # lost the race
        return DocRow(id=row["id"], storage_bucket=row["storage_bucket"],
                      storage_path=row["storage_path"], mime_type=row["mime_type"],
                      title=row["title"])
    def download(self, bucket, path):
        return self.c.storage.from_(bucket).download(path)
    def save_index(self, document_id, tree, model, page_count):
        self.c.table("doc_indexes").upsert({
            "document_id": document_id, "tree": tree,
            "model": model, "page_count": page_count,
        }).execute()
    def mark(self, document_id, status, error=None):
        self.c.table("documents").update(
            {"ingest_status": status, "ingest_error": error}
        ).eq("id", document_id).execute()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd rag && python -m pytest tests/test_db.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add rag/db.py rag/tests/test_db.py
git commit -m "feat(rag): DB adapter (FakeDB + SupabaseDB) with atomic claim"
```

---

### Task 7: `worker.py` — orchestration + `--once`

**Files:**
- Create: `rag/worker.py`
- Test: `rag/tests/test_worker.py`

**Interfaces:**
- Consumes: `parse_pdf` (Task 2), `build_tree` (Task 5), `DocRow`/`FakeDB` (Task 6),
  `make_ocr`/`make_llm` (Tasks 3/4), `load_config` (Task 1).
- Produces:
  - `process_document(doc: DocRow, db, ocr, llm) -> None` — download → parse → tree → save →
    mark `indexed`; non-PDF mime → `skipped`; any exception → `mark(doc.id, "failed", str(e))`.
  - `run_once(db, ocr, llm) -> int` — claim+process in a loop until `claim_pending()` is None;
    returns number processed.
  - `main()` — build real adapters from env, loop `run_once` sleeping `poll_interval_s`;
    `--once` runs a single `run_once` and exits.

- [ ] **Step 1: Write the failing test**

`rag/tests/test_worker.py`:
```python
import fitz
from db import FakeDB, DocRow
from ocr import NullOCR
from llm import FakeLLM
from worker import run_once, process_document

def _pdf():
    doc = fitz.open(); p = doc.new_page(); p.insert_text((72, 72), "content here")
    data = doc.tobytes(); doc.close(); return data

def _db(mime="application/pdf"):
    doc = DocRow(id="d1", storage_bucket="b", storage_path="p.pdf",
                 mime_type=mime, title="Report")
    return FakeDB(docs=[doc], storage={("b", "p.pdf"): _pdf()})

def test_run_once_indexes_pending_doc():
    db = _db()
    n = run_once(db, NullOCR(), FakeLLM())
    assert n == 1
    assert db.status["d1"] == "indexed"
    tree = db.indexes["d1"]["tree"]
    assert tree["root"]["title"] == "Report"
    assert len(tree["root"]["nodes"]) == 1

def test_non_pdf_is_skipped():
    db = _db(mime="image/png")
    doc = db.claim_pending()
    process_document(doc, db, NullOCR(), FakeLLM())
    assert db.status["d1"] == "skipped"

def test_failure_marks_failed():
    db = _db()
    db.storage[("b", "p.pdf")] = b"not a pdf"   # parse will raise
    doc = db.claim_pending()
    process_document(doc, db, NullOCR(), FakeLLM())
    assert db.status["d1"] == "failed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd rag && python -m pytest tests/test_worker.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'worker'`.

- [ ] **Step 3: Write `rag/worker.py`**

```python
import os
import sys
import time

from config import load_config
from parse import parse_pdf
from pageindex import build_tree
from ocr import make_ocr, NullOCR
from llm import make_llm, FakeLLM

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

def main():
    cfg = load_config(os.environ)
    ocr = make_ocr(cfg.ocr_backend)
    llm = make_llm(cfg.llm_backend, cfg.openllm_base_url, cfg.openllm_model)
    from db import SupabaseDB
    db = SupabaseDB(cfg)
    once = "--once" in sys.argv
    while True:
        n = run_once(db, ocr, llm)
        print(f"[rag] processed {n} document(s)", flush=True)
        if once:
            return
        time.sleep(cfg.poll_interval_s)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd rag && python -m pytest -v`
Expected: PASS (all tests across the suite, worker included).

- [ ] **Step 5: Commit**

```bash
git add rag/worker.py rag/tests/test_worker.py
git commit -m "feat(rag): worker orchestration with --once and per-doc isolation"
```

---

### Task 8: Migration — `doc_indexes` table + requeue RPC

**Files:**
- Create: `supabase/migrations/20260702020000_doc_indexes.sql`

**Interfaces:**
- Produces: table `public.doc_indexes`, policy `doc_indexes_read`, function
  `public.rag_requeue_document(p_doc_id uuid)` (admin-only, `SECURITY DEFINER`) consumed by
  the SPA in Task 9. Reuses `public.documents_can_read` and `public.proposals_caller_has_role`
  shipped in the T1 documents-registry migration.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260702020000_doc_indexes.sql`:
```sql
-- RAG ingestion index store (Overhaul T4).
-- One row per indexed document: the PageIndex tree JSON built by the
-- server-side worker (service role). Read is gated to whoever can read the
-- parent document; only the worker (service role) writes.

create table public.doc_indexes (
  document_id uuid primary key references public.documents(id) on delete cascade,
  tree        jsonb not null,
  model       text  not null,
  page_count  int   not null default 0,
  built_at    timestamptz not null default now()
);

alter table public.doc_indexes enable row level security;

create policy doc_indexes_read on public.doc_indexes
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = doc_indexes.document_id
        and public.documents_can_read(d)
    )
  );
-- No client write policy: service role (worker) bypasses RLS.

-- Admin requeue: reset a document into the ingest queue. SECURITY DEFINER so
-- the client never patches documents.ingest_status directly.
create or replace function public.rag_requeue_document(p_doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  ) then
    raise exception 'not authorized';
  end if;
  update public.documents
     set ingest_status = 'pending', ingest_error = null
   where id = p_doc_id;
end;
$$;

revoke all on function public.rag_requeue_document(uuid) from public;
grant execute on function public.rag_requeue_document(uuid) to authenticated;
```

- [ ] **Step 2: Verify it applies (manual, if a Supabase project is available)**

Run in Supabase SQL Editor as `postgres`, or `supabase db reset` against a clean project.
Expected: no errors; `select * from doc_indexes;` returns 0 rows; `\df rag_requeue_document`
shows the function. If no project is available, verify by reading: table columns match the
worker's `save_index` upsert keys (`document_id, tree, model, page_count`), and the two
reused helpers exist in `20260702000000_documents_registry.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260702020000_doc_indexes.sql
git commit -m "feat(db): doc_indexes table + admin requeue RPC (T4)"
```

---

### Task 9: SPA data lib — `src/lib/rag/monitor.ts`

**Files:**
- Create: `src/lib/rag/monitor.ts`
- Test: `src/lib/rag/monitor.test.ts`

**Interfaces:**
- Consumes: `supabase` client from `src/utils/supabaseClient.ts`. RPC `rag_requeue_document`
  (Task 8).
- Produces:
  - `type IngestStatus = 'pending'|'processing'|'indexed'|'failed'|'skipped'`
  - `interface StatusCounts extends Record<IngestStatus, number>`
  - `interface MonitorRow { id: string; title: string; entityType: string; status: IngestStatus; error: string | null; pageCount: number | null; builtAt: string | null }`
  - `countByStatus(rows: { ingest_status: IngestStatus }[]): StatusCounts` — pure aggregator.
  - `async fetchMonitorRows(): Promise<MonitorRow[]>`
  - `async requeueDocument(docId: string): Promise<void>`

The pure `countByStatus` is the only unit-tested piece (matches project convention: test
logic, not thin Supabase wrappers).

- [ ] **Step 1: Write the failing test**

`src/lib/rag/monitor.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { countByStatus } from './monitor';

describe('countByStatus', () => {
  it('tallies every status and zero-fills the rest', () => {
    const counts = countByStatus([
      { ingest_status: 'pending' },
      { ingest_status: 'pending' },
      { ingest_status: 'indexed' },
      { ingest_status: 'failed' },
    ]);
    expect(counts.pending).toBe(2);
    expect(counts.indexed).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.processing).toBe(0);
    expect(counts.skipped).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rag/monitor.test.ts`
Expected: FAIL — cannot resolve `./monitor`.

- [ ] **Step 3: Write `src/lib/rag/monitor.ts`**

```typescript
import { supabase } from '../../utils/supabaseClient';

export type IngestStatus = 'pending' | 'processing' | 'indexed' | 'failed' | 'skipped';

export type StatusCounts = Record<IngestStatus, number>;

export interface MonitorRow {
  id: string;
  title: string;
  entityType: string;
  status: IngestStatus;
  error: string | null;
  pageCount: number | null;
  builtAt: string | null;
}

const ZERO: StatusCounts = {
  pending: 0, processing: 0, indexed: 0, failed: 0, skipped: 0,
};

export function countByStatus(rows: { ingest_status: IngestStatus }[]): StatusCounts {
  const counts: StatusCounts = { ...ZERO };
  for (const r of rows) counts[r.ingest_status] += 1;
  return counts;
}

export async function fetchMonitorRows(): Promise<MonitorRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, entity_type, ingest_status, ingest_error, doc_indexes(page_count, built_at)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const idx = Array.isArray(d.doc_indexes) ? d.doc_indexes[0] : d.doc_indexes;
    return {
      id: d.id,
      title: d.title,
      entityType: d.entity_type,
      status: d.ingest_status as IngestStatus,
      error: d.ingest_error ?? null,
      pageCount: idx?.page_count ?? null,
      builtAt: idx?.built_at ?? null,
    };
  });
}

export async function requeueDocument(docId: string): Promise<void> {
  const { error } = await supabase.rpc('rag_requeue_document', { p_doc_id: docId });
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rag/monitor.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/monitor.ts src/lib/rag/monitor.test.ts
git commit -m "feat(rag): SPA monitor data lib + status aggregator"
```

---

### Task 10: SPA page — `RagMonitor` + route/nav/access wiring

**Files:**
- Create: `src/pages/admin/RagMonitor.tsx`
- Modify: `src/constants/access.ts` (add `/admin/rag`)
- Modify: `src/App.tsx` (register route with guard)
- Modify: `src/components/layout/Layout.tsx` (add nav item in Admin group)
- Test: covered by build + typecheck (page is display-only; project convention skips tests for thin pages).

**Interfaces:**
- Consumes: `fetchMonitorRows`, `requeueDocument`, `countByStatus`, `MonitorRow`,
  `StatusCounts` (Task 9). `ACCESS_MAP` (Task 10 edit). Existing `<EmptyState>` primitive.

- [ ] **Step 1: Add the access entry**

In `src/constants/access.ts`, inside the `ACCESS_MAP` object, add (near the other
`/admin/*` and admin entries, keeping the `ADMINS` grouping):
```typescript
  '/admin/rag':               ADMINS,
```

- [ ] **Step 2: Write `src/pages/admin/RagMonitor.tsx`**

Read `src/pages/admin/AccessRequests.tsx` (or another `src/pages/admin/*` page) first to
match the page shell (heading, container, loading pattern). Then:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  fetchMonitorRows, requeueDocument, countByStatus,
} from '../../lib/rag/monitor';
import type { MonitorRow } from '../../lib/rag/monitor';

const STATUS_ORDER = ['pending', 'processing', 'indexed', 'failed', 'skipped'] as const;

export default function RagMonitor() {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchMonitorRows());
    } catch (e) {
      console.error('Failed to load RAG monitor', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(
    () => countByStatus(rows.map((r) => ({ ingest_status: r.status }))),
    [rows],
  );

  async function requeue(id: string) {
    await requeueDocument(id);
    await load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">RAG Ingestion</h1>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="rounded-lg border border-border bg-surface p-4">
            <div className="text-2xl font-semibold text-text">{counts[s]}</div>
            <div className="text-sm capitalize text-text-muted">{s}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No documents" message="Nothing in the ingestion queue yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-text-muted">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Status</th>
                <th className="p-3">Pages</th>
                <th className="p-3">Error</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 text-text">{r.title}</td>
                  <td className="p-3 text-text-muted">{r.entityType}</td>
                  <td className="p-3 capitalize text-text-muted">{r.status}</td>
                  <td className="p-3 text-text-muted">{r.pageCount ?? '—'}</td>
                  <td className="p-3 text-text-muted">{r.error ?? '—'}</td>
                  <td className="p-3">
                    {(r.status === 'failed' || r.status === 'indexed') && (
                      <button
                        onClick={() => void requeue(r.id)}
                        className="text-brand-blue hover:underline"
                      >
                        {r.status === 'failed' ? 'Retry' : 'Re-index'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```
Adjust token class names (`text-text`, `surface-hover`, `brand-blue`) to the exact tokens
used by the sibling admin page you read — do not introduce raw colors.

- [ ] **Step 3: Register the route in `src/App.tsx`**

Find how `/admin/access-requests` is registered (a `<Route>` wrapped by `<ProtectedRoute
allowedRoles={ACCESS_MAP['/admin/access-requests']}>`), and add alongside it:
```tsx
<Route
  path="/admin/rag"
  element={
    <ProtectedRoute allowedRoles={ACCESS_MAP['/admin/rag']}>
      <RagMonitor />
    </ProtectedRoute>
  }
/>
```
Add the import at the top with the other page imports:
```tsx
import RagMonitor from './pages/admin/RagMonitor';
```
(Match the existing import style — lazy vs eager — used by neighboring admin pages.)

- [ ] **Step 4: Add the nav item in `src/components/layout/Layout.tsx`**

Find `NAV_ITEMS` and the Admin/System group containing `/admin/access-requests` or
`/irins-sync`. Add an entry following that exact object shape (label, path, icon,
`allowedRoles: ACCESS_MAP['/admin/rag']`), e.g.:
```tsx
{ label: 'RAG Ingestion', path: '/admin/rag', icon: Database, allowedRoles: ACCESS_MAP['/admin/rag'] },
```
Import the icon (e.g. `Database`) from `lucide-react` if not already imported.

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint src/ && npm run build`
Expected: no type errors, no lint errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/RagMonitor.tsx src/constants/access.ts src/App.tsx src/components/layout/Layout.tsx
git commit -m "feat(rag): admin RAG ingestion monitor page (/admin/rag)"
```

---

## Self-Review

**Spec coverage:**
- §2 architecture (`rag/` package, adapters) → Tasks 1–7. ✓
- §3 `doc_indexes` migration + RPC → Task 8. ✓
- §3 PageIndex tree JSON shape → Task 5. ✓
- §4 processing flow (claim, download, parse, OCR, tree, persist, mark, skipped/failed) →
  Tasks 6 (claim) + 7 (flow). ✓
- §5 admin monitor (route/nav/access, counts, table, retry/re-index) → Tasks 9–10. ✓
- §6 error handling (per-doc isolation, claim guard, retry path, config fail-fast) →
  Tasks 1 (config), 6 (claim), 7 (isolation), 8/9/10 (requeue). ✓
- §7 testing (test_parse, test_pageindex, test_worker, monitor count test) → Tasks 2,5,7,9. ✓
- §8 deferred items → out of scope by design; noted, no tasks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every test step shows the
assertion. ✓

**Type consistency:** `DocRow` fields (`id, storage_bucket, storage_path, mime_type, title`)
match `parse_pdf`/`process_document`/`SupabaseDB` usage. `save_index(document_id, tree, model,
page_count)` matches the migration's `doc_indexes` columns and the FakeDB signature.
`countByStatus`/`StatusCounts`/`MonitorRow`/`requeueDocument` names identical across Tasks 9
and 10. `rag_requeue_document(p_doc_id)` param name matches the `supabase.rpc` call. ✓

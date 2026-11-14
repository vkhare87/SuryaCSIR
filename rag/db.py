from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass
class DocRow:
    id: str
    storage_bucket: str
    storage_path: str
    mime_type: str
    title: str


MAX_INGEST_ATTEMPTS = 3
_PAGE_SIZE = 1000


def _fetch_all(make_query, order_col: str, page_size: int = _PAGE_SIZE):
    q = make_query()
    if not hasattr(q, "range"):
        return q.execute().data or []
    out, page = [], 0
    while True:
        page_q = q if page == 0 else make_query()
        batch = (
            page_q.order(order_col)
            .range(page * page_size, (page + 1) * page_size - 1)
            .execute()
            .data
            or []
        )
        out.extend(batch)
        if len(batch) < page_size:
            return out
        page += 1


def _is_before(ts: str | None, cutoff_dt: datetime) -> bool:
    if not ts:
        return False
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < cutoff_dt

# A document is flipped to 'processing' while a worker parses it. If that worker
# dies mid-document the row is neither 'pending' nor 'failed', so the queue never
# offers it again — it is silently lost while the console still shows it in flight.
# Anything held this long is assumed abandoned and returned to the queue. Set well
# above the slowest realistic parse: a large scanned PDF on a CPU-only host can
# legitimately occupy a worker for many minutes.
STALE_PROCESSING_MINUTES = 60


class FakeDB:
    def __init__(self, docs, storage):
        self._docs = {d.id: d for d in docs}
        self.status = {d.id: "pending" for d in docs}
        self.attempts = {d.id: 0 for d in docs}
        self.storage = storage
        self.indexes = {}
        self.pages = {}
        self.checkpoints = {}
        self.created_at = {d.id: datetime.now(timezone.utc).isoformat() for d in docs}
        self.processing_started_at = {}
        self.stale_ids = set()   # ids the test declares abandoned mid-processing

    def load_checkpoint(self, document_id, model):
        cp = self.checkpoints.get(document_id)
        if not cp or cp.get("model") != model:
            return {}
        return dict(cp.get("summaries") or {})

    def save_checkpoint(self, document_id, model, summaries, page_count):
        self.checkpoints[document_id] = {
            "model": model,
            "summaries": dict(summaries),
            "page_count": page_count,
        }

    def requeue_stale_processing(self, minutes=STALE_PROCESSING_MINUTES):
        cutoff_dt = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        stale = set(self.stale_ids)
        for did, st in self.status.items():
            if st == "processing":
                started = self.processing_started_at.get(did) or self.created_at.get(did)
                if _is_before(started, cutoff_dt):
                    stale.add(did)
        n = 0
        for did in list(stale):
            if self.status.get(did) == "processing":
                self.status[did] = "pending"
                self.processing_started_at.pop(did, None)
                n += 1
        self.stale_ids.clear()
        return n

    def claim_pending(self):
        for did, st in self.status.items():
            if st == "pending":
                self.status[did] = "processing"
                self.processing_started_at[did] = datetime.now(timezone.utc).isoformat()
                return self._docs[did]
        for did, st in self.status.items():  # retry failures under the attempt cap
            if st == "failed" and self.attempts[did] < MAX_INGEST_ATTEMPTS:
                self.status[did] = "processing"
                self.processing_started_at[did] = datetime.now(timezone.utc).isoformat()
                return self._docs[did]
        return None

    def download(self, bucket, path):
        return self.storage[(bucket, path)]

    def save_index(self, document_id, tree, model, page_count):
        self.indexes[document_id] = {"tree": tree, "model": model, "page_count": page_count}

    def save_pages(self, document_id, pages):
        self.pages[document_id] = {p.index + 1: p.text for p in pages}

    def mark(self, document_id, status, error=None):
        self.status[document_id] = status
        self.processing_started_at.pop(document_id, None)
        if status == "failed":
            self.attempts[document_id] += 1


class SupabaseDB:
    def __init__(self, config):
        from supabase import create_client
        self.c = create_client(config.supabase_url, config.supabase_service_key)

    def claim_pending(self):
        # Atomic claim: flip exactly one pending row to processing.
        # ponytail: single-worker assumed; add a SELECT ... FOR UPDATE SKIP LOCKED
        #           RPC if we ever run >1 worker.
        row = self._claim("pending")
        if row is None:
            # Retry failures under the attempt cap; >=3 stays failed (dead letter)
            # until an admin requeue resets the counter.
            # ponytail: retries happen next poll pass, no timed backoff — add a
            #           last-attempt timestamp if hammering a flaky source matters.
            row = self._claim("failed", max_attempts=MAX_INGEST_ATTEMPTS)
        if row is None:
            return None
        return DocRow(id=row["id"], storage_bucket=row["storage_bucket"],
                      storage_path=row["storage_path"], mime_type=row["mime_type"],
                      title=row["title"])

    def _claim(self, status, max_attempts=None):
        q = (self.c.table("documents")
             .select("id, storage_bucket, storage_path, mime_type, title")
             .eq("ingest_status", status)
             .order("created_at"))
        if max_attempts is not None:
            q = q.lt("ingest_attempts", max_attempts)
        rows = q.limit(1).execute().data
        if not rows:
            return None
        row = rows[0]
        upd = (self.c.table("documents")
               .update({
                   "ingest_status": "processing",
                   "processing_started_at": datetime.now(timezone.utc).isoformat(),
               })
               .eq("id", row["id"]).eq("ingest_status", status).execute().data)
        return row if upd else None  # None: lost the race

    def download(self, bucket, path):
        return self.c.storage.from_(bucket).download(path)

    def save_index(self, document_id, tree, model, page_count):
        self.c.table("doc_indexes").upsert({
            "document_id": document_id, "tree": tree,
            "model": model, "page_count": page_count,
        }).execute()

    def load_checkpoint(self, document_id, model):
        rows = (self.c.table("doc_indexes").select("tree, model")
                .eq("document_id", document_id).limit(1).execute().data) or []
        if not rows or rows[0].get("model") != model:
            return {}
        tree = rows[0].get("tree") or {}
        return dict(tree.get("_checkpoint") or {})

    def save_checkpoint(self, document_id, model, summaries, page_count):
        # Persist incremental leaf summaries while ingest_status='processing'.
        # tree_is_empty() returns True because root.nodes is empty, so partial
        # checkpoints are never treated as a completed index.
        self.c.table("doc_indexes").upsert({
            "document_id": document_id,
            "tree": {"_checkpoint": summaries, "root": {"title": "", "summary": "", "nodes": []}},
            "model": model,
            "page_count": page_count,
        }).execute()

    def save_pages(self, document_id, pages):
        # Atomic RPC replacement when available so a shrunken reparse or transient
        # failure never leaves partial/missing pages.
        payload = [{"page": p.index + 1, "text": p.text} for p in pages]
        if hasattr(self.c, "rpc"):
            self.c.rpc(
                "rag_replace_doc_pages",
                {"p_document_id": document_id, "p_pages": payload},
            ).execute()
            return
        self.c.table("doc_pages").delete().eq("document_id", document_id).execute()
        rows = [{"document_id": document_id, **item} for item in payload]
        if rows:
            self.c.table("doc_pages").insert(rows).execute()

    def mark(self, document_id, status, error=None):
        patch = {
            "ingest_status": status,
            "ingest_error": error,
            "processing_started_at": None,
        }
        if status == "failed":
            rows = (self.c.table("documents").select("ingest_attempts")
                    .eq("id", document_id).execute().data)
            patch["ingest_attempts"] = (rows[0].get("ingest_attempts", 0) + 1) if rows else 1
        self.c.table("documents").update(patch).eq("id", document_id).execute()

    def requeue_stale_processing(self, minutes=STALE_PROCESSING_MINUTES):
        """Return abandoned 'processing' rows to the queue. Returns the count.

        Measures claim duration from processing_started_at (falling back to
        created_at if unset) so re-queued older documents are never reclaimed
        while actively being indexed."""
        cutoff_dt = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        rows = _fetch_all(
            lambda: (
                self.c.table("documents")
                .select("id, created_at, processing_started_at")
                .eq("ingest_status", "processing")
            ),
            order_col="id",
        )
        stale_ids = [
            row["id"] for row in rows
            if _is_before(row.get("processing_started_at") or row.get("created_at"), cutoff_dt)
        ]
        if not stale_ids:
            return 0
        patch = {
            "ingest_status": "pending",
            "ingest_error": "requeued after stalled ingest",
            "processing_started_at": None,
        }
        base_q = self.c.table("documents").update(patch)
        if not hasattr(base_q, "in_"):
            n = 0
            for doc_id in stale_ids:
                upd = (self.c.table("documents")
                       .update(patch)
                       .eq("id", doc_id).eq("ingest_status", "processing")
                       .execute().data)
                n += len(upd) if upd else 0
            return n
        n = 0
        for i in range(0, len(stale_ids), 200):
            upd = (self.c.table("documents")
                   .update(patch)
                   .in_("id", stale_ids[i : i + 200]).eq("ingest_status", "processing")
                   .execute().data)
            n += len(upd) if upd else 0
        return n

    def requeue_stale_model(self, model):
        """Reset indexed docs whose index was built by a different model; the
        normal loop rebuilds them. Returns the number requeued."""
        rows = _fetch_all(
            lambda: self.c.table("doc_indexes").select("document_id, model").neq("model", model),
            order_col="document_id",
        )
        ids = [r["document_id"] for r in rows]
        if not ids:
            return 0
        patch = {
            "ingest_status": "pending",
            "ingest_error": None,
            "ingest_attempts": 0,
            "processing_started_at": None,
        }
        base_q = self.c.table("documents").update(patch)
        if not hasattr(base_q, "in_"):
            n = 0
            for doc_id in ids:
                upd = (self.c.table("documents")
                       .update(patch)
                       .eq("id", doc_id).eq("ingest_status", "indexed").execute().data)
                n += len(upd) if upd else 0
            return n
        n = 0
        for i in range(0, len(ids), 200):
            upd = (self.c.table("documents")
                   .update(patch)
                   .in_("id", ids[i : i + 200]).eq("ingest_status", "indexed")
                   .execute().data)
            n += len(upd) if upd else 0
        return n

    def fetch_index_summaries(self):
        # Root summary per indexed doc, joined to its entity_type. Service role.
        rows = _fetch_all(
            lambda: self.c.table("doc_indexes").select(
                "document_id, root_summary:tree->root->>summary, documents(entity_type)"
            ),
            order_col="document_id",
        )
        out = []
        for r in rows:
            doc = r.get("documents") or {}
            root_summary = r.get("root_summary")
            if root_summary is None:
                root = (r.get("tree") or {}).get("root") or {}
                root_summary = root.get("summary", "")
            out.append({"entity_type": doc.get("entity_type", "unknown"),
                        "root_summary": root_summary or ""})
        return out

    # ── Scheduled briefs (briefs.py) — service role ──────────────────────
    def scheduled_queries(self):
        from datetime import datetime
        rows = (self.c.table("scheduled_queries")
                .select("id, owner, question, cadence, last_run_at").execute().data) or []
        for r in rows:
            r["last_run_at"] = datetime.fromisoformat(r["last_run_at"]) if r.get("last_run_at") else None
        return rows

    def user_email(self, user_id):
        return self.c.auth.admin.get_user_by_id(user_id).user.email

    def post_notification(self, row):
        # Same dedupe contract as the SQL sweep: a repeat is a no-op.
        self.c.table("notifications").upsert(
            row, on_conflict="user_id,dedupe_key", ignore_duplicates=True).execute()

    def mark_brief(self, query_id, ran_at, error):
        self.c.table("scheduled_queries").update(
            {"last_run_at": ran_at.isoformat(), "last_error": error}).eq("id", query_id).execute()

    def save_collections(self, collections, model):
        for c in collections:
            self.c.table("collection_indexes").upsert({
                "collection_key": c["collection_key"], "title": c["title"],
                "summary": c["summary"], "document_count": c["document_count"],
                "model": model,
            }).execute()

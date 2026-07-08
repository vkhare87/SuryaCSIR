from dataclasses import dataclass


@dataclass
class DocRow:
    id: str
    storage_bucket: str
    storage_path: str
    mime_type: str
    title: str


MAX_INGEST_ATTEMPTS = 3


class FakeDB:
    def __init__(self, docs, storage):
        self._docs = {d.id: d for d in docs}
        self.status = {d.id: "pending" for d in docs}
        self.attempts = {d.id: 0 for d in docs}
        self.storage = storage
        self.indexes = {}
        self.pages = {}

    def claim_pending(self):
        for did, st in self.status.items():
            if st == "pending":
                self.status[did] = "processing"
                return self._docs[did]
        for did, st in self.status.items():  # retry failures under the attempt cap
            if st == "failed" and self.attempts[did] < MAX_INGEST_ATTEMPTS:
                self.status[did] = "processing"
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
        q = self.c.table("documents").select("*").eq("ingest_status", status)
        if max_attempts is not None:
            q = q.lt("ingest_attempts", max_attempts)
        rows = q.limit(1).execute().data
        if not rows:
            return None
        row = rows[0]
        upd = (self.c.table("documents").update({"ingest_status": "processing"})
               .eq("id", row["id"]).eq("ingest_status", status).execute().data)
        return row if upd else None  # None: lost the race

    def download(self, bucket, path):
        return self.c.storage.from_(bucket).download(path)

    def save_index(self, document_id, tree, model, page_count):
        self.c.table("doc_indexes").upsert({
            "document_id": document_id, "tree": tree,
            "model": model, "page_count": page_count,
        }).execute()

    def save_pages(self, document_id, pages):
        # Delete-then-insert so a shrunken reparse leaves no stale tail pages.
        self.c.table("doc_pages").delete().eq("document_id", document_id).execute()
        rows = [{"document_id": document_id, "page": p.index + 1, "text": p.text}
                for p in pages]
        if rows:
            self.c.table("doc_pages").insert(rows).execute()

    def mark(self, document_id, status, error=None):
        patch = {"ingest_status": status, "ingest_error": error}
        if status == "failed":
            rows = (self.c.table("documents").select("ingest_attempts")
                    .eq("id", document_id).execute().data)
            patch["ingest_attempts"] = (rows[0].get("ingest_attempts", 0) + 1) if rows else 1
        self.c.table("documents").update(patch).eq("id", document_id).execute()

    def requeue_stale_model(self, model):
        """Reset indexed docs whose index was built by a different model; the
        normal loop rebuilds them. Returns the number requeued."""
        rows = (self.c.table("doc_indexes").select("document_id, model")
                .neq("model", model).execute().data) or []
        ids = [r["document_id"] for r in rows]
        n = 0
        for doc_id in ids:
            upd = (self.c.table("documents")
                   .update({"ingest_status": "pending", "ingest_error": None,
                            "ingest_attempts": 0})
                   .eq("id", doc_id).eq("ingest_status", "indexed").execute().data)
            n += 1 if upd else 0
        return n

    def fetch_index_summaries(self):
        # Root summary per indexed doc, joined to its entity_type. Service role.
        rows = (self.c.table("doc_indexes")
                .select("tree, documents(entity_type)").execute().data) or []
        out = []
        for r in rows:
            doc = r.get("documents") or {}
            root = (r.get("tree") or {}).get("root") or {}
            out.append({"entity_type": doc.get("entity_type", "unknown"),
                        "root_summary": root.get("summary", "")})
        return out

    def save_collections(self, collections, model):
        for c in collections:
            self.c.table("collection_indexes").upsert({
                "collection_key": c["collection_key"], "title": c["title"],
                "summary": c["summary"], "document_count": c["document_count"],
                "model": model,
            }).execute()

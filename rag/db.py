from dataclasses import dataclass


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
        self.pages = {}

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

    def save_pages(self, document_id, pages):
        self.pages[document_id] = {p.index + 1: p.text for p in pages}

    def mark(self, document_id, status, error=None):
        self.status[document_id] = status


class SupabaseDB:
    def __init__(self, config):
        from supabase import create_client
        self.c = create_client(config.supabase_url, config.supabase_service_key)

    def claim_pending(self):
        # Atomic claim: flip exactly one pending row to processing.
        # ponytail: single-worker assumed; add a SELECT ... FOR UPDATE SKIP LOCKED
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

    def save_pages(self, document_id, pages):
        # Delete-then-insert so a shrunken reparse leaves no stale tail pages.
        self.c.table("doc_pages").delete().eq("document_id", document_id).execute()
        rows = [{"document_id": document_id, "page": p.index + 1, "text": p.text}
                for p in pages]
        if rows:
            self.c.table("doc_pages").insert(rows).execute()

    def mark(self, document_id, status, error=None):
        self.c.table("documents").update(
            {"ingest_status": status, "ingest_error": error}
        ).eq("id", document_id).execute()

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

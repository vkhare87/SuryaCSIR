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

    def mark(self, document_id, status, error=None):
        self.c.table("documents").update(
            {"ingest_status": status, "ingest_error": error}
        ).eq("id", document_id).execute()

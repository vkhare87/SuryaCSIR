class FakeDB:
    """In-memory DB for tests — mirrors the SupabaseDB surface used by sink.py."""

    def __init__(self):
        self.harvested = {}
        self.documents = {}
        self.storage = {}
        self.sender_map = {}
        self._next_id = 1

    def _id(self) -> str:
        i = self._next_id
        self._next_id += 1
        return f"id-{i}"

    def hash_exists(self, structured, content_hash):
        table = self.harvested if structured else self.documents
        return any(row["content_hash"] == content_hash for row in table.values())

    def upload(self, path, content, mime_type):
        self.storage[path] = content
        return True

    def insert_harvested_import(self, **kw):
        rid = self._id()
        self.harvested[rid] = {**kw, "id": rid, "status": "pending"}
        return rid

    def insert_document(self, **kw):
        rid = self._id()
        self.documents[rid] = {**kw, "id": rid, "ingest_status": "pending"}
        return rid

    def load_sender_map(self):
        return dict(self.sender_map)


class SupabaseDB:
    def __init__(self, cfg):
        from supabase import create_client
        self.c = create_client(cfg.supabase_url, cfg.supabase_service_key)
        self.owner_id = cfg.ingest_owner_user_id

    def hash_exists(self, structured, content_hash):
        table = "harvested_imports" if structured else "documents"
        rows = (self.c.table(table).select("id").eq("content_hash", content_hash)
                .limit(1).execute().data)
        return bool(rows)

    def upload(self, path, content, mime_type):
        # upsert: path embeds the content hash, so a re-upload is byte-identical.
        # Without it, a file whose DB insert failed after a successful upload
        # would 409 here forever and never land.
        try:
            self.c.storage.from_("documents").upload(
                path, content, {"content-type": mime_type, "upsert": "true"})
            return True
        except Exception:
            return False

    def insert_harvested_import(self, **kw):
        rows = self.c.table("harvested_imports").insert({
            "file_name": kw["file_name"], "source": kw["source"],
            "source_identifier": kw["source_identifier"], "division_code": kw["division_code"],
            "storage_path": kw["storage_path"], "file_size": kw["file_size"],
            "content_hash": kw["content_hash"],
        }).execute().data
        return rows[0]["id"] if rows else None

    def insert_document(self, **kw):
        rows = self.c.table("documents").insert({
            "entity_type": "harvested", "entity_id": kw["content_hash"],
            "doc_type": "harvested_file", "title": kw["file_name"],
            "storage_bucket": "documents", "storage_path": kw["storage_path"],
            "file_name": kw["file_name"], "file_size": kw["file_size"],
            "mime_type": kw["mime_type"], "owner_id": self.owner_id,
            "division_code": kw["division_code"], "access_tier": "institute",
            "content_hash": kw["content_hash"],
        }).execute().data
        return rows[0]["id"] if rows else None

    def load_sender_map(self):
        rows = self.c.table("ingest_sender_map").select("email, division_code").execute().data or []
        return {r["email"]: r["division_code"] for r in rows}

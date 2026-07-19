from classify import is_structured, mime_for
from hashing import content_hash, sanitize_filename


def land_file(db, source: str, source_identifier: str, division_code: str | None,
              filename: str, content: bytes) -> str | None:
    """Uploads to Storage and registers the file for review/ingest. Returns
    the new row id, or None if it's a dedupe hit or the upload failed.

    Structured (xlsx/xls/csv) -> harvested_imports (human confirms via the
    existing ImportFlow before anything touches HR tables).
    Everything else -> documents, ingest_status='pending' (existing RAG
    worker drains it — read-only corpus, no HR-table risk, safe to auto-ingest).
    """
    structured = is_structured(filename)
    h = content_hash(content)
    if db.hash_exists(structured, h):
        return None

    path = f"harvested/{source}/{h}_{sanitize_filename(filename)}"
    if not db.upload(path, content, mime_for(filename)):
        return None

    if structured:
        return db.insert_harvested_import(
            file_name=filename, source=source, source_identifier=source_identifier,
            division_code=division_code, storage_path=path,
            file_size=len(content), content_hash=h,
        )
    return db.insert_document(
        file_name=filename, storage_path=path, division_code=division_code,
        file_size=len(content), content_hash=h, mime_type=mime_for(filename),
    )

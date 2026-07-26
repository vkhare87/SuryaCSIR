from classify import is_structured, mime_for, rejection_reason
from hashing import content_hash, sanitize_filename


class RejectedFile(Exception):
    """Refused at the ingest boundary — never reached Storage or the DB."""


def land_file(db, source: str, source_identifier: str, division_code: str | None,
              filename: str, content: bytes) -> str | None:
    """Uploads to Storage and registers the file for review/ingest. Returns
    the new row id, or None if it's a dedupe hit or the upload failed.

    Structured (xlsx/xls/csv) -> harvested_imports (human confirms via the
    existing ImportFlow before anything touches HR tables).
    Everything else -> documents, ingest_status='pending' (the RAG worker
    drains it) at the narrowest access tier the source justifies. It used to
    land at 'institute', which documents_can_read() exposes to every
    authenticated user — so an unreviewed harvested file was published
    institute-wide and indexed as grounded knowledge. An admin promotes a
    reviewed file with documents_set_access_tier().
    """
    # Allowlist first — before hashing, before Storage, before the parsers.
    # Both sources are attacker-influenced (a network share and an inbox).
    reason = rejection_reason(filename, len(content))
    if reason is not None:
        raise RejectedFile(f"{filename!r} refused: {reason}")

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
        access_tier="division" if division_code else "confidential",
    )

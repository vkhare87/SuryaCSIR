STRUCTURED_EXTENSIONS = {"xlsx", "xls", "csv"}

MIME_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "csv": "text/csv",
    "pdf": "application/pdf",
}


def extension_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_structured(filename: str) -> bool:
    """Excel/CSV → structured (queues for human-confirmed HR import).
    Everything else (PDF, scans, docs) → unstructured (RAG-only ingest)."""
    return extension_of(filename) in STRUCTURED_EXTENSIONS


def mime_for(filename: str) -> str:
    return MIME_TYPES.get(extension_of(filename), "application/octet-stream")

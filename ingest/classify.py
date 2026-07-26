STRUCTURED_EXTENSIONS = {"xlsx", "xls", "csv"}

# Unstructured types the RAG pipeline can actually parse (rag/parse.py).
UNSTRUCTURED_EXTENSIONS = {"pdf", "docx", "doc", "txt", "md", "png", "jpg", "jpeg", "tif", "tiff"}

# A5.2 — boundary allowlist. Harvested bytes are attacker-influenced: the
# folder source reads a network share and the mail source reads an inbox.
# Downstream they reach PyMuPDF and the OCR path, i.e. native code. An
# allowlist here is what keeps "someone mailed us a file" from being
# "someone chose which parser to feed".
ALLOWED_EXTENSIONS = STRUCTURED_EXTENSIONS | UNSTRUCTURED_EXTENSIONS

# Institute files run to a few MB; anything past this is not a report.
MAX_FILE_BYTES = 25 * 1024 * 1024

MIME_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "csv": "text/csv",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "txt": "text/plain",
    "md": "text/markdown",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "tif": "image/tiff",
    "tiff": "image/tiff",
}


def extension_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def is_structured(filename: str) -> bool:
    """Excel/CSV → structured (queues for human-confirmed HR import).
    Everything else (PDF, scans, docs) → unstructured (RAG-only ingest)."""
    return extension_of(filename) in STRUCTURED_EXTENSIONS


def rejection_reason(filename: str, size: int) -> str | None:
    """None when the file may be landed, else why it was refused.

    Extension is checked on the *final* segment only, so `invoice.pdf.exe`
    is refused — a double extension is the oldest trick for getting a
    parser to disagree with a human about what a file is.
    """
    ext = extension_of(filename)
    if not ext:
        return "no file extension"
    if ext not in ALLOWED_EXTENSIONS:
        return f"extension '{ext}' is not in the ingest allowlist"
    if size > MAX_FILE_BYTES:
        return f"file is {size} bytes, over the {MAX_FILE_BYTES}-byte limit"
    if size == 0:
        return "file is empty"
    return None


def mime_for(filename: str) -> str:
    return MIME_TYPES.get(extension_of(filename), "application/octet-stream")

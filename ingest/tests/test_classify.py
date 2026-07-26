import pytest

from classify import MAX_FILE_BYTES, is_structured, mime_for, extension_of, rejection_reason


def test_structured_extensions():
    assert is_structured("report.xlsx")
    assert is_structured("REPORT.XLS")
    assert is_structured("data.csv")
    assert not is_structured("scan.pdf")
    assert not is_structured("notes.docx")
    assert not is_structured("noextension")


def test_extension_of_no_dot():
    assert extension_of("noextension") == ""


def test_mime_for_known_and_unknown():
    assert mime_for("x.csv") == "text/csv"
    assert mime_for("x.pdf") == "application/pdf"
    assert mime_for("x.weird") == "application/octet-stream"


# ── Boundary allowlist (A5.2) ──────────────────────────────────────────
# Harvested bytes are attacker-influenced and end up in PyMuPDF and the OCR
# path, i.e. native code. The allowlist decides which parsers are reachable.

@pytest.mark.parametrize("filename", [
    "staff.xlsx", "staff.xls", "staff.csv",
    "scan.pdf", "notes.docx", "readme.md", "photo.jpeg", "fax.tiff",
])
def test_allowed_types_pass(filename):
    assert rejection_reason(filename, 1024) is None


@pytest.mark.parametrize("filename", [
    "payload.exe", "script.sh", "lib.dll", "archive.zip", "macro.xlsm",
])
def test_disallowed_types_are_refused(filename):
    assert rejection_reason(filename, 1024) is not None


def test_double_extension_is_refused():
    """The final segment decides. A double extension is the oldest way to get
    a parser to disagree with a human about what a file is."""
    assert rejection_reason("invoice.pdf.exe", 1024) is not None


def test_missing_extension_is_refused():
    assert rejection_reason("attachment", 1024) == "no file extension"


def test_empty_file_is_refused():
    assert rejection_reason("scan.pdf", 0) == "file is empty"


def test_oversized_file_is_refused():
    assert "over the" in rejection_reason("scan.pdf", MAX_FILE_BYTES + 1)
    assert rejection_reason("scan.pdf", MAX_FILE_BYTES) is None

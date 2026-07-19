from classify import is_structured, mime_for, extension_of


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

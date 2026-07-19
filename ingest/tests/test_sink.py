from db import FakeDB
from sink import land_file


def test_structured_file_lands_in_harvested_imports():
    db = FakeDB()
    rid = land_file(db, "folder", "CMPD", "CMPD", "monthly.xlsx", b"row,data")
    assert rid is not None
    assert db.harvested[rid]["division_code"] == "CMPD"
    assert db.harvested[rid]["source"] == "folder"
    assert db.documents == {}


def test_unstructured_file_lands_in_documents():
    db = FakeDB()
    rid = land_file(db, "mail", "hod@ampri.res.in", "CMPD", "scan.pdf", b"%PDF-1.4 ...")
    assert rid is not None
    assert db.documents[rid]["mime_type"] == "application/pdf"
    assert db.harvested == {}


def test_duplicate_content_is_not_relanded():
    db = FakeDB()
    content = b"same bytes"
    first = land_file(db, "folder", "CMPD", "CMPD", "a.xlsx", content)
    second = land_file(db, "folder", "CMPD", "CMPD", "a-copy.xlsx", content)
    assert first is not None
    assert second is None
    assert len(db.harvested) == 1


def test_unmapped_division_still_lands_for_review():
    db = FakeDB()
    rid = land_file(db, "mail", "unknown@example.com", None, "report.csv", b"data")
    assert rid is not None
    assert db.harvested[rid]["division_code"] is None

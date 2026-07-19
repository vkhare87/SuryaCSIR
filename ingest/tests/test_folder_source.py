from pathlib import Path

from folder_source import scan_folder


def test_scan_folder_yields_files_tagged_by_subfolder(tmp_path: Path):
    (tmp_path / "CMPD").mkdir()
    (tmp_path / "CMPD" / "report.xlsx").write_bytes(b"data1")
    (tmp_path / "PCD").mkdir()
    (tmp_path / "PCD" / "scan.pdf").write_bytes(b"data2")
    (tmp_path / "PCD" / ".hidden").write_bytes(b"skip me")
    (tmp_path / "loose-file.xlsx").write_bytes(b"not in a division folder")

    results = sorted(scan_folder(tmp_path), key=lambda f: f.filename)

    assert len(results) == 2
    assert results[0] == ("CMPD", "report.xlsx", b"data1")
    assert results[1] == ("PCD", "scan.pdf", b"data2")


def test_scan_folder_missing_root_yields_nothing(tmp_path: Path):
    assert list(scan_folder(tmp_path / "does-not-exist")) == []

from pathlib import Path
from typing import Iterator, NamedTuple


class FolderFile(NamedTuple):
    division_code: str  # immediate subfolder name under WATCH_ROOT
    filename: str
    content: bytes


# ponytail: re-walks and re-reads the whole tree every pass; dedupe happens
# downstream via content_hash. Fine at institute division-report scale
# (dozens of files, monthly cadence) — add an mtime cache if the tree grows.
def scan_folder(root: Path) -> Iterator[FolderFile]:
    """One subfolder per division under `root`; every file directly inside it
    is a candidate. Doc's tagging rule: folder identity = division code."""
    if not root.is_dir():
        return
    for div_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        for f in sorted(p for p in div_dir.iterdir() if p.is_file() and not p.name.startswith(".")):
            yield FolderFile(division_code=div_dir.name, filename=f.name, content=f.read_bytes())

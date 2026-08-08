"""Transcribe the licensing table out of the institute's 'Patents licensed.pdf'.

Structural table extraction, not text scraping: pymupdf resolves the ruled table
into cells so a row's columns stay aligned even when a cell wraps across lines.
Header rows and rows without an SNo are dropped. Output feeds
scripts/import_licensing.ts — nothing is inferred here, only transcribed.

    python eval/extract_licensing.py [path-to-pdf]
"""
import json
import sys
from pathlib import Path

import fitz

DEFAULT_PDF = Path(r"C:\Users\HP\Desktop\Office\SURYA\Patents licensed.pdf")
OUT = Path(__file__).resolve().parent.parent.parent / "scripts" / "licensing_rows.json"

# Column order in the source table.
FIELDS = ["sno", "lab", "ref_no", "title", "ip_type", "date",
          "licensee", "license_type", "amount"]


def main():
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    doc = fitz.open(pdf)
    rows = []
    for page in doc:
        for table in page.find_tables():
            for cells in table.extract():
                if len(cells) < len(FIELDS):
                    continue
                row = {f: (cells[i] or "").strip() for i, f in enumerate(FIELDS)}
                # Header repeats on every page; data rows start with a serial number.
                if not row["sno"].replace("\n", "").strip().isdigit():
                    continue
                rows.append(row)

    OUT.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"[licensing] {len(rows)} row(s) from {pdf.name} -> {OUT}")
    for r in rows[:3]:
        title = " ".join(r["title"].split())[:60]
        print(f"  {r['sno']:>3} {r['date']:>10}  {title}…  INR {r['amount']}")


if __name__ == "__main__":
    main()

from dataclasses import dataclass


@dataclass
class Page:
    index: int
    text: str
    needs_ocr: bool


@dataclass
class ParsedDoc:
    pages: list
    toc: list


def parse_pdf(data: bytes, ocr) -> ParsedDoc:
    import fitz  # lazy: keep this module importable where the native binary is absent/blocked

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        pages = []
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if text:
                pages.append(Page(index=i, text=text, needs_ocr=False))
            else:
                pix = page.get_pixmap(dpi=200)
                png = pix.tobytes("png")
                pages.append(Page(index=i, text=ocr.image_to_text(png), needs_ocr=True))
        toc = [(lvl, title, pg) for lvl, title, pg in doc.get_toc()]
        return ParsedDoc(pages=pages, toc=toc)
    finally:
        doc.close()

import fitz
from parse import parse_pdf


class StubOCR:
    def __init__(self):
        self.calls = 0

    def image_to_text(self, png: bytes) -> str:
        self.calls += 1
        return "ocr-text"


def _text_pdf(pages_text):
    doc = fitz.open()
    for t in pages_text:
        p = doc.new_page()
        p.insert_text((72, 72), t)
    data = doc.tobytes()
    doc.close()
    return data


def _blank_pdf():
    doc = fitz.open()
    doc.new_page()          # no text -> triggers OCR
    data = doc.tobytes()
    doc.close()
    return data


def test_parse_extracts_text_per_page():
    parsed = parse_pdf(_text_pdf(["hello world", "second page"]), StubOCR())
    assert len(parsed.pages) == 2
    assert "hello world" in parsed.pages[0].text
    assert parsed.pages[0].needs_ocr is False


def test_parse_empty_page_falls_back_to_ocr():
    ocr = StubOCR()
    parsed = parse_pdf(_blank_pdf(), ocr)
    assert ocr.calls == 1
    assert parsed.pages[0].needs_ocr is True
    assert parsed.pages[0].text == "ocr-text"

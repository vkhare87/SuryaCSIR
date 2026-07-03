import io


class NullOCR:
    """Stub OCR for offline/dev. Real scans need TesseractOCR."""

    def image_to_text(self, png: bytes) -> str:
        return ""


class TesseractOCR:
    def image_to_text(self, png: bytes) -> str:
        import pytesseract
        from PIL import Image
        return pytesseract.image_to_string(Image.open(io.BytesIO(png))).strip()


def make_ocr(backend: str):
    if backend == "null":
        return NullOCR()
    if backend == "tesseract":
        return TesseractOCR()
    raise ValueError(f"Unknown OCR_BACKEND: {backend}")

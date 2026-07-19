import base64
import io
import json
import os
import urllib.request

OLLAMA_OCR_TIMEOUT_S = int(os.environ.get("RAG_OCR_TIMEOUT_S", "300"))

_OCR_PROMPT = (
    "Extract all text from this image exactly as written, preserving reading order. "
    "Output only the extracted text, nothing else. If the image contains no text, "
    "output nothing."
)


class NullOCR:
    """Stub OCR for offline/dev. Real scans need TesseractOCR."""

    def image_to_text(self, png: bytes) -> str:
        return ""


class TesseractOCR:
    def image_to_text(self, png: bytes) -> str:
        import pytesseract
        from PIL import Image
        return pytesseract.image_to_string(Image.open(io.BytesIO(png))).strip()


class OllamaVisionOCR:
    """OCR via an Ollama multimodal model (native /api/generate with images)."""

    def __init__(self, base_url: str, model: str):
        # OPENLLM_BASE_URL points at the OpenAI-compat /v1; native API lives at root.
        self.base_url = base_url.rstrip("/").removesuffix("/v1")
        self.model = model

    def image_to_text(self, png: bytes) -> str:
        payload = {
            "model": self.model,
            "prompt": _OCR_PROMPT,
            "images": [base64.b64encode(png).decode()],
            "stream": False,
        }
        req = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=OLLAMA_OCR_TIMEOUT_S) as r:
            return json.load(r)["response"].strip()


def make_ocr(backend: str):
    if backend == "null":
        return NullOCR()
    if backend == "tesseract":
        return TesseractOCR()
    if backend == "ollama":
        return OllamaVisionOCR(
            os.environ.get("OPENLLM_BASE_URL", "http://localhost:11434/v1"),
            os.environ.get("OCR_MODEL", os.environ.get("OPENLLM_MODEL", "gemma4:e4b")),
        )
    raise ValueError(f"Unknown OCR_BACKEND: {backend}")

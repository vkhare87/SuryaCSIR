import pytest
from ocr import NullOCR, OllamaVisionOCR, make_ocr


def test_null_ocr_returns_empty():
    assert NullOCR().image_to_text(b"anything") == ""


def test_make_ocr_selects_null():
    assert isinstance(make_ocr("null"), NullOCR)


def test_make_ocr_selects_ollama():
    assert isinstance(make_ocr("ollama"), OllamaVisionOCR)


def test_ollama_ocr_strips_v1_suffix():
    assert OllamaVisionOCR("http://localhost:11434/v1", "m").base_url == "http://localhost:11434"
    assert OllamaVisionOCR("http://localhost:11434", "m").base_url == "http://localhost:11434"


def test_make_ocr_unknown_raises():
    with pytest.raises(ValueError):
        make_ocr("bogus")

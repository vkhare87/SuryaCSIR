import pytest
from ocr import NullOCR, make_ocr


def test_null_ocr_returns_empty():
    assert NullOCR().image_to_text(b"anything") == ""


def test_make_ocr_selects_null():
    assert isinstance(make_ocr("null"), NullOCR)


def test_make_ocr_unknown_raises():
    with pytest.raises(ValueError):
        make_ocr("bogus")

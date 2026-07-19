from hashing import content_hash, sanitize_filename


def test_content_hash_deterministic_and_distinct():
    assert content_hash(b"abc") == content_hash(b"abc")
    assert content_hash(b"abc") != content_hash(b"abd")


def test_sanitize_filename_strips_unsafe_chars_and_truncates():
    assert sanitize_filename("report (final)!.xlsx") == "report__final__.xlsx"
    assert len(sanitize_filename("a" * 200 + ".xlsx")) == 120

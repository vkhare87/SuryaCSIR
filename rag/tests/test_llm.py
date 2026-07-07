import pytest
from llm import FakeLLM, make_llm


def test_fake_llm_deterministic_and_truncates():
    llm = FakeLLM()
    long = "x" * 200
    s = llm.summarize(long)
    assert s == "x" * 80
    assert llm.summarize(long) == s          # deterministic
    assert llm.model == "fake"


def test_fake_llm_first_line_only():
    assert FakeLLM().summarize("line one\nline two") == "line one"


def test_make_llm_unknown_raises():
    with pytest.raises(ValueError):
        make_llm("bogus", "http://x", "m")


def test_fake_llm_answer_grounded_in_context():
    out = FakeLLM().answer("what is X", "X is a project\nmore lines")
    assert out == "X is a project"


def test_fake_llm_answer_empty_context_not_found():
    from llm import NOT_FOUND
    assert FakeLLM().answer("what is X", "   ") == NOT_FOUND

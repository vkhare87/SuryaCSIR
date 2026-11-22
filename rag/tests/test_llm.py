import pytest
from llm import FakeLLM, make_llm, resolve_endpoint


def test_provider_preset_supplies_endpoint():
    """Switching hosts should need a provider name and a key, nothing more."""
    url, model = resolve_endpoint("deepseek")
    assert url == "https://api.deepseek.com/v1"
    assert model == "deepseek-v4-flash"
    assert resolve_endpoint("ollama")[0] == "http://localhost:11434/v1"


def test_explicit_env_overrides_preset():
    url, model = resolve_endpoint("ollama", model="gemma4:12b")
    assert (url, model) == ("http://localhost:11434/v1", "gemma4:12b")
    assert resolve_endpoint("", "https://api.other.ai/v1", "m") == ("https://api.other.ai/v1", "m")


def test_unknown_provider_and_missing_endpoint_raise():
    with pytest.raises(ValueError, match="Unknown LLM_PROVIDER"):
        resolve_endpoint("not-a-provider")
    with pytest.raises(ValueError, match="No model endpoint configured"):
        resolve_endpoint()
    with pytest.raises(ValueError, match="No model endpoint configured"):
        resolve_endpoint(base_url="https://api.other.ai/v1")  # model missing


def test_api_key_sets_bearer_header_only_when_present(monkeypatch):
    monkeypatch.delenv("OPENLLM_API_KEY", raising=False)
    keyed = make_llm("openllm", provider="deepseek", api_key="sk-test")
    assert keyed._request("hi", None).headers["Authorization"] == "Bearer sk-test"
    local = make_llm("openllm", provider="ollama")
    assert "Authorization" not in local._request("hi", None).headers


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


def test_fake_llm_map_columns_matches_column_or_label():
    import json
    fields = [{"column": "DOJ", "label": "Date of Joining"}]
    reply = json.loads(FakeLLM().map_columns(["doj", "Date of Joining", "Unrelated"], fields))
    assert reply == {"mapping": {"doj": "DOJ", "Date of Joining": "DOJ", "Unrelated": None}}

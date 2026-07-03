import pytest
from config import load_config

BASE = {
    "SUPABASE_URL": "http://x", "SUPABASE_SERVICE_KEY": "k", "SUPABASE_ANON_KEY": "a",
    "OPENLLM_BASE_URL": "http://llm/v1", "OPENLLM_MODEL": "m",
    "OCR_BACKEND": "null", "LLM_BACKEND": "fake",
    "POLL_INTERVAL_S": "30", "BATCH_SIZE": "5",
}


def test_load_config_parses_ints():
    cfg = load_config(BASE)
    assert cfg.poll_interval_s == 30
    assert cfg.batch_size == 5
    assert cfg.llm_backend == "fake"


def test_load_config_missing_required_raises():
    broken = {k: v for k, v in BASE.items() if k != "SUPABASE_SERVICE_KEY"}
    with pytest.raises(ValueError) as e:
        load_config(broken)
    assert "SUPABASE_SERVICE_KEY" in str(e.value)

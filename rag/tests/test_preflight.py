import preflight


def test_required_env_worker_mode_flags_missing():
    ok, detail = preflight.check_env({"SUPABASE_URL": "x"}, mode="worker")
    assert ok is False and "SUPABASE_SERVICE_KEY" in detail


def test_required_env_api_mode_ignores_service_key():
    env = {k: "x" for k in preflight.required_env("api")}
    assert "SUPABASE_SERVICE_KEY" not in preflight.required_env("api")
    ok, _ = preflight.check_env(env, mode="api")
    assert ok is True


def test_python_version_warns_on_non_312():
    ok, detail = preflight.check_python((3, 14, 3))
    assert ok is False and "3.12" in detail
    ok, _ = preflight.check_python((3, 12, 10))
    assert ok is True


def test_ollama_model_present_and_absent():
    payload = {"data": [{"id": "llama3.1:8b"}]}
    ok, _ = preflight.check_model_listed(payload, "llama3.1:8b")
    assert ok is True
    ok, detail = preflight.check_model_listed(payload, "mistral:7b")
    assert ok is False and "ollama pull" in detail


def test_schema_probe_classifies_missing_table():
    ok, detail = preflight.classify_probe_error(
        'relation "public.route_labels" does not exist')
    assert ok is False and "20260707030000_route_labels.sql" in detail


def test_schema_probe_missing_column():
    ok, detail = preflight.classify_probe_error(
        "column query_log.latency_ms does not exist")
    assert ok is False and "20260707000000_query_log_latency.sql" in detail

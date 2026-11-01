"""SEC-02 / SEC-09: the API asks the database whether the caller may use it,
fails closed, and bounds what one call can feed the model."""

import os

import pytest

os.environ.setdefault("SUPABASE_URL", "http://supabase.test")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")

from fastapi.testclient import TestClient  # noqa: E402

import api  # noqa: E402
from answer import Answer  # noqa: E402

AUTH = {"Authorization": "Bearer jwt"}


class _Exec:
    def __init__(self, data):
        self.data = data


class _Client:
    """Scoped client whose rpc(name) answers from `gates`; a value that is an
    exception is raised, the way a PostgREST error would be."""

    def __init__(self, gates):
        self.gates = gates

    def rpc(self, name, _args):
        value = self.gates.get(name)

        class _Call:
            def execute(self):
                if isinstance(value, Exception):
                    raise value
                return _Exec(value)

        return _Call()


@pytest.fixture
def gates(monkeypatch):
    g = {"can_use_ask_surya": True, "caller_is_admin": True}
    monkeypatch.setattr(api, "verify_token", lambda *a: object())
    monkeypatch.setattr(api, "scoped_client", lambda *a: _Client(g))
    monkeypatch.setattr(api, "handle_query", lambda *a, **k: Answer(text="ok", mode="rag", citations=[]))
    monkeypatch.setattr(api, "stream_query", lambda *a, **k: iter([("done", Answer(text="ok", mode="rag", citations=[]))]))
    monkeypatch.setattr(api, "log_query", lambda *a, **k: "q1")
    monkeypatch.setattr(api, "find_similar", lambda *a: [])
    monkeypatch.setattr(api, "suggest_mapping", lambda *a: {})
    return g


http = TestClient(api.app)
MAP_BODY = {"raw_headers": ["Name"], "target_fields": [{"column": "StaffName", "label": "Name"}]}


def test_query_200_when_gate_true(gates):
    assert http.post("/query", json={"question": "x"}, headers=AUTH).status_code == 200


@pytest.mark.parametrize("closed", [False, None, RuntimeError("db down")])
def test_query_403_when_gate_closed_or_failing(gates, closed):
    gates["can_use_ask_surya"] = closed
    assert http.post("/query", json={"question": "x"}, headers=AUTH).status_code == 403


def test_stream_403_when_gate_false(gates):
    gates["can_use_ask_surya"] = False
    assert http.post("/query/stream", json={"question": "x"}, headers=AUTH).status_code == 403


def test_similar_403_when_gate_false(gates):
    gates["can_use_ask_surya"] = False
    assert http.post("/similar", json={"text": "x"}, headers=AUTH).status_code == 403


def test_map_columns_needs_a_data_admin_not_the_ask_switch(gates):
    gates["can_use_ask_surya"] = False
    assert http.post("/map-columns", json=MAP_BODY, headers=AUTH).status_code == 200
    gates["caller_is_admin"] = False
    assert http.post("/map-columns", json=MAP_BODY, headers=AUTH).status_code == 403


def test_history_of_7_turns_is_422(gates):
    turns = [{"question": "q", "answer": "a"}] * (api.MAX_HISTORY_TURNS + 1)
    assert http.post("/query", json={"question": "x", "history": turns}, headers=AUTH).status_code == 422


def test_history_of_6_turns_is_allowed(gates):
    turns = [{"question": "q", "answer": "a"}] * api.MAX_HISTORY_TURNS
    assert http.post("/query", json={"question": "x", "history": turns}, headers=AUTH).status_code == 200


def test_question_over_the_cap_is_422(gates):
    q = "x" * (api.MAX_QUESTION_CHARS + 1)
    assert http.post("/query", json={"question": q}, headers=AUTH).status_code == 422
    assert http.post("/similar", json={"text": q}, headers=AUTH).status_code == 422


def test_empty_question_is_400(gates):
    assert http.post("/query", json={"question": "   "}, headers=AUTH).status_code == 400


def test_no_token_is_401_before_any_gate(gates):
    assert http.post("/query", json={"question": "x"}).status_code == 401

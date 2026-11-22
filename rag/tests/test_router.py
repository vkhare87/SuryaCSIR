import json

from router import decide
from llm import FakeLLM

CAT = {"count_documents_by_status": "Count documents by status."}


def test_decide_structured():
    d = decide("COUNT projects per division", FakeLLM(), CAT)
    assert d == {"route": "structured", "function": "count_documents_by_status", "params": {}}


def test_decide_how_many_routes_structured():
    assert decide("How many documents are indexed?", FakeLLM(), CAT)["route"] == "structured"


def test_decide_hybrid():
    d = decide("HYBRID documents status plus report context", FakeLLM(), CAT)
    assert d == {"route": "hybrid", "function": "count_documents_by_status", "params": {}}


def test_decide_hybrid_requires_whitelisted_function():
    class Liar:
        def route(self, q, catalog, examples=None):
            return json.dumps({"route": "hybrid", "function": "nope", "params": {}})
    assert decide("anything", Liar(), CAT)["route"] == "document"


def test_decide_document_default():
    d = decide("what does the report say about outcomes", FakeLLM(), CAT)
    assert d == {"route": "document", "function": None, "params": {}}


def test_decide_falls_back_on_garbage_reply():
    class Garbage:
        def route(self, q, catalog, examples=None):
            return "???"
    assert decide("anything", Garbage(), CAT)["route"] == "document"


def test_decide_rejects_non_whitelisted_function():
    class Liar:
        def route(self, q, catalog, examples=None):
            return json.dumps({"route": "structured", "function": "drop_tables", "params": {}})
    assert decide("anything", Liar(), CAT) == {"route": "document", "function": None, "params": {}}


def test_decide_rejects_unknown_route():
    class Weird:
        def route(self, q, catalog, examples=None):
            return json.dumps({"route": "clairvoyant", "function": None, "params": {}})
    assert decide("anything", Weird(), CAT)["route"] == "document"


def test_decide_strips_code_fences():
    class Fenced:
        def route(self, q, catalog, examples=None):
            return ('```json\n{"route": "structured", '
                    '"function": "count_documents_by_status", "params": {}}\n```')
    assert decide("anything", Fenced(), CAT)["route"] == "structured"


def test_decide_drops_non_dict_params():
    class BadParams:
        def route(self, q, catalog, examples=None):
            return json.dumps({"route": "structured",
                               "function": "count_documents_by_status", "params": [1]})
    assert decide("anything", BadParams(), CAT)["params"] == {}

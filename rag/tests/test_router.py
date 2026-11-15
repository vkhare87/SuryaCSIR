import json

from router import decide
from llm import FakeLLM

CAT = {"count_documents_by_status": "Count documents by status."}


def core(d):
    return {k: d[k] for k in ("route", "function", "params")}


def replying(raw):
    class R:
        def route(self, q, catalog, examples=None):
            return raw
    return R()


def test_decide_structured():
    d = decide("COUNT projects per division", FakeLLM(), CAT)
    assert core(d) == {"route": "structured", "function": "count_documents_by_status", "params": {}}


def test_decide_how_many_routes_structured():
    assert decide("How many documents are indexed?", FakeLLM(), CAT)["route"] == "structured"


def test_decide_hybrid():
    d = decide("HYBRID documents status plus report context", FakeLLM(), CAT)
    assert core(d) == {"route": "hybrid", "function": "count_documents_by_status", "params": {}}


def test_decide_hybrid_requires_whitelisted_function():
    class Liar:
        def route(self, q, catalog, examples=None):
            return json.dumps({"route": "hybrid", "function": "nope", "params": {}})
    assert decide("anything", Liar(), CAT)["route"] == "document"


def test_decide_document_default():
    d = decide("what does the report say about outcomes", FakeLLM(), CAT)
    assert core(d) == {"route": "document", "function": None, "params": {}}


def test_decide_falls_back_on_garbage_reply():
    class Garbage:
        def route(self, q, catalog, examples=None):
            return "???"
    assert decide("anything", Garbage(), CAT)["route"] == "document"


def test_decide_rejects_non_whitelisted_function():
    class Liar:
        def route(self, q, catalog, examples=None):
            return json.dumps({"route": "structured", "function": "drop_tables", "params": {}})
    assert core(decide("anything", Liar(), CAT)) == {"route": "document", "function": None, "params": {}}


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


def test_topic_and_subject_pass_through():
    d = decide("q", replying('{"route":"document","function":null,"params":{},"topic":"pms_scores","subject":"other_person"}'), CAT)
    assert (d["topic"], d["subject"], d["subject_division"]) == ("pms_scores", "other_person", None)


def test_unlisted_topic_or_subject_becomes_unknown():
    d = decide("q", replying('{"route":"document","topic":"PMS","subject":"somebody"}'), CAT)
    assert (d["topic"], d["subject"]) == ("unknown", "unknown")


def test_missing_fields_become_unknown():
    d = decide("q", replying('{"route":"document"}'), CAT)
    assert (d["topic"], d["subject"]) == ("unknown", "unknown")


def test_prose_reply_is_unknown_document():
    d = decide("q", replying("I cannot help"), CAT)
    assert (d["route"], d["topic"], d["subject"]) == ("document", "unknown", "unknown")


def test_non_object_json_is_unknown_document():
    d = decide("q", replying('{"a": 1} and [1]'), CAT)
    assert d["route"] == "document"


def test_bad_route_keeps_good_topic():
    d = decide("q", replying('{"route":"sql","topic":"proposals","subject":"lab"}'), CAT)
    assert (d["route"], d["topic"], d["subject"]) == ("document", "proposals", "lab")


def test_subject_division_is_a_trimmed_string_or_none():
    d = decide("q", replying('{"route":"document","topic":"projects","subject":"division","subject_division":" D2 "}'), CAT)
    assert d["subject_division"] == "D2"
    d = decide("q", replying('{"route":"document","topic":"projects","subject":"division","subject_division":7}'), CAT)
    assert d["subject_division"] is None

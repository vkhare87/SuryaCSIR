from router import route
from llm import FakeLLM


def test_route_structured():
    assert route("COUNT projects per division", FakeLLM()) == "structured"


def test_route_document_default():
    assert route("what does the report say about outcomes", FakeLLM()) == "document"


def test_route_defaults_document_on_garbage():
    class Garbage:
        def classify(self, q):
            return "???"
    assert route("anything", Garbage()) == "document"

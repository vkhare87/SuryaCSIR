import json

from llm import FakeLLM
from mapping_service import suggest_mapping

TARGET_FIELDS = [
    {"column": "Name", "label": "Full Name"},
    {"column": "DOJ", "label": "Date of Joining"},
    {"column": "Email", "label": "Email"},
]


def test_exact_column_match():
    result = suggest_mapping(FakeLLM(), ["Name"], TARGET_FIELDS)
    assert result == {"Name": "Name"}


def test_exact_label_match_case_insensitive():
    result = suggest_mapping(FakeLLM(), ["date of joining"], TARGET_FIELDS)
    assert result == {"date of joining": "DOJ"}


def test_no_match_maps_to_none():
    result = suggest_mapping(FakeLLM(), ["Blood Group"], TARGET_FIELDS)
    assert result == {"Blood Group": None}


def test_hallucinated_column_is_dropped():
    class _HallucinatingLLM:
        def map_columns(self, raw_headers, target_fields):
            return json.dumps({"mapping": {"Weird Header": "NotARealColumn"}})

    result = suggest_mapping(_HallucinatingLLM(), ["Weird Header"], TARGET_FIELDS)
    assert result == {"Weird Header": None}


def test_duplicate_target_only_first_header_wins():
    class _DuplicatingLLM:
        def map_columns(self, raw_headers, target_fields):
            return json.dumps({"mapping": {"Full Name": "Name", "Employee Name": "Name"}})

    result = suggest_mapping(_DuplicatingLLM(), ["Full Name", "Employee Name"], TARGET_FIELDS)
    assert result == {"Full Name": "Name", "Employee Name": None}


def test_malformed_llm_reply_maps_everything_to_none():
    class _BrokenLLM:
        def map_columns(self, raw_headers, target_fields):
            return "not json"

    result = suggest_mapping(_BrokenLLM(), ["Name", "Email"], TARGET_FIELDS)
    assert result == {"Name": None, "Email": None}

import pytest
from scope import verdict, scope_of, looks_like_self, SCOPE_REFUSAL_TEXT


def S(*roles, division="D1", name="Asha Rao"):
    return {"roles": set(roles), "staff_id": "S1", "staff_name": name, "division": division, "lab": "AMPRI"}


def test_refusal_copy():
    assert SCOPE_REFUSAL_TEXT == "This information cannot be retrieved for you."


CELLS = [
    (("Director",), "pms_scores", "other_person", None, "full"),
    (("MasterAdmin",), "personal_details", "lab", None, "full"),
    (("EmpoweredCommittee",), "pms_scores", "other_person", None, "full"),
    (("EmpoweredCommittee",), "personal_details", "other_person", None, "refuse"),
    (("EmpoweredCommittee",), "proposals", "lab", None, "refuse"),
    (("EmpoweredCommittee",), "projects", "lab", None, "totals"),
    (("HRAdmin",), "pms_scores", "other_person", None, "refuse"),
    (("HRAdmin",), "personal_details", "other_person", None, "full"),
    (("HRAdmin",), "proposals", "lab", None, "refuse"),
    (("HRAdmin",), "projects", "lab", None, "full"),
    (("PME",), "pms_scores", "other_person", None, "refuse"),
    (("PME",), "personal_details", "other_person", None, "refuse"),
    (("PME",), "proposals", "other_person", None, "full"),
    (("PME",), "equipment", "lab", None, "full"),
    (("FinanceAdmin",), "pms_scores", "lab", None, "refuse"),
    (("FinanceAdmin",), "personal_details", "lab", None, "refuse"),
    (("FinanceAdmin",), "proposals", "lab", None, "totals"),
    (("FinanceAdmin",), "projects", "lab", None, "full"),
    (("DivisionHead",), "pms_scores", "division", "D1", "refuse"),
    (("HOD",), "personal_details", "division", "D1", "refuse"),
    (("DivisionHead",), "proposals", "division", "D1", "full"),
    (("DivisionHead",), "proposals", "division", "D2", "refuse"),
    (("HOD",), "projects", "division", "D1", "full"),
    (("HOD",), "projects", "division", "D2", "totals"),
    (("HOD",), "projects", "other_person", None, "full"),
    (("DivisionHead",), "proposals", "other_person", None, "full"),
    (("DivisionHead",), "proposals", "division", None, "full"),
    (("DivisionHead",), "proposals", "division", "d1", "full"),
    (("Scientist",), "pms_scores", "other_person", None, "refuse"),
    (("Technician",), "personal_details", "other_person", None, "refuse"),
    (("ProjectStaff",), "proposals", "lab", None, "refuse"),
    (("Student",), "outputs_ip", "lab", None, "totals"),
    (("SystemAdmin",), "pms_scores", "other_person", None, "refuse"),
    (("SystemAdmin",), "projects", "lab", None, "totals"),
]


@pytest.mark.parametrize("roles,topic,subject,div,expected", CELLS)
def test_table_cell(roles, topic, subject, div, expected):
    assert verdict(S(*roles), topic, subject, div) == expected


def test_self_is_always_full():
    assert verdict(S("Scientist"), "pms_scores", "self") == "full"


def test_open_topics_are_full_for_everyone():
    for t in ("staff_directory", "documents", "general"):
        assert verdict(S("Student"), t, "other_person") == "full"


def test_unknown_never_refuses():
    assert verdict(S("Scientist"), "unknown", "other_person") == "full"
    assert verdict(S("Scientist"), "pms_scores", "unknown") == "full"


def test_most_permissive_held_role_wins():
    assert verdict(S("Scientist", "HRAdmin"), "personal_details", "other_person") == "full"


def test_self_hints_never_widen_the_verdict():
    for q in ("What PMS score did Dr. asha rao get?", "What is my PMS score?"):
        assert verdict(S("Scientist"), "pms_scores", "other_person") == "refuse"
        assert looks_like_self(S("Scientist"), q)
    assert verdict(S("Scientist"), "projects", "other_person") == "totals"


def test_looks_like_self():
    for q in ("What PMS score did Dr. asha rao get?", "What is my PMS score?", "what did i score", "Show me mine"):
        assert looks_like_self(S("Scientist"), q)
    # "me" alone is who receives it, not whose record it is.
    for q in ("Show me Dr X's PMS score", "Tell me Rao's date of birth"):
        assert not looks_like_self(S("Scientist"), q)
    # Word boundaries: "mine" in "determine", a longer name, are not self.
    for q in ("Determine Dr X's score", "What PMS score did Dr. Asha Raoji get?"):
        assert not looks_like_self(S("Scientist"), q)


def test_staff_lookup_failure_is_flagged():
    fake = _Client(rpcs={"caller_roles": [{"role": "Scientist", "division_code": None}]})
    fake.rpc = (lambda real: (lambda name, p: _Q(None, True) if name == "caller_staff_id" else real(name, p)))(fake.rpc)
    s = scope_of(fake)
    assert s["roles"] == {"Scientist"} and s["staff_name"] is None and s["name_lookup_failed"] is True
    assert "lookup_failed" not in s


def test_no_table_role_refuses_sensitive():
    assert verdict(S(), "pms_scores", "other_person") == "refuse"


def test_missing_caller_division_never_matches_own():
    assert verdict(S("DivisionHead", division=None), "proposals", "division", None) == "refuse"
    assert verdict(S("DivisionHead", division=None), "proposals", "division", "D1") == "refuse"


class _Exec:
    def __init__(self, data): self.data = data


class _Q:
    def __init__(self, data, boom): self._data, self._boom = data, boom
    def select(self, *_): return self
    def eq(self, *_): return self
    def limit(self, *_): return self
    def execute(self):
        if self._boom:
            raise RuntimeError("db down")
        return _Exec(self._data)


class _Client:
    def __init__(self, tables=None, rpcs=None, boom=False):
        self._t, self._r, self._boom = tables or {}, rpcs or {}, boom
    def table(self, name): return _Q(self._t.get(name, []), self._boom)
    def rpc(self, name, _params): return _Q(self._r.get(name), self._boom)


def test_scope_of_reads_roles_staff_and_division():
    fake = _Client(
        tables={"staff": [{"Name": "Asha Rao"}]},
        rpcs={"caller_staff_id": "S1",
              "caller_roles": [{"role": "Scientist", "division_code": None},
                               {"role": "HOD", "division_code": "D1"}]})
    assert scope_of(fake) == {"roles": {"Scientist", "HOD"}, "staff_id": "S1",
                              "staff_name": "Asha Rao", "division": "D1", "lab": "AMPRI"}


def test_scope_of_survives_db_errors():
    assert scope_of(_Client(boom=True)) == {"roles": set(), "staff_id": None, "staff_name": None,
                                            "division": None, "lab": "AMPRI", "lookup_failed": True}

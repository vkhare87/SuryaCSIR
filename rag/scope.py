"""SURYA scope guard: who may ask what (design: docs/superpowers/specs/
2026-11-15-ask-surya-scope-guard-design.md §6). Pure and FastAPI-free.

RLS stays the lock. This table is the front door: it refuses the three
sensitive topics politely and records the attempt. An unclear classification
never refuses, so only a confident model label can count against a person."""

import re

SCOPE_REFUSAL_TEXT = "This information cannot be retrieved for you."

TOPICS = ("pms_scores", "personal_details", "proposals", "projects", "staff_directory",
          "equipment", "outputs_ip", "documents", "general")
SUBJECTS = ("self", "other_person", "division", "lab")

# ponytail: one lab until WP-17 adds a Headquarters role and a set of labs.
LAB = "AMPRI"

_RANK = {"refuse": 0, "totals": 1, "full": 2}
_SHARED = ("projects", "equipment", "outputs_ip")

# role -> topic -> (own division, elsewhere). A plain word means both.
_ALL_FULL = {"pms_scores": "full", "personal_details": "full", "proposals": "full", "shared": "full"}
_STAFF = {"pms_scores": "refuse", "personal_details": "refuse", "proposals": "refuse", "shared": "totals"}
_TABLE = {
    "Director": _ALL_FULL,
    "MasterAdmin": _ALL_FULL,
    "EmpoweredCommittee": {"pms_scores": "full", "personal_details": "refuse",
                           "proposals": "refuse", "shared": "totals"},
    "HRAdmin": {"pms_scores": "refuse", "personal_details": "full",
                "proposals": "refuse", "shared": "full"},
    "PME": {"pms_scores": "refuse", "personal_details": "refuse",
            "proposals": "full", "shared": "full"},
    "FinanceAdmin": {"pms_scores": "refuse", "personal_details": "refuse",
                     "proposals": "totals", "shared": "full"},
    "DivisionHead": {"pms_scores": "refuse", "personal_details": "refuse",
                     "proposals": ("full", "refuse"), "shared": ("full", "totals")},
    "Scientist": _STAFF,
    "Technician": _STAFF,
    "ProjectStaff": _STAFF,
    "Student": _STAFF,
    "SystemAdmin": _STAFF,
}
_TABLE["HOD"] = _TABLE["DivisionHead"]

_DIVISION_ROLES = ("DivisionHead", "HOD")


def _empty_scope() -> dict:
    return {"roles": set(), "staff_id": None, "staff_name": None, "division": None, "lab": LAB}


def scope_of(client) -> dict:
    """The caller's held roles, staff link and division, read with their own
    RLS-scoped client. A failed read leaves that part empty; an empty role set
    refuses the sensitive topics, which is the safe side."""
    scope = _empty_scope()
    try:
        rows = client.table("user_roles").select("role, division_code").execute().data or []
        scope["roles"] = {r["role"] for r in rows if r.get("role")}
        divs = sorted(rows, key=lambda r: r.get("role") not in _DIVISION_ROLES)
        scope["division"] = next((r["division_code"] for r in divs if r.get("division_code")), None)
    except Exception:
        return _empty_scope()
    try:
        scope["staff_id"] = client.rpc("caller_staff_id", {}).execute().data or None
        if scope["staff_id"]:
            staff = (client.table("staff").select("Name").eq("ID", scope["staff_id"])
                     .limit(1).execute().data) or []
            scope["staff_name"] = (staff[0].get("Name") or None) if staff else None
    except Exception:
        scope["staff_id"] = scope["staff_name"] = None
    return scope


def _cell(role: str, topic: str, own: bool) -> str:
    cell = _TABLE[role]["shared" if topic in _SHARED else topic]
    if isinstance(cell, tuple):
        return cell[0] if own else cell[1]
    return cell


def verdict(scope: dict, topic: str, subject: str, subject_division=None, question: str = "") -> str:
    """'full' | 'totals' | 'refuse' for one classified question."""
    if topic not in ("pms_scores", "personal_details", "proposals") + _SHARED:
        return "full"
    if subject not in SUBJECTS or subject == "self":
        return "full"
    # ponytail: an asker naming themself is not probing. Fail-open by design: a
    # question naming them AND someone else passes here, and RLS still hides the
    # other person's rows — this check only decides refusal copy and strikes.
    name = " ".join((scope.get("staff_name") or "").lower().split())
    if subject == "other_person" and name and re.search(rf"\b{re.escape(name)}\b", " ".join(question.lower().split())):
        return "full"
    div = scope.get("division")
    own = subject == "division" and bool(div) and bool(subject_division) and subject_division == div
    cells = [_cell(r, topic, own) for r in scope.get("roles", ()) if r in _TABLE]
    return max(cells, key=_RANK.__getitem__, default="refuse")

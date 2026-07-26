#!/usr/bin/env python3
"""Fail if a SECURITY DEFINER function has no authorization check.

Why this exists
---------------
SECURITY DEFINER runs as the function owner, so RLS does not apply. That
makes every such function an authorization boundary in its own right.

On 2026-07-25 an audit found `helpdesk_update_status`, `helpdesk_assign_ticket`
and `helpdesk_create_ticket` shipped with no check at all and a client-supplied
actor id — any authenticated user could drive any ticket and forge the audit
trail — while `helpdesk_add_response`, in the same migration file, had exactly
the right check. Nothing caught it: the app's 588 tests cover TypeScript, and
the bug was SQL.

This is a lint, not a proof. It cannot tell a correct check from a wrong one.
It only makes the *absence* of one impossible to introduce silently, which is
the failure mode that actually happened.

Usage:  python3 scripts/check_security_definer.py
Exit:   0 clean, 1 unguarded function found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parent.parent / "supabase" / "migrations"

# Any of these appearing in a function body counts as "consults the caller".
AUTHZ_MARKERS = (
    "auth.uid()",
    "auth.jwt()",
    "auth.role()",
    "user_has_role",
    "caller_is_",
    "caller_has_role",
    "caller_sees_",
    "pms_is_admin",
    "pms_is_evaluation_committee_member",
    "pms_is_grievance_member",
    "pms_caller_track",
    "proposals_caller_",
)

# Functions that legitimately need no caller check. Every entry states why —
# an exemption without a reason is how the original bug would come back.
EXEMPT: dict[str, str] = {
    # Trigger functions: fire on a write the caller was already authorized to
    # make. The gate is the RLS policy on the table, not the trigger.
    "pms_set_updated_at": "trigger; sets updated_at on an already-authorized write",
    "calendar_events_set_updated_at": "trigger; same",
    "set_updated_at": "trigger; same",
    "handle_new_auth_user": (
        "trigger on auth.users INSERT; runs during signup when there is no "
        "caller yet. Grants only 'DefaultUser', the lowest role."
    ),
    # Pure caller-identity resolvers. They *are* the auth primitives — asking
    # them to authorize the caller would be circular. They read only the
    # caller's own row, keyed on auth.uid(), and expose nothing else.
    "caller_email": "resolves the caller's own identity from the JWT",
    "caller_staff_name": "resolves the caller's own staff row; keyed on auth.uid()",
    "user_profiles_validate_active_role": (
        "trigger; rejects an active_role the row's user does not hold. Which "
        "row you may update at all is decided by RLS before this runs."
    ),
    "sync_staff_key": (
        "trigger; resolves an unambiguous display name to staff.\"ID\" on write. "
        "Whether the write happens at all is decided by the table's RLS "
        "(HRAdmin/SystemAdmin/MasterAdmin) before this runs."
    ),
    "pms_check_evaluation_complete": (
        "trigger on pms_evaluations; the entry point is an RLS-gated write "
        "(evaluations_update: evaluator_id = auth.uid())."
    ),
    # Internal helpers — EXECUTE revoked from authenticated/anon in
    # 20260725000003_lock_internal_helpers.sql, so they are unreachable except
    # from inside the SECURITY DEFINER functions that call them.
    "route_ticket": "internal to helpdesk_create_ticket; EXECUTE revoked (20260725000003)",
    "pms_committee_panel_valid": "internal validator; EXECUTE revoked (20260725000003)",
    "pms_empowered_committee_valid": "internal validator; EXECUTE revoked (20260725000003)",
}


FUNC_START = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(",
    re.IGNORECASE,
)


def iter_functions(sql: str):
    """Yield (name, header, body) for each function definition in `sql`.

    Bodies here are always dollar-quoted with `$$`, so the body is the text
    between the first and second `$$` after the declaration.
    """
    for match in FUNC_START.finditer(sql):
        name = match.group(1)
        rest = sql[match.end():]

        first = rest.find("$$")
        if first == -1:
            continue
        second = rest.find("$$", first + 2)
        if second == -1:
            continue

        yield name, rest[:first], rest[first + 2:second]


def main() -> int:
    if not MIGRATIONS.is_dir():
        print(f"error: {MIGRATIONS} not found", file=sys.stderr)
        return 1

    # A function may be redefined by a later migration. Only the final
    # definition is live, so key on name and let later files win.
    latest: dict[str, tuple[str, str]] = {}

    for path in sorted(MIGRATIONS.glob("*.sql")):
        sql = path.read_text(encoding="utf-8", errors="replace")
        for name, header, body in iter_functions(sql):
            if "SECURITY DEFINER" not in header.upper():
                latest.pop(name, None)  # redefined as INVOKER; no longer in scope
                continue
            latest[name] = (path.name, body)

    unguarded = [
        (name, origin)
        for name, (origin, body) in sorted(latest.items())
        if name not in EXEMPT
        and not any(marker in body for marker in AUTHZ_MARKERS)
    ]

    checked = len(latest)
    if unguarded:
        print(f"FAIL: {len(unguarded)} SECURITY DEFINER function(s) with no "
              f"authorization check (of {checked} checked):\n")
        for name, origin in unguarded:
            print(f"  {name}()  —  {origin}")
        print(
            "\nEvery SECURITY DEFINER function bypasses RLS, so it must decide "
            "for itself whether the caller is allowed.\n"
            "Add a check referencing one of: "
            + ", ".join(AUTHZ_MARKERS)
            + "\nIf the function genuinely needs no check (a trigger, or a "
            "caller-identity resolver), add it to EXEMPT in this file with a "
            "reason."
        )
        return 1

    print(f"OK: {checked} SECURITY DEFINER function(s) checked, "
          f"{len(EXEMPT)} exempt, none unguarded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

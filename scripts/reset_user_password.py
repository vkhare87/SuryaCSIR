"""Reset a SURYA user's password using the Supabase service role.

For an administrator who needs to restore access when the normal
"forgot password" email route is unavailable. Requires SUPABASE_SERVICE_KEY
in rag/.env — that key bypasses RLS entirely, so treat this script the way
you would treat root.

    python scripts/reset_user_password.py --list
    python scripts/reset_user_password.py --email someone@ampri.res.in
    python scripts/reset_user_password.py --email someone@ampri.res.in --keep-flag

The new password is read from a hidden prompt, never from an argument: a
password passed on the command line is stored in shell history and visible
in the process list. It is never printed or logged.

By default the account is flagged must_change_password, so the holder is
forced through /change-password at next sign-in and the administrator does
not remain in possession of a working credential. --keep-flag skips that.
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

RAG_ENV = Path(__file__).resolve().parent.parent / "rag" / ".env"
MIN_LENGTH = 12


def load_env():
    if not RAG_ENV.exists():
        raise SystemExit(f"missing {RAG_ENV}")
    for line in RAG_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def client():
    from supabase import create_client
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("rag/.env must define SUPABASE_URL and SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def list_users(c):
    users = c.auth.admin.list_users()
    profiles = {p["user_id"]: p for p in
                c.table("user_profiles").select("user_id,active_role,must_change_password")
                 .execute().data}
    roles = {}
    for r in c.table("user_roles").select("user_id,role").execute().data:
        roles.setdefault(r["user_id"], []).append(r["role"])
    print(f"{'EMAIL':42} {'ACTIVE ROLE':16} {'ALL ROLES':34} MUST CHANGE")
    for u in users:
        p = profiles.get(u.id, {})
        print(f"{(u.email or '—'):42} {(p.get('active_role') or '—'):16} "
              f"{','.join(roles.get(u.id, [])) or '—':34} "
              f"{'yes' if p.get('must_change_password') else 'no'}")
    print(f"\n{len(users)} user(s)")


def find_user(c, email: str):
    for u in c.auth.admin.list_users():
        if (u.email or "").lower() == email.lower():
            return u
    raise SystemExit(f"no auth user with email {email}")


def read_new_password() -> str:
    first = getpass.getpass("New password (hidden): ")
    if len(first) < MIN_LENGTH:
        raise SystemExit(f"password must be at least {MIN_LENGTH} characters")
    if first != getpass.getpass("Confirm: "):
        raise SystemExit("passwords did not match")
    return first


def reset(c, email: str, force_change: bool):
    user = find_user(c, email)
    password = read_new_password()
    c.auth.admin.update_user_by_id(user.id, {"password": password})
    del password
    if force_change:
        c.table("user_profiles").update({"must_change_password": True}) \
            .eq("user_id", user.id).execute()
    print(f"\npassword reset for {user.email}")
    print("must_change_password:", "set — user is sent to /change-password at next sign-in"
          if force_change else "left unchanged (--keep-flag)")
    print("Existing sessions are not revoked; sign the user out separately if that matters.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="list users, roles, and flags")
    ap.add_argument("--email", help="account whose password to reset")
    ap.add_argument("--keep-flag", action="store_true",
                    help="do NOT force a password change at next sign-in")
    args = ap.parse_args()

    load_env()
    c = client()

    if args.list:
        list_users(c)
    elif args.email:
        reset(c, args.email, force_change=not args.keep_flag)
    else:
        ap.error("pass --list or --email")


if __name__ == "__main__":
    sys.exit(main())

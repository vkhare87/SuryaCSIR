"""Grant or revoke a SURYA app role, using the Supabase service role.

Roles live in user_roles (composite key user_id + role); the dashboard a user
lands on is user_profiles.active_role. Granting a role does not switch the
active one, so --activate is usually what you want after a grant.

    python scripts/grant_role.py --email someone@ampri.res.in --role MasterAdmin --activate
    python scripts/grant_role.py --email someone@ampri.res.in --revoke DefaultUser
    python scripts/grant_role.py --email someone@ampri.res.in --show

Requires SUPABASE_SERVICE_KEY in rag/.env, which bypasses RLS — this can hand
out MasterAdmin, so treat it as a privileged administrative tool.
"""
import argparse
import os
import sys
from pathlib import Path

RAG_ENV = Path(__file__).resolve().parent.parent / "rag" / ".env"

ROLES = [
    "Director", "DivisionHead", "HOD", "Scientist", "Technician", "HRAdmin",
    "FinanceAdmin", "SystemAdmin", "MasterAdmin", "Student", "ProjectStaff",
    "Guest", "DefaultUser", "EmpoweredCommittee",
]


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


def find_user(c, email: str):
    for u in c.auth.admin.list_users():
        if (u.email or "").lower() == email.lower():
            return u
    raise SystemExit(f"no auth user with email {email}")


def show(c, uid: str, email: str):
    roles = [r["role"] for r in
             c.table("user_roles").select("role").eq("user_id", uid).execute().data]
    prof = c.table("user_profiles").select("active_role,must_change_password") \
            .eq("user_id", uid).execute().data
    active = prof[0]["active_role"] if prof else None
    print(f"{email}\n  roles       : {', '.join(sorted(roles)) or '—'}")
    print(f"  active role : {active or '—'}")
    if prof:
        print(f"  must change : {'yes' if prof[0]['must_change_password'] else 'no'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--role", choices=ROLES, help="role to grant")
    ap.add_argument("--revoke", choices=ROLES, help="role to remove")
    ap.add_argument("--activate", action="store_true",
                    help="also set this role as the active dashboard role")
    ap.add_argument("--show", action="store_true", help="print current roles only")
    args = ap.parse_args()

    load_env()
    c = client()
    user = find_user(c, args.email)

    if args.show or not (args.role or args.revoke):
        show(c, user.id, user.email)
        return

    if args.role:
        # composite key (user_id, role) — upsert keeps a repeat grant harmless
        c.table("user_roles").upsert({"user_id": user.id, "role": args.role},
                                     on_conflict="user_id,role").execute()
        print(f"granted {args.role}")
        if args.activate:
            c.table("user_profiles").update({"active_role": args.role}) \
                .eq("user_id", user.id).execute()
            print(f"active role set to {args.role}")

    if args.revoke:
        c.table("user_roles").delete().eq("user_id", user.id) \
            .eq("role", args.revoke).execute()
        print(f"revoked {args.revoke}")

    print()
    show(c, user.id, user.email)
    print("\nSign out and back in for the change to take effect.")


if __name__ == "__main__":
    sys.exit(main())

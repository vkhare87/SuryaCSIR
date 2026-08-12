# Database tests

## `rls_negative.sql`

Negative-path assertions: things a low-privilege account **must not** be able
to do. Every test in the file describes an attack that **worked** before
`20260725000001_security_hardening.sql` / `20260725000002_helpdesk_identity_authz.sql`.

They exist because the 2026-07-25 audit found a full privilege-escalation
path (`user_roles_update_own_last_seen`) that the 588-test vitest suite could
never have caught — the suite covers pure TypeScript functions, and the bug
was three lines of SQL. Policies need their own tests.

### Running

Requires a scratch database with all migrations applied. Not run in CI yet
(see `docs/history/ARCHITECTURE-REMEDIATION.md`, A7).

```bash
supabase db reset
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_negative.sql
```

Passing output ends with `ALL RLS NEGATIVE TESTS PASSED`. Any failure raises
an exception naming the test (`T5 FAILED: non-participant read 1 foreign ticket(s)`).

The whole script runs inside a transaction and ends in `ROLLBACK`, so it
leaves nothing behind. It does create `auth.users` rows before rolling them
back — **run it against a scratch or staging database, never production.**

### Coverage

| Test | Finding | Asserts a low-privilege user cannot… |
|------|---------|--------------------------------------|
| T1 | CRIT-1 | rewrite their own `user_roles.role` to `MasterAdmin` |
| T2 | CRIT-1 | self-assign a `division_code` |
| T3 | B5 | clear their own `must_change_password` |
| T4 | B5 | claim an `active_role` they do not hold |
| T5 | HIGH-3 | read another user's helpdesk grievance |
| T6 | HIGH-2 | drive the status of a ticket they are unrelated to |
| T7 | HIGH-2 | write a `ticket_events` row under a forged `actor_id` |
| T8 | HIGH-2 | file a ticket under another user's identity |
| T9 | HIGH-4 | self-publish an `institute`-tier document into the RAG corpus |
| T10 | MED-7 | enumerate every account via `user_directory()` |
| T11 | MED-10 | read `import_events` uploader identities |
| T12 | HIGH-3 | read the admin `audit_log` |

### Adding a test

One `DO $$ … $$` block per assertion. Use `CALL pg_temp.become(<uuid>, <email>)`
to act as a user, `pg_temp.blocked(<sql>)` to run a statement that is expected
to be refused, then `RESET ROLE` and verify the *state* — not just that the
statement errored. Several of the original bugs failed silently by updating
zero rows rather than raising, so asserting on the exception alone would have
passed against the vulnerable schema.

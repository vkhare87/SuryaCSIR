# Supabase / SQL Layout

```
supabase/
├── migrations/         schema — 8-file domain baseline. Append new
│                        timestamped files. Never edit shipped ones.
├── migrations_archive/ pre-2026-07-12 migration history. Reference only,
│                        not applied anywhere. See its own README.
├── seed/                bootstrap data the app needs to function (run on every env).
├── mock/                 CSIR-AMPRI demo fixture for dev only. NEVER run in prod.
├── ops/                  operational scripts (wipe, etc.) + this README.
└── bundles/              auto-generated rollups. Gitignored.
```

## Migration baseline (apply in order)

| File | Stage | Contains |
|---|---|---|
| `20260712000001_extensions_helpers.sql` | 01 | Postgres extensions, generic `updated_at` trigger functions |
| `20260712000002_auth_rbac.sql` | 02 | `user_roles`, `user_profiles`, auth auto-registration, `pms_audit_logs`, `access_requests` + approve/reject RPCs, `admin_set_user_roles` |
| `20260712000003_hr_core.sql` | 03 | divisions, staff, projects, phd_students (+milestones), equipment, labs, project_staff, contract_staff, scientific_outputs, ip_intelligence, vacancy tables, IRINS sync, MOUs, tech transfers |
| `20260712000004_pms.sql` | 04 | Full PMS 2026-guidelines schema: reports, evaluation/empowered/grievance committees, AWP, representations, RPCs, storage buckets |
| `20260712000005_committees_helpdesk.sql` | 05 | committees, meetings (+ 7-day minutes lock), agenda/action items, tickets + routing, shared `audit_log` |
| `20260712000006_proposals_reports.sql` | 06 | Role/division helper functions, proposals workflow, project progress reports |
| `20260712000007_calendar_recruitment.sql` | 07 | calendar_events, holidays |
| `20260712000008_rag_documents.sql` | 08 | Unified documents registry, RAG ingestion index, query log, Ask SURYA support tables |

Each file states its stage number and dependencies in a header comment.
Ordering rule: a file depends only on files with a *lower* stage number.

## Fresh project bootstrap (prod or dev)

```sh
# 1. Apply schema
supabase db push                        # applies migrations/ in order via CLI
                                         # (or: supabase db reset for a full local rebuild,
                                         #  or paste migrations/*.sql into SQL Editor in order)

# 2. Seed bootstrap data (idempotent)
psql ... -f supabase/seed/01_helpdesk_routing.sql
psql ... -f supabase/seed/02_appraisal_cycle.sql

# 3. Create first admin via Dashboard → Authentication → Users
#    The on_auth_user_created trigger will populate user_roles
#    (DefaultUser) and user_profiles. Then promote to MasterAdmin:
#      INSERT INTO user_roles (user_id, role)
#      VALUES ('<uuid>', 'MasterAdmin') ON CONFLICT DO NOTHING;
#      UPDATE user_profiles SET active_role = 'MasterAdmin' WHERE user_id = '<uuid>';
```

## Adopting the Supabase CLI on an existing (already-live) project

This repo's live project already has the baseline's schema applied by hand
(direct SQL, not the CLI). To start tracking future changes with
`supabase db push` without re-running DDL that already exists:

```sh
supabase link --project-ref <your-project-ref>
supabase migration repair --status applied \
  20260712000001 20260712000002 20260712000003 20260712000004 \
  20260712000005 20260712000006 20260712000007 20260712000008
```

`migration repair` marks these as applied in the CLI's tracking table
without executing them. From this point on, every schema change is a new
timestamped file applied via `supabase db push` — **no more pasting SQL
into the Dashboard SQL Editor**. That drift (repo migrations silently never
applied to the live project) is exactly what caused a multi-week outage of
RAG/MOU/tech-transfer/progress-report features — see
`docs/superpowers/specs/2026-07-11-db-file-restructure-design.md`.

## Auth settings live in `config.toml`, not the Dashboard

`supabase/config.toml` is the source of truth for GoTrue configuration —
password rules, session lifetimes, signup policy, and
`secure_password_change`. Before 2026-07-25 these were dashboard clicks:
unversioned, unreviewable, and free to differ between the local stack and
the live project.

```sh
supabase link --project-ref <your-project-ref>   # once
supabase config push                              # after every config.toml change
```

**`supabase db push` does not apply `[auth]`.** Schema and auth config are
separate pushes; changing one without the other is how the two environments
drift apart again.

Two settings are load-bearing for security, not preference:

| Setting | Why |
|---|---|
| `[auth.email] secure_password_change` | `supabase.auth.updateUser({password})` is callable with nothing but a stolen access token, bypassing the re-authentication in `ChangePassword.tsx`. This makes GoTrue itself demand a recent sign-in. It is the only version of the control an attacker cannot route around. |
| `[auth] minimum_password_length` / `password_requirements` | The client mirror lives in `src/lib/auth/passwordPolicy.ts` so the UI can name the failing rule. **Change both together** or users are told a password is fine and then watch it be refused. |

Leaked-password protection (HaveIBeenPwned) has no `config.toml` key — it is
Dashboard → Authentication → Policies, and a paid-plan feature. Enable it
there if the plan allows.

## Verify what is actually applied before trusting the repo

The repo has drifted from the live project before — see the CLI-adoption
section above. Migration files existing in `supabase/migrations/` is not
evidence they ran.

```sh
supabase migration list          # local vs remote, side by side
```

Anything showing as local-only is unapplied. This matters most for
`20260718000001_rls_scope_reads.sql` (scopes personnel reads — without it
every authenticated user reads the full staff table) and the 2026-07-25
security migrations. Run this **first** when picking up unfamiliar state.

## Local dev — load demo data

```sh
# After bootstrap above, run mock files in numeric order:
for f in supabase/mock/*.sql; do psql ... -f "$f"; done
```

Order matters because of FKs: `divisions` → `staff` → `projects` → … See file numbering.
`13_dev_all_roles.sql` / `14_dev_scientist_staff.sql` / `16_test_roles.sql` grant
every role to a single dev account for role-switcher testing — edit the email
inside before running. `15_proposals.sql` seeds demo proposal rows.

## Demo data that reached production

`mock/` is dev-only, but `mock/10_helpdesk_tickets.sql` was loaded into the
live project at some point — 20 fake tickets, including HRGrievance ones,
visible in a real helpdesk and attributed to staff IDs with no login.

`ops/remove_mock_helpdesk.sql` removes exactly those 20 (and their responses,
events and audit_log rows), double-gated on the known tokens **and** on the
actor not being uuid-shaped, so it cannot touch a genuine ticket. It verifies
the result before committing and rolls back if anything unexpected remains.

This surfaced because `20260725000004` refuses to convert actor columns to
`uuid` while non-uuid values remain. Worth checking whether other `mock/`
files also reached prod — the helpdesk fixture is unlikely to have been the
only one.

## Wipe + reseed cycle (dev only)

```sh
psql ... -f supabase/ops/wipe_data.sql
# then re-run seed/ + mock/ as above
```

`wipe_data.sql` truncates every app table but preserves schema. Clear `auth.users` separately via Supabase Dashboard (TRUNCATE not permitted on `auth` schema).

## When to write a new migration vs touch seed/mock

- Schema change (new table, new column, RLS policy, RPC): **new migration**. Never edit a shipped baseline file — append a new timestamped one.
- Reference data the app reads at runtime (`helpdesk_routing` categories, an OPEN `appraisal_cycle`): **`seed/`**.
- Sample CSIR-AMPRI demo rows for screenshots / UAT: **`mock/`**.

## bundles/

Roll-ups (`full_schema.sql`, `pending_migrations.sql`, `admin_bootstrap.sql`, `wipe_seed_data.sql`) are derived from the source files above. Treat as build artifacts — do not edit directly. The directory is `.gitignore`d.

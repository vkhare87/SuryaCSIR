# Supabase / SQL Layout

```
supabase/
├── migrations/   schema-only. Append new timestamped files. Never edit shipped ones.
├── seed/         bootstrap data the app needs to function (run on every env).
├── mock/         CSIR-AMPRI demo fixture for dev only. NEVER run in prod.
├── ops/          operational scripts (wipe, etc.) + this README.
└── bundles/      auto-generated rollups. Gitignored.
```

## Fresh project bootstrap (prod or dev)

```sh
# 1. Apply schema
supabase db reset                       # or paste migrations/*.sql in SQL Editor

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

## Local dev — load demo data

```sh
# After bootstrap above, run mock files in numeric order:
for f in supabase/mock/*.sql; do psql ... -f "$f"; done
```

Order matters because of FKs: `divisions` → `staff` → `projects` → … See file numbering.

## Wipe + reseed cycle (dev only)

```sh
psql ... -f supabase/ops/wipe_data.sql
# then re-run seed/ + mock/ as above
```

`wipe_data.sql` truncates every app table but preserves schema. Clear `auth.users` separately via Supabase Dashboard (TRUNCATE not permitted on `auth` schema).

## Migration order

Migrations apply in filename order. Current chain:

| Timestamp           | Purpose                                                    |
|---------------------|------------------------------------------------------------|
| 00000000000000      | Consolidated init — all base tables, RPCs, RLS             |
| 20260501000000      | Vacancy tables (reshaped later)                            |
| 20260502000000      | Labs + 9 equipment columns                                 |
| 20260504000000      | IRINS profiles + sync log                                  |
| 20260507000000      | Committees + helpdesk + audit_log                          |
| 20260510000000_committee_minutes_lock | Minutes lock RLS + admin unlock RPC      |
| 20260510000000_helpdesk_phase3_rpcs   | helpdesk_assign_ticket + add_response    |
| 20260516000000      | Audit_log triggers (committees + helpdesk)                 |
| 20260516000001      | Admin write policies for projects/phd_students/project_staff |
| 20260516000002      | Drop user_roles_select_admin (RLS recursion fix)           |
| 20260517000000      | route_ticket bug + storage policy idempotency + vacancy_* live-sync + set_updated_at alias |

## When to write a new migration vs touch seed/mock

- Schema change (new table, new column, RLS policy, RPC): **new migration**. Never edit `00000000000000_init.sql`.
- Reference data the app reads at runtime (`helpdesk_routing` categories, an OPEN `appraisal_cycle`): **`seed/`**.
- Sample CSIR-AMPRI demo rows for screenshots / UAT: **`mock/`**.

## bundles/

Roll-ups (`full_schema.sql`, `pending_migrations.sql`, `admin_bootstrap.sql`, `wipe_seed_data.sql`) are derived from the source files above. Treat as build artifacts — do not edit directly. The directory is `.gitignore`d.

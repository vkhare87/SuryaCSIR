# Migrations Archive

These 31 files are the pre-2026-07-12 migration history. They are **not applied
to any environment anymore** — the live project (and all fresh installs) run
on the 8-file baseline in `supabase/migrations/`. Kept here for reference
only: how a table got to its current shape, why a fix migration existed, git
blame continuity.

Do not apply these files. Do not add new files here — new schema changes go
in `supabase/migrations/` as a new timestamped file.

See `docs/superpowers/specs/2026-07-11-db-file-restructure-design.md` for
why this restructure happened.

## Absorption manifest — old file → new baseline file

| Archived file | Absorbed into |
|---|---|
| `00000000000000_init.sql` | split across `20260712000001` (extensions/helpers), `20260712000002` (auth_rbac), `20260712000003` (hr_core), `20260712000004` (pms) |
| `20260501000000_vacancy_tables.sql` | `20260712000003_hr_core.sql` (superseded by live-shape reshape below) |
| `20260502000000_instruments_extension.sql` | `20260712000003_hr_core.sql` |
| `20260504000000_irins_sync.sql` | `20260712000003_hr_core.sql` |
| `20260507000000_committees_helpdesk.sql` | `20260712000005_committees_helpdesk.sql` (route_ticket superseded by the fixed version below) |
| `20260510000000_committee_minutes_lock.sql` | `20260712000005_committees_helpdesk.sql` |
| `20260510000000_helpdesk_phase3_rpcs.sql` | `20260712000005_committees_helpdesk.sql` |
| `20260516000000_audit_log_triggers.sql` | `20260712000005_committees_helpdesk.sql` |
| `20260516000001_admin_write_policies.sql` | `20260712000003_hr_core.sql` |
| `20260516000002_fix_user_roles_recursion.sql` | `20260712000002_auth_rbac.sql` (fix applied directly — the recursive policy was never created in the baseline, not created-then-dropped) |
| `20260516120000_proposals.sql` | `20260712000006_proposals_reports.sql` |
| `20260517000000_fixes_and_vacancy_sync.sql` | route_ticket fix → `20260712000005_committees_helpdesk.sql`; committee-docs policy idempotency → same file (moot in a fresh baseline); vacancy_advertisements/vacancy_posts live-shape reshape → `20260712000003_hr_core.sql` (columns defined directly in final shape, not reshaped after the fact) |
| `20260519000000_calendar_events_holidays.sql` | `20260712000007_calendar_recruitment.sql`; meetings.teams_url/pamphlet_url → `20260712000005_committees_helpdesk.sql`; audit_log entity_type widening → `20260712000005_committees_helpdesk.sql` (defined with the full CHECK list directly) |
| `20260521120000_dev_all_roles.sql` | copied to `supabase/mock/13_dev_all_roles.sql` (dev fixture, not schema) |
| `20260521130000_dev_scientist_staff.sql` | copied to `supabase/mock/14_dev_scientist_staff.sql` (dev fixture, not schema) |
| `20260525120000_access_requests.sql` | `20260712000002_auth_rbac.sql` |
| `20260525130000_manage_user_roles.sql` | `20260712000002_auth_rbac.sql` |
| `20260702000000_documents_registry.sql` | `20260712000008_rag_documents.sql` |
| `20260702010000_project_reports.sql` | `20260712000006_proposals_reports.sql` |
| `20260702020000_doc_indexes.sql` | `20260712000008_rag_documents.sql` |
| `20260702030000_rag_scale_quality.sql` | `20260712000008_rag_documents.sql` |
| `20260707000000_query_log_latency.sql` | `20260712000008_rag_documents.sql` (latency_ms defined directly on query_log) |
| `20260707010000_doc_pages.sql` | `20260712000008_rag_documents.sql` |
| `20260707010000_mous.sql` | `20260712000003_hr_core.sql` |
| `20260707020000_ingest_attempts.sql` | `20260712000008_rag_documents.sql` (ingest_attempts defined directly on documents; requeue RPCs already reset it) |
| `20260707020000_tech_transfers.sql` | `20260712000003_hr_core.sql` |
| `20260707030000_phd_milestones.sql` | `20260712000003_hr_core.sql` |
| `20260707030000_route_labels.sql` | `20260712000008_rag_documents.sql` |
| `20260707040000_recruitment_drive_fields.sql` | `20260712000003_hr_core.sql` (staff_category/drive_stage defined directly on vacancy_advertisements) |
| `20260711000000_pms_2026_guidelines.sql` | `20260712000004_pms.sql` (final 2026-guidelines shape defined directly — no ALTER/RENAME replay from the legacy 2012 scheme) |
| `20260711010000_pms_storage_buckets.sql` | `20260712000004_pms.sql` |

## What's genuinely gone

The 2012 PMS scheme — `pms_collegiums`/`pms_collegium_members` naming,
`pms_chairman_reviews` table, 0.5–1.1 decimal scoring, `CHAIRMAN_REVIEW`
status — only exists in this archive (inside `00000000000000_init.sql` and
superseded by `20260711000000_pms_2026_guidelines.sql`). It is not
represented in the new baseline at all.

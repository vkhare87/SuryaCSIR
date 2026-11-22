# Migrations Archive — 2026-11-21 Checkpoint Consolidation

These **93 files** (`20260712000001_extensions_helpers.sql` through
`20261114000004_batch_c_cleanup_and_rpcs.sql`) are the historical migrations from
the 2026-07-12 baseline through the 2026-11-14 Batch C cleanup. They are **not
applied to fresh environments anymore** — all fresh installs run on the consolidated
8-file domain baseline in `supabase/migrations/` (`20261121000001`…`20261121000008`).

Kept here for reference, historical diffs, and `scripts/db/policyDrift.db.test.ts`
(which replays `20261112000009_live_policy_drift.sql` against recreated drift).
Do not apply these files manually, and do not add new migrations here — future
schema changes go in `supabase/migrations/` as new timestamped files after stage 08.

## Added 2026-11-22: files live ran after the checkpoint (9)

The live project also ran these, which the consolidation missed (they came
from PRs #32, #33 and #34). Kept so `scripts/db/liveSwitch.db.test.ts` can
rebuild a live-shaped database and test the switch to the baseline.

- `20261114120001_project_staff_self_read.sql` … `20261114120007_home_review_fixes.sql` — PR #32 home features. Stage 3/4 replace them; the first block of `20261121000009_stage0_hardening.sql` drops them on live
- `20261115000001_ask_scope_guard.sql` — PR #33; now `20261122000002`
- `20261116000001_coderabbit_security_and_db_fixes.sql` — PR #34; now `20261122000003`
- `20261114120004_home_overdue_sweep.sql` — now `20261122000004`

## Consolidated Baseline (`supabase/migrations/`)

All 93 files were consolidated with PGlite catalog-diff verification (`0` diffs across
121 tables, 8 views, 310 functions, 77 triggers, 301 policies, 7 storage buckets,
6 sequences, 7 pg_cron schedules, and all 5 structural seed tables) into:

| Stage | File | Domain Scope |
|---|---|---|
| 01 | `20261121000001_extensions_helpers.sql` | Extensions (`uuid-ossp`, `pgcrypto`, `pg_cron`), default ACLs, shared helpers, `csir_rules` (+ 17 rules) |
| 02 | `20261121000002_auth_rbac.sql` | `user_roles`, `user_profiles`, `acting_assignments`, `access_requests`, `feature_controls`, `feature_grants`, `notifications`, `audit_log` |
| 03 | `20261121000003_hr_workforce.sql` | `divisions`, `staff`, `sanctioned_posts`, career/profile changes, `expertise_terms`, `staff_expertise`, `contract_staff`, `project_staff*`, `project_engagements`, `phd_*`, `labs`, `equipment*`, `scientific_outputs`, `output_authors`, `ip_*`, `irins_*`, `mous`, `tech_transfers`, `publication_files*` |
| 04 | `20261121000004_pms_awp.sql` | `appraisal_cycles`, `pms_*`, `pms_pen_picture_items` (15 rows), `pms_awps*`, storage buckets (`signatures`, `annexures`, `awp-pdfs`) |
| 05 | `20261121000005_committees_helpdesk.sql` | `committees`, `committee_members`, `meetings`, `agenda_items`, `action_items`, `meeting_documents`, `coi_declarations`, `tickets*`, `helpdesk_routing`, `committee-docs` bucket |
| 06 | `20261121000006_projects_proposals_lifecycle.sql` | `project_schemes` (4 rows), `projects`, all PL0–PL7 Project File tables, `project_stage_items` (9 rows), `proposals*`, `project_reports*`, `proposal-documents` & `project-documents` buckets |
| 07 | `20261121000007_calendar_recruitment_ops.sql` | `calendar_events`, `holidays`, `vacancy_*`, `recruitment_events`, `contribution_requests*`, `data_stewards`, `import_*`, `harvested_imports`, `ingest_sender_map`, `metrics`, `metric_snapshots`, `ai_action_log` |
| 08 | `20261121000008_rag_documents_views_rpcs_policies.sql` | `documents`, `doc_pages`, `doc_indexes`, `collection_indexes`, `query_log`, `route_labels`, `scheduled_queries`, `documents` bucket + guarded `pg_trgm` index, all cross-table FKs, all RPCs/functions, 12 `metrics` rows, 8 views, 77 triggers, RLS + 301 policies, exact table/column/view/sequence/function grants, 7 `pg_cron` schedules |

## Archived Files (93)

- `20260712000001_extensions_helpers.sql` … `20260712000009_drop_orphaned_objects.sql` — 2026-07-12 baseline + orphan cleanup
- `20260714000001_user_preferences.sql` … `20260719000003_import_field_mappings.sql` — preferences, RAG query trace, read scoping, feature controls, user directory, RPC locks, import & ingest capture
- `20260725000001_security_hardening.sql` … `20260726000006_default_acl_drop_anon.sql` — security remediation, senior PMS track, baseline grants, default ACL anon lock
- `20261020000001_notifications.sql` … `20261021000002_pms_awp.sql` — notifications, scheduled queries, feature grants, PMS P0 fixes, Part V AWP
- `20261101000001_contribution_requests.sql` … `20261102000009_append_only_audit.sql` — operating model contribution requests + security phase 2 hardening
- `20261110000001_pme_role.sql` … `20261112000003_project_legacy_rollout.sql` — PME role & Project Lifecycle PL0–PL6
- `20261112000004_csir_rules.sql` … `20261113000012_rule_driven_minutes.sql` — Enterprise AI-Native Phases P1–P9 (CSIR rules, identity links, typed dates, entity timeline, profile, COI, packs, CPD, stage gates, usage logs, PMS 2026, posts, workload, engagements, recruitment/acting, expertise, metrics, AI actions, project breadth, bridges, rule-driven minutes)
- `20261114000001_critical_bug_fixes.sql` … `20261114000004_batch_c_cleanup_and_rpcs.sql` — critical bug fixes & Batch A/B/C performance/RLS/RPC cleanups

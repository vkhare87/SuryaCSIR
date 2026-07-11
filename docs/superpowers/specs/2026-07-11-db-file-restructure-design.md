# Database File Restructure — Clean Domain Baseline

**Date:** 2026-07-11
**Status:** Approved

## Problem

`supabase/migrations/` has grown to 31 files: an 814-line `init.sql` monolith (auth + HR + PMS + RLS + RPCs in one file), followed by incremental migrations including drift-fix migrations that correct earlier ones, and four pairs of **duplicate timestamps** (`20260510000000` ×2, `20260707010000` ×2, `20260707020000` ×2, `20260707030000` ×2) that break deterministic ordering. Two unlabelled seed files sit loose at `supabase/` root. The live dev project was maintained by piecemeal SQL-editor pastes and drifted from the repo for weeks (fixed 2026-07-11 — live now exactly matches repo).

## Decision

Squash all 31 migrations into a **clean baseline of 8 domain-staged files**, archive the old set, adopt **Supabase CLI** (`supabase db push`) as the only apply path, and verify the baseline against the live DB catalog (approach C: hand-written consolidation + automated live-inventory diff).

## Target layout

```
supabase/
├── migrations/                                  new baseline (CLI-compatible timestamps)
│   ├── 20260712000001_extensions_helpers.sql    set_updated_at, user_has_role, shared helpers
│   ├── 20260712000002_auth_rbac.sql             user_roles, user_profiles, auth triggers,
│   │                                            access_requests + approve/reject RPCs,
│   │                                            admin_set_user_roles, recursion-safe policies
│   ├── 20260712000003_hr_core.sql               divisions, staff, projects, phd_students,
│   │                                            phd_milestones, equipment, labs, project_staff,
│   │                                            contract_staff, scientific_outputs, ip_intelligence,
│   │                                            vacancy_advertisements/posts (live shape incl.
│   │                                            recruitment drive fields), irins_profiles,
│   │                                            irins_sync_log, mous, tech_transfers
│   ├── 20260712000004_pms.sql                   2026-guidelines final shape: appraisal_cycles,
│   │                                            pms_reports, sections, annexures, evaluation
│   │                                            committees + members, empowered committee members,
│   │                                            grievance members, evaluations, committee decisions,
│   │                                            AWP activities, representations, audit logs,
│   │                                            notifications, all pms_* RPCs + deadline helpers +
│   │                                            cycle-lock trigger, signatures/annexures buckets
│   │                                            + storage policies
│   ├── 20260712000005_committees_helpdesk.sql   committees, committee_members, meetings,
│   │                                            agenda_items, action_items, meeting_documents,
│   │                                            minutes lock RPC, tickets, ticket_responses,
│   │                                            ticket_events, helpdesk_routing, route_ticket
│   │                                            (fixed version), helpdesk RPCs, audit_log +
│   │                                            audit_row_change triggers, committee-docs bucket
│   ├── 20260712000006_proposals_reports.sql     proposals, proposal_copis, proposal_documents,
│   │                                            proposal_status_history + helper fns,
│   │                                            project_reports, project_report_history + RPCs,
│   │                                            proposal-documents bucket
│   ├── 20260712000007_calendar_recruitment.sql  calendar_events, holidays
│   └── 20260712000008_rag_documents.sql         documents registry, doc_indexes, doc_pages,
│                                                query_log (+latency), collection_indexes,
│                                                ingest_attempts, route_labels, rag RPCs,
│                                                documents bucket
├── migrations_archive/                          the 31 old files + README (reference only)
├── seed/                                        unchanged: 01_helpdesk_routing, 02_appraisal_cycle
├── mock/                                        + 13_proposals.sql   (was supabase/seed_proposals.sql)
│                                                + 14_test_roles.sql  (was supabase/seed_test_roles.sql)
└── ops/                                         wipe_data.sql + rewritten README
```

### File conventions

Every baseline file opens with a header block:

```sql
-- ============================================================
-- Stage 04 / 08 — PMS (Performance Management System)
-- Contains : tables, RLS, RPCs, storage for scientist appraisal
-- Depends  : 01 helpers, 02 auth_rbac, 03 hr_core (staff, divisions)
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================
```

Ordering rule: **files depend only backwards** (01→08). No forward references.

## Existing live DB

Live schema already matches the squashed content — the baseline must not re-execute there. CLI adoption path (documented in ops/README):

1. `supabase link --project-ref zorujjeeigrkiitkdely`
2. `supabase migration repair --status applied 20260712000001 … 20260712000008` (marks applied without executing)
3. All future changes: new timestamped file + `supabase db push`. SQL-editor pastes are banned.

Fresh environments: `supabase db push` (or `db reset` locally) applies 01→08, then seed/, then optionally mock/.

## Verification

1. **Inventory diff (required):** one catalog SQL query captures the live inventory — tables + columns + types, function names + identity arguments, RLS policies per table, triggers, storage buckets. The same inventory is extracted from the baseline files by static parsing (CREATE TABLE bodies for columns, CREATE FUNCTION/POLICY/TRIGGER/bucket-insert statements for the rest) — no local Postgres needed, which matters on this WDAC-restricted host. Every discrepancy in either direction is a finding; done = zero diff.
2. **Old-vs-new content audit:** each of the 31 archived files is checked off against the baseline file that absorbed it (absorption manifest in migrations_archive/README).
3. **App checks stay green:** `npx tsc --noEmit`, `npx vitest run`, `npm run build` (no app code changes expected).

## Documentation updates

- `supabase/ops/README.md`: stage table, fresh-install runbook, CLI adoption steps, mock/dev loading, the no-SQL-editor rule.
- `CLAUDE.md`: folder map + Database section — "one source of truth: init.sql" becomes the 8-file baseline; "never edit init.sql" becomes "never edit shipped baseline files; append new timestamped migrations"; `/new-migration` command context unchanged.
- `.claude/skills/pms-data-model.md`: pointer to `20260712000004_pms.sql`.
- `migrations_archive/README.md`: why archived, absorption manifest (old file → new home).

## Out of scope

- No schema changes — pure reorganization; live DB untouched except CLI baseline-marking.
- No changes to seed/mock content beyond relocating the two loose files.
- HR column-casing tech debt stays as is.

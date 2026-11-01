# Operating Model Overhaul — Programme Index

> **For agentic workers:** this file is the map, not a task list. Each phase that ships code gets its own plan file. Only Phase 1 has one today: [2026-11-01-om-phase1-contribution-requests.md](2026-11-01-om-phase1-contribution-requests.md). Write the next phase's plan only after the gate in its row is met.

**Spec:** [docs/roadmap/SURYA-OPERATING-MODEL-OVERHAUL-PLAN.md](../../roadmap/SURYA-OPERATING-MODEL-OVERHAUL-PLAN.md)

**Why split:** the spec covers six subsystems. Phases 2–6 depend on facts that only Phase 0 interviews can give (case stages, stewards, pilot domain, sources). Writing their tasks now would mean guessing table columns and state names, then rewriting them.

## What already exists (reuse, do not rebuild)

| Spec idea | Already in code | Gap the overhaul fills |
|---|---|---|
| Contribution inbox (B) | `src/lib/dashboard/myActions.ts` + `src/components/MyActions.tsx` (derived, read-only) · `notifications` table + daily `notifications_sweep()` (`20261020000001`) · bell `src/components/layout/NotificationBell.tsx` | No owned *request* record. No delegate, not-mine, clarify, confirm. No provenance. |
| Stewardship map (C) | `src/lib/divisions/uploadFreshness.ts` (`CADENCE_DAYS`) · `src/components/DataFreshnessLedger.tsx` · `import_events` | No named owner per domain. Missing owner looks the same as missing data. |
| "Update what changed" (A) | `src/components/EntityEditModal.tsx` with `FIELD_META` / `TABLE_NAMES` / `PK_FIELD` | No prefill-from-request, no before/after review. |
| Import concierge (D) | `src/components/ImportFlow.tsx` · `import_field_mappings` (remembered mappings) · `harvested_imports` | No import receipt, no partial retry, no row-level fix text. |
| Business case (§3.2, E) | `proposals` state machine + RPCs (`20260712000006`) · `proposal_link_project` · `mous`, `tech_transfers`, `ip_intelligence` · `src/lib/intelligence/lifecycle.ts` | No record that ties proposal → project → outcome with decisions and an evidence checklist. |
| Role / personal workspace (§3.1, Phase 3) | `ACCESS_MAP` + `feature_grants` + `AccessRequests` page · role dashboards in `src/pages/dashboards/` · `user_profiles.preferences` + `merge_user_preferences()` | No personal card layout, no saved views, no "why can I see this". |
| Metric provenance (Phase 4) | `src/lib/digest/*`, `DataHealthDigest` | No metric catalog with source and as-of date. |

## Phase map

| Phase | Ships code? | Plan file | Gate before writing / starting it | Master roadmap items it absorbs |
|---|---|---|---|---|
| 0 Discovery | No | — (use spec §5 Phase 0 deliverables as the checklist) | Sponsor named | — |
| 1 Contribution requests + stewards | Yes | `2026-11-01-om-phase1-contribution-requests.md` | None. Domain list = existing `FileType` keys, so it does not wait on Phase 0. Pilot rollout waits on Phase 0 stewards. | WP-5 C (Unified Inbox), WP-2 A1 follow-on |
| 2 Business cases | Yes | `om-phase2-business-cases.md` (to write) | Phase 0 has validated stage names and gates; Phase 1 merged (cases raise contribution requests) | WP-11, WP-18 (partial) |
| 3 Workspaces | Yes | `om-phase3-workspaces.md` (to write) | Phase 0 role/task matrix; can run in parallel with Phase 2 | WP-5 E, R, F7 |
| 4 Portfolio BI | Yes | `om-phase4-portfolio-bi.md` (to write) | One full cycle of Phase 1–2 data, so completeness is measurable | WP-15 (thin slice) |
| 5 Assisted ingestion | Yes | `om-phase5-ingestion.md` (to write) | Phase 0 source inventory names one reliable source and its owner | — |
| 6 Adoption + scale | Mostly no | — | Pilot ran one cycle | — |

## Locked design decisions (later plans must keep these)

1. **One request table for all domains.** `contribution_requests` keys records by `domain` + `record_ref` (the canonical id, e.g. `ProjectID`). Phase 2 adds domains by widening its `CHECK`, not by new tables.
2. **Requests never write to canonical tables on the server.** The reviewer applies an accepted change through the same client write path the edit modal uses, under RLS. RLS stays the only write gate.
3. **Status moves only through `SECURITY DEFINER` RPCs**, each with an authorization block (see `supabase/CLAUDE.md`).
4. **Business case = link record, not copy.** Phase 2 adds `business_cases` with foreign keys / refs to `proposals.id`, `projects."ProjectID"`, `mous.id`, `tech_transfers.id`. When a proposal is linked, the case's decision stage is *read* from `proposals.status`, never stored twice.
5. **Personal workspace lives in `user_profiles.preferences`** (`{"workspace": {...}}`) via `merge_user_preferences()`. It only orders and filters what queries already return. No new permission store.
6. **Nav target (spec §7)** is reached by renaming / regrouping `NAV_SECTIONS` in `src/components/layout/Sidebar.tsx`. Phase 1 adds only "My Work" to the Overview group. The full regroup is a Phase 3 task.

## Phase 2–5 sketches (for the future plan writer)

- **Phase 2:** tables `business_cases(id, title, case_type, stage, owner_id, division_code, proposal_id, project_no, outcome, outcome_reason)`, `business_case_links(case_id, kind, ref)`, `business_case_decisions(case_id, decision, rationale, decided_by, decided_at)`, `business_case_evidence(case_id, item, state CHECK (required|recommended|not_applicable|unknown|provided), request_id → contribution_requests)`. RPCs `business_case_create`, `business_case_advance`, `business_case_close`. Pages `src/pages/BusinessCases.tsx` (portfolio) + `src/pages/BusinessCaseDetail.tsx`. Missing evidence → `contribution_request_create(...)` from Phase 1.
- **Phase 3:** `src/lib/workspace/preferences.ts` (card order, saved filters) on `merge_user_preferences`; home card registry per role built from existing dashboard sections; "why can I see this" text derived from `ACCESS_MAP` + `feature_grants`; nav regroup per spec §7.
- **Phase 4:** `src/lib/metrics/catalog.ts` — one entry per metric: `{ id, label, definition, source, scope, asOf(data) }`; every dashboard number renders through it; `null` renders as "missing", never 0.
- **Phase 5:** `import_receipts` table (rows added / updated / rejected per import, with the rejected rows) extending `ImportFlow.tsx`'s confirm step; retry re-submits only rejected rows.

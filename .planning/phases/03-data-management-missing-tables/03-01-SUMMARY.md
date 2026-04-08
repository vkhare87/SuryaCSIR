---
phase: 03-data-management-missing-tables
plan: "01"
subsystem: data-pipeline
tags: [supabase, ddl, rls, data-context, error-state, mapper]
dependency_graph:
  requires: [02-03]
  provides: [scientific_outputs-table, ip_intelligence-table, DataContext-error-state, dataMapper-scientific-ip]
  affects: [DataContext, Layout, dataMapper, supabase_schema]
tech_stack:
  added: []
  patterns: [Supabase RLS write policies, snake_case-to-camelCase mapper pattern, React error state surfacing]
key_files:
  created: []
  modified:
    - SuryaFD/supabase_schema.sql
    - SuryaFD/src/utils/dataMapper.ts
    - SuryaFD/src/contexts/DataContext.tsx
    - SuryaFD/src/components/layout/Layout.tsx
decisions:
  - "Cherry-picked 3 Phase 2 Plan 3 worktree commits (c8b1f77, 6717057, a9d3910) to bring DataContext, supabaseClient, mockData, KpiCard, and 7 dashboard views into this branch"
  - "scientific_outputs and ip_intelligence use snake_case SQL columns mapping to camelCase TypeScript fields via new mapper functions"
  - "error state in DataContext clears on each loadData() call (setError(null) at start) so transient failures auto-recover"
  - "Layout error banner renders only when error is non-null, positioned between topbar and main content area"
metrics:
  duration: "~20 min"
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 3 Plan 1: Supabase DDL + DataContext Error State + Mapper Extensions Summary

**One-liner:** Supabase DDL for scientific_outputs/ip_intelligence with RLS, real DataContext fetches replacing mock-only lines, error state surfacing via Layout banner, and snake_case mapper functions.

## What Was Built

### Task 1: Merge worktree commits + Supabase DDL + dataMapper extensions
Cherry-picked 3 commits from `worktree-agent-a57d7e25` (Phase 2 Plan 3) into this branch:
- `b29cae7` — DataContext auth-aware with division scoping (brought DataContext.tsx, supabaseClient.ts, mockData.ts)
- `ac44a2b` — KpiCard and all 7 role dashboard views
- `18c7181` — Dashboard.tsx role-switch dispatcher

Appended Phase 3 DDL to `SuryaFD/supabase_schema.sql`:
- `CREATE TABLE IF NOT EXISTS public.scientific_outputs` — id, title, authors[], journal, year, doi, impact_factor, citation_count, division_code with appropriate constraints
- `CREATE TABLE IF NOT EXISTS public.ip_intelligence` — id, title, type (CHECK enum), status (CHECK enum), filing_date, grant_date, inventors[], division_code
- `ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS "Gender" text` — resolves Concern #9
- RLS read policies for both new tables (all authenticated users)
- HRAdmin/SystemAdmin write policies for both new tables
- RLS enabled on both new tables

Added to `SuryaFD/src/utils/dataMapper.ts`:
- `mapScientificOutputRow` — maps impact_factor → impactFactor, citation_count → citationCount, division_code → divisionCode
- `mapIPIntelligenceRow` — maps filing_date → filingDate, grant_date → grantDate, division_code → divisionCode
- Updated type import to include `ScientificOutput` and `IPIntelligence`

**Commit:** `4a1f696`

### Task 2: Wire DataContext real fetches + error state + Layout error banner
Updated `SuryaFD/src/contexts/DataContext.tsx`:
- Added `mapScientificOutputRow` and `mapIPIntelligenceRow` to mapper imports
- Added `error: string | null` to `DataContextType` interface
- Added `const [error, setError] = useState<string | null>(null)`
- Added `setError(null)` at top of `loadData()` (clears on each attempt)
- Extended `Promise.all` to include `supabase.from('scientific_outputs').select('*')` and `supabase.from('ip_intelligence').select('*')`
- Replaced permanent mock-only lines with `soRes.data.map(mapScientificOutputRow)` and `ipRes.data.map(mapIPIntelligenceRow)`
- Added `setError(message)` in catch block with `Error.message` fallback
- Added `error` to `DataContext.Provider` value object

Updated `SuryaFD/src/components/layout/Layout.tsx`:
- Added `AlertCircle` to lucide-react imports
- Added `import { useData } from '../../contexts/DataContext'`
- Added `const { error } = useData()` in Layout function body
- Inserted rose-tinted error banner (`bg-rose-50 border-rose-200 text-rose-700`) between topbar header and main content, renders only when `error` is non-null

**Commit:** `624f38b`

## Deviations from Plan

None — plan executed exactly as written. The cherry-pick of 3 worktree commits succeeded without conflicts.

## Threat Coverage

All STRIDE threats from the plan's threat model are mitigated:
- T-03-01 / T-03-02: RLS write policies restricting INSERT/UPDATE/DELETE to HRAdmin/SystemAdmin applied; CHECK constraints on type/status enum values included in DDL
- T-03-03: Read access for all authenticated users accepted per plan disposition
- T-03-04: Error state set in catch block, mock fallback ensures app stays usable, error cleared on next successful load
- T-03-05: Gender column is nullable text, no privilege escalation path

## Known Stubs

None — DataContext now fetches real data from Supabase when provisioned. Mock fallback only activates when `isProvisioned()` returns false or on fetch error.

## Self-Check: PASSED

Files verified:
- SuryaFD/supabase_schema.sql: FOUND — contains CREATE TABLE for scientific_outputs and ip_intelligence
- SuryaFD/src/utils/dataMapper.ts: FOUND — exports mapScientificOutputRow and mapIPIntelligenceRow
- SuryaFD/src/contexts/DataContext.tsx: FOUND — contains error state, real fetches, mapper calls
- SuryaFD/src/components/layout/Layout.tsx: FOUND — contains useData, AlertCircle, error banner
- SuryaFD/src/pages/dashboards/DirectorView.tsx: FOUND (from cherry-pick)
- SuryaFD/src/utils/supabaseClient.ts: FOUND (from cherry-pick)
- SuryaFD/src/utils/mockData.ts: FOUND (from cherry-pick)

Commits verified:
- 4a1f696: feat(03-01): Supabase DDL for scientific_outputs, ip_intelligence + dataMapper extensions — FOUND
- 624f38b: feat(03-01): wire DataContext real fetches + error state + Layout error banner — FOUND

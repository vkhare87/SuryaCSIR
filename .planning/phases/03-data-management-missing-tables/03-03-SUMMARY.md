---
phase: 03-data-management-missing-tables
plan: "03"
subsystem: data-pipeline
tags: [supabase, zod, validation, inline-editing, modal, crud, intelligence, data-import]
dependency_graph:
  requires: [03-02]
  provides: [validateRows-utility, VALIDATION_SCHEMAS, Modal-component, Intelligence-CRUD]
  affects: [DataManagement, Intelligence, dataMigration, Modal]
tech_stack:
  added: [zod v4]
  patterns: [Zod validation schemas, inline cell editing, batch upsert commit, reusable modal, CRUD modals]
key_files:
  created:
    - SuryaFD/src/components/ui/Modal.tsx
  modified:
    - SuryaFD/src/utils/dataMigration.ts
    - SuryaFD/src/pages/DataManagement.tsx
    - SuryaFD/src/pages/Intelligence.tsx
decisions:
  - "z.string().min(1) used instead of .nonempty() which is removed in Zod v4 (already installed at v4.3.6)"
  - "validateRows re-runs full dataset on each inline edit save to keep validation state consistent"
  - "Confirm Import button disabled after successful commit (commitResult !== null) to prevent double-submit"
  - "Modal.tsx uses no portal library — renders inline via z-50 fixed overlay, consistent with no external modal dep in codebase"
  - "deleteConfirm state is shared between pub and IP modals (only one can be open at a time)"
  - "Schema push is a manual step — DDL was already appended to supabase_schema.sql in Plan 01; human must run in Supabase SQL Editor"
metrics:
  duration: "~30 min"
  completed: "2026-04-08"
  tasks_completed: 2
  tasks_pending: 1
  files_modified: 4
---

# Phase 3 Plan 3: Validation + Inline Editing + Intelligence CRUD Modals Summary

**One-liner:** Zod v4 validation schemas and validateRows added to dataMigration.ts; DataManagement.tsx Step 2 gains error indicators (ring-red-400, bg-rose-50) and inline cell editing (Enter/Tab/Escape); Step 3 wired to pushToSupabase with result summary; new Modal.tsx reusable component; Intelligence.tsx gains full CRUD modals for scientific_outputs and ip_intelligence.

## What Was Built

### Task 1: Validation schemas + inline editing + commit flow (commit: 69528c9)

**dataMigration.ts additions:**
- `import { z } from 'zod'` — Zod v4.3.6 already in node_modules
- `RowValidationResult` interface — `{ rowIndex, errors: [{field, message}][], isValid }`
- `VALIDATION_SCHEMAS` — per-FileType `z.ZodObject` with `.passthrough()`: staff (ID/Name/Division required), divisions (divCode/divName), projects (ProjectID/ProjectNo/ProjectName), projectStaff (ProjectNo/StaffName), phd (EnrollmentNo/StudentName/SupervisorName), equipment (UInsID/Name)
- `validateRows(rows, type)` — maps each row through `schema.safeParse`, returns `RowValidationResult[]`

**DataManagement.tsx rewrite:**
- Added `useData` for `refreshData`; added `supabase` import; added `validateRows`, `pushToSupabase`, `RowValidationResult` imports
- New state: `validationResults`, `editingCell`, `editValue`, `isCommitting`, `commitResult`
- `handleNext1` now runs `validateRows` after `parseFile` succeeds
- **Step 2 error count banner:** `{totalErrors} errors found in {errorRowCount} rows` with `AlertCircle` icon, visible when `totalErrors > 0`
- **Step 2 preview table:** error badge column (rose circle with count), per-row `bg-rose-50` tint, per-cell `ring-1 ring-red-400` for flagged fields
- `handleCellClick` — opens inline `<input>` on flagged cells only; `handleCellSave` — updates parsedData, re-runs full validation, closes editor
- **Step 3 Import Summary card:** total/valid/error row counts, target table name
- **Confirm Import button:** enabled only when `errorRowCount === 0`; calls `pushToSupabase`, stores `commitResult`
- **Import Complete card:** shows upserted/failed/total; "Import Another File" resets wizard
- `refreshData()` called after successful commit

### Task 2: Modal component + Intelligence CRUD modals (commit: c987fe6)

**Modal.tsx (NEW):**
- `useEffect` ESC key listener (attached/detached on open/close)
- `bg-black/40` overlay with `onClick={onClose}`
- `bg-surface border-border rounded-2xl` panel, `font-serif` heading, `X` close button
- `max-h-[90vh] overflow-y-auto` for tall forms

**Intelligence.tsx rewrite:**
- Added Modal, Button, supabase, ScientificOutput, IPIntelligence, Plus, Trash2 imports
- Added `refreshData` from `useData()`
- State: `pubModalMode`, `ipModalMode`, `selectedPub`, `selectedIP`, `deleteConfirm`, `isSaving`, `pubForm`, `ipForm`
- **Add button** in search/filter bar, context-aware (publications vs IP tab)
- **Row click** on DataTable opens Edit modal with pre-filled form
- `handlePubSave` / `handleIPSave`: insert (with `crypto.randomUUID()`) or update; uses snake_case field names for Supabase (`impact_factor`, `citation_count`, `filing_date`, `grant_date`, `division_code`)
- `handlePubDelete` / `handleIPDelete`: delete + confirmation
- Both modals have **inline delete confirmation**: "Are you sure?" with Yes/Cancel buttons
- All CRUD operations call `refreshData()` after success

### Task 3: Human Verification (PENDING)

Task 3 is a `checkpoint:human-verify` gate. It requires manual testing of the complete import wizard and Intelligence CRUD flows. See verification steps in the plan.

**To verify:**
1. Run `cd SuryaFD && npm run dev` and open the app
2. Log in as SystemAdmin or HRAdmin
3. Test Data Import: upload a file, verify error indicators in Step 2, inline edit a flagged cell, confirm import in Step 3
4. Test Intelligence CRUD: Add/Edit/Delete publications and IP assets, verify `Are you sure?` confirmation and data refresh

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2.

## Threat Coverage

All STRIDE threats from the plan's threat model are addressed in the implemented code:
- **T-03-10** (Tampering — import commit): `validateRows` runs after parse; `errorRowCount > 0` disables Confirm Import button; `pushToSupabase` batches in chunks of 50; RLS write policies applied in Plan 01 DDL
- **T-03-11** (Tampering — Intelligence INSERT/UPDATE): Supabase RLS write policies restrict to HRAdmin/SystemAdmin; CHECK constraints on type/status enforce valid enums (DDL in Plan 01)
- **T-03-12** (Tampering — Intelligence DELETE): `deleteConfirm` state gates deletion behind "Are you sure?" inline confirmation; RLS applies
- **T-03-13** (Spoofing — modal form): All inputs are controlled React state; no eval/dangerouslySetInnerHTML; Supabase parameterizes queries
- **T-03-14** (Information Disclosure — pre-filled data): Edit modal shows data already visible in DataTable; no access elevation
- **T-03-15** (DoS — large batch): `pushToSupabase` batches at BATCH_SIZE=50; unchanged from Plan 02

## Known Stubs

None in Tasks 1 and 2 — all features are fully wired. Task 3 (human verification) is pending.

## Self-Check: PASSED

Files verified:
- SuryaFD/src/utils/dataMigration.ts: FOUND — exports VALIDATION_SCHEMAS, validateRows, RowValidationResult
- SuryaFD/src/pages/DataManagement.tsx: FOUND — contains ring-red-400, bg-rose-50, editingCell, handleCellSave, Confirm Import, commitResult, upserted, refreshData
- SuryaFD/src/components/ui/Modal.tsx: FOUND — exports Modal, contains Escape handler, bg-black/40 overlay
- SuryaFD/src/pages/Intelligence.tsx: FOUND — contains pubModalMode, ipModalMode, handlePubSave, handleIPSave, handlePubDelete, handleIPDelete, Are you sure, refreshData, crypto.randomUUID, scientific_outputs, ip_intelligence

Commits verified:
- 69528c9: feat(03-03): Zod validation schemas + inline cell editing + Step 3 commit flow — FOUND
- c987fe6: feat(03-03): Modal.tsx component + Intelligence CRUD modals — FOUND

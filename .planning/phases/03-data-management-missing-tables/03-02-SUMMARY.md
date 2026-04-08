---
phase: 03-data-management-missing-tables
plan: "02"
subsystem: data-pipeline
tags: [supabase, file-upload, papaparse, xlsx, wizard, route-guards, HRAdmin]
dependency_graph:
  requires: [03-01]
  provides: [dataMigration-utility, DataManagement-3step-wizard, HRAdmin-data-route]
  affects: [DataManagement, App, Layout, dataMigration]
tech_stack:
  added: [papaparse, xlsx]
  patterns: [3-step wizard, drag-and-drop file upload, column mapping chips, batch upsert]
key_files:
  created:
    - SuryaFD/src/utils/dataMigration.ts
  modified:
    - SuryaFD/src/pages/DataManagement.tsx
    - SuryaFD/src/App.tsx
    - SuryaFD/src/components/layout/Layout.tsx
decisions:
  - "parseFile always resolves (never rejects) with success/error shape — keeps DataManagement.tsx error handling simple and prevents unhandled rejections"
  - "detectColumnMappings checks SCHEMA_MAPS first, then ALLOWED_COLUMNS directly — handles both renamed and passthrough column headers"
  - "Preview table capped at 100 rows per T-03-09 DoS mitigation; formatData filters empty rows before counting"
  - "Step 3 Confirm Import button is disabled in this plan (wired in Plan 03) — prevents data push before row validation is implemented"
  - "NAV_ITEMS label changed from 'Data Management' to 'Data Import' to match the new page heading and wizard intent"
metrics:
  duration: "~25 min"
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 3 Plan 2: dataMigration Utility + 3-Step Import Wizard Summary

**One-liner:** New dataMigration.ts utility (parseFile/formatData/pushToSupabase/detectColumnMappings) and complete rewrite of DataManagement.tsx as a 3-step import wizard with column mapping preview, replacing the terminal-log layout; HRAdmin route access added.

## What Was Built

### Task 1: Create dataMigration.ts

Created `SuryaFD/src/utils/dataMigration.ts` as a new file. Previously the file was referenced by `DataManagement.tsx` imports but did not exist — this resolves the build error.

**Exports:**
- `FileType` — union type: `'staff' | 'divisions' | 'projects' | 'projectStaff' | 'phd' | 'equipment'`
- `SCHEMA_MAPS` — per-FileType Excel header → Supabase column name rename maps
- `ALLOWED_COLUMNS` — per-FileType column whitelists (Gender included in staff per Concern #9)
- `TABLE_NAMES` — FileType → Supabase table name (e.g., `projectStaff → 'project_staff'`)
- `parseFile(file, type)` — reads CSV via papaparse, Excel via xlsx; calls formatData; always resolves
- `formatData(rawRows, type)` — renames via SCHEMA_MAPS, filters via ALLOWED_COLUMNS, removes empty rows
- `pushToSupabase(client, tableName, rows, onLog)` — batch upsert in chunks of 50, calls onLog with progress
- `detectColumnMappings(rawHeaders, type)` — returns `{raw, mapped|null}[]` for preview column chip rendering

**Commit:** `05348c8`

### Task 2: Rewrite DataManagement.tsx + route guards

**DataManagement.tsx** fully rewritten — terminal-log layout completely removed (no "Database Operations Center", no "MIGRATION LOGS"). Replaced with a 3-step import wizard:

- **Connection badge** — compact chip at top of card showing Connected (emerald) / Not Connected (rose)
- **Step indicator** — numbered stepper with Check icon for completed steps, terracotta for active, muted for future
- **Step 1 (Upload)** — entity type selector (6 FileType options) + drag-and-drop file upload zone; Next is disabled when no file selected or database not connected; calls `parseFile` + `detectColumnMappings` on advance
- **Step 2 (Preview)** — row count banner; preview table with per-column mapping chips above headers (terracotta `Mapped: {field}` for recognized columns, sand `Unmapped` for unrecognized); capped at first 100 rows; Back/Next navigation
- **Step 3 (Confirm)** — import summary showing row count and target table name; disabled "Confirm Import" button (wired in Plan 03); note: "Validation and commit will be available after review"

**App.tsx** — `/data` route `allowedRoles` updated from `['SystemAdmin']` to `['HRAdmin', 'SystemAdmin']`

**Layout.tsx** — `/data` NAV_ITEMS entry updated: `allowedRoles: ['HRAdmin', 'SystemAdmin']`, label changed to `'Data Import'`

**Commit:** `7246059`

## Deviations from Plan

None — plan executed exactly as written.

## Threat Coverage

All STRIDE threats from the plan's threat model are mitigated:
- **T-03-06** (Tampering — file parsing): `parseFile` wraps all parsing in try/catch, always returns `{success, error}` shape, never throws. papaparse and xlsx handle malformed files gracefully.
- **T-03-07** (Elevation of Privilege — /data access): `ProtectedRoute allowedRoles` set to `['HRAdmin', 'SystemAdmin']`; NAV_ITEMS filtered by role in Layout; Supabase RLS enforces server-side write permissions.
- **T-03-08** (Information Disclosure — preview table): Preview shows only data the admin uploaded themselves; no cross-user data; not persisted until Step 3 confirm (which is disabled in this plan).
- **T-03-09** (DoS — large file): Preview table caps at first 100 rows; `formatData` filters empty rows before return; browser-level file size limits apply.

## Known Stubs

- **Step 3 Confirm Import** — button is disabled in this plan. `pushToSupabase` is implemented in `dataMigration.ts` and ready to be wired. Plan 03 will add row-level validation and wire the confirm action.

## Self-Check: PASSED

Files verified:
- SuryaFD/src/utils/dataMigration.ts: FOUND — exports FileType, SCHEMA_MAPS, ALLOWED_COLUMNS, TABLE_NAMES, parseFile, formatData, pushToSupabase, detectColumnMappings
- SuryaFD/src/pages/DataManagement.tsx: FOUND — contains 3-step wizard, no terminal-log remnants
- SuryaFD/src/App.tsx: FOUND — /data route allows HRAdmin + SystemAdmin
- SuryaFD/src/components/layout/Layout.tsx: FOUND — /data NAV_ITEMS allows HRAdmin + SystemAdmin

Commits verified:
- 05348c8: feat(03-02): create dataMigration.ts with parseFile, formatData, SCHEMA_MAPS, ALLOWED_COLUMNS — FOUND
- 7246059: feat(03-02): rewrite DataManagement.tsx as 3-step wizard + update HRAdmin route guards — FOUND

# Merge Data Import + DB Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `/db-wizard` "Database Builder" page into the `/data` "Data Management" page as a "Build Database" tab beside "Staff Mapping", and redirect the old route.

**Architecture:** Extract the wizard's body into a reusable `DatabaseBuilderPanel` component, render it as one of two tabs in `DataManagement`, delete the old wizard page, redirect `/db-wizard`→`/data`, and remove the duplicate nav entry. CSS/composition only — no behavior change to import or mapping logic.

**Tech Stack:** React 19, TypeScript strict (verbatimModuleSyntax, noUnusedLocals/Parameters), React Router 7 (HashRouter), Tailwind 4. vitest available but this is composition work — verified via tsc/eslint + manual pass.

**Spec:** `docs/superpowers/specs/2026-05-25-merge-data-import-db-wizard-design.md`

---

## Verification note (read first)

This is UI composition + routing — not meaningfully unit-testable. Each task is verified by `npx tsc --noEmit` (clean) and `npx eslint src/` (no new errors). After all tasks, `npx vitest run` must still pass (284 tests). Live authed-browser verification is blocked by a dev-auth quirk; the user does a final manual pass.

**Context:** `src/pages/DataManagement.tsx`, `src/pages/DatabaseWizard.tsx`, and `src/utils/dataMigration.ts` have uncommitted working-tree changes; `src/components/ImportFlow.tsx`, `src/components/ManualEntryGrid.tsx`, `src/utils/dataMigration.test.ts` are untracked. Build on the current working-tree state. When committing each task, `git add` only the specific files that task touches (do NOT `git add -A` — it would sweep in unrelated WIP like Login.tsx/index.css).

---

## File Structure

- `src/components/DatabaseBuilderPanel.tsx` — CREATE. The wizard's stepper + per-step import/manual UI as a self-contained panel component (owns its own state + `useData`).
- `src/pages/DataManagement.tsx` — MODIFY. Replace the `import` tab with a `build` tab rendering `DatabaseBuilderPanel`; keep `mapping` tab.
- `src/pages/DatabaseWizard.tsx` — DELETE.
- `src/App.tsx` — MODIFY. `/db-wizard`→redirect; remove `DatabaseWizard` lazy import.
- `src/components/layout/Layout.tsx` — MODIFY. Remove `/db-wizard` nav item; relabel `/data` item.

---

## Task 1: Extract `DatabaseBuilderPanel`

**Files:**
- Create: `src/components/DatabaseBuilderPanel.tsx`

This moves the body of `src/pages/DatabaseWizard.tsx` into a component. Note the import paths change because the new file lives in `src/components/` (not `src/pages/`): `../components/ui/Cards`→`./ui/Cards`, `../components/ui/Button`→`./ui/Button`, `../components/ImportFlow`→`./ImportFlow`, `../components/ManualEntryGrid`→`./ManualEntryGrid`; the `../utils/*` and `../contexts/*` paths stay the same. The outer page wrapper (`<div className="space-y-6 max-w-6xl mx-auto">`) and the `<h1>Database Builder</h1>` heading are dropped (the host page supplies the container + heading); the descriptive paragraph is kept as panel intro text.

- [ ] **Step 1: Create the file with exactly this content**

```tsx
import { useState } from 'react';
import { Check, Download, FileSpreadsheet, UploadCloud, PencilLine, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import { ImportFlow } from './ImportFlow';
import { ManualEntryGrid } from './ManualEntryGrid';
import { generateTemplate, FILE_TYPE_LABELS, type FileType } from '../utils/dataMigration';
import { isProvisioned } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';

interface StepDef {
  type: FileType;
  prereqLabel: string | null;
}

// Dependency-ordered: each step's prereq must usually exist before it makes sense.
const STEP_DEFS: StepDef[] = [
  { type: 'divisions',    prereqLabel: null },
  { type: 'staff',        prereqLabel: 'Divisions' },
  { type: 'projects',     prereqLabel: 'Divisions' },
  { type: 'projectStaff', prereqLabel: 'Projects' },
  { type: 'phd',          prereqLabel: 'Staff' },
  { type: 'equipment',    prereqLabel: 'Divisions' },
  { type: 'contractStaff',prereqLabel: 'Staff' },
];

function downloadTemplate(type: FileType, format: 'xlsx' | 'csv') {
  const blob = generateTemplate(type, format);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}-template.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DatabaseBuilderPanel() {
  const data = useData();
  const { divisions, staff, projects, projectStaff, phDStudents, equipment, contractStaff, refreshData } = data;

  const counts: Record<FileType, number> = {
    divisions: divisions.length,
    staff: staff.length,
    projects: projects.length,
    projectStaff: projectStaff.length,
    phd: phDStudents.length,
    equipment: equipment.length,
    contractStaff: contractStaff.length,
  };

  // Prereq satisfied = its corresponding table has rows.
  const prereqCount: Record<FileType, number | null> = {
    divisions: null,
    staff: counts.divisions,
    projects: counts.divisions,
    projectStaff: counts.projects,
    phd: counts.staff,
    equipment: counts.divisions,
    contractStaff: counts.staff,
  };

  const [activeIdx, setActiveIdx] = useState(0);
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');

  const active = STEP_DEFS[activeIdx];
  const prereqMissing = active.prereqLabel !== null && (prereqCount[active.type] ?? 0) === 0;

  const advance = () => {
    refreshData();
    if (activeIdx < STEP_DEFS.length - 1) {
      setActiveIdx((i) => i + 1);
      setMode('upload');
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">
        Seed the database step by step. Download a blank template, or add rows directly in the app.
      </p>

      {!isProvisioned() && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          <AlertTriangle size={16} className="shrink-0" />
          Not connected to Supabase. Templates still download, but uploading and saving are disabled until you connect.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Stepper */}
        <Card className="h-fit">
          <ol className="space-y-1">
            {STEP_DEFS.map((s, idx) => {
              const done = counts[s.type] > 0;
              const isActive = idx === activeIdx;
              return (
                <li key={s.type}>
                  <button
                    onClick={() => { setActiveIdx(idx); setMode('upload'); }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                      isActive ? 'bg-[#c96442]/10 text-[#c96442]' : 'hover:bg-surface-hover text-text',
                    )}
                  >
                    <span
                      className={clsx(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0',
                        done
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                          : isActive
                          ? 'bg-[#c96442] text-white border-[#c96442]'
                          : 'bg-surface-hover text-text-muted border-border',
                      )}
                    >
                      {done ? <Check size={14} /> : idx + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{FILE_TYPE_LABELS[s.type]}</span>
                      <span className="block text-[11px] text-text-muted">{counts[s.type]} rows</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Active step panel */}
        <div className="space-y-5">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-text">{FILE_TYPE_LABELS[active.type]}</h2>
                <p className="text-sm text-text-muted">
                  {counts[active.type]} existing row{counts[active.type] !== 1 ? 's' : ''}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => downloadTemplate(active.type, 'xlsx')}>
                  <Download size={14} className="mr-1.5" /> Template (.xlsx)
                </Button>
                <button
                  onClick={() => downloadTemplate(active.type, 'csv')}
                  className="text-xs font-medium text-[#c96442] hover:underline inline-flex items-center gap-1"
                >
                  <FileSpreadsheet size={12} /> .csv
                </button>
              </div>
            </div>

            {prereqMissing && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <AlertTriangle size={14} className="shrink-0" />
                No {active.prereqLabel} added yet. You can still proceed, but linking records to {active.prereqLabel} will be easier after adding them first.
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('upload')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  mode === 'upload' ? 'bg-[#c96442] text-white' : 'bg-surface-hover text-text-muted hover:text-text',
                )}
              >
                <UploadCloud size={14} /> Upload Filled File
              </button>
              <button
                onClick={() => setMode('manual')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  mode === 'manual' ? 'bg-[#c96442] text-white' : 'bg-surface-hover text-text-muted hover:text-text',
                )}
              >
                <PencilLine size={14} /> Add Rows Manually
              </button>
            </div>
          </Card>

          {mode === 'upload' ? (
            <ImportFlow key={`import-${active.type}`} type={active.type} onComplete={advance} />
          ) : (
            <Card>
              <ManualEntryGrid key={`grid-${active.type}`} type={active.type} onComplete={advance} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean (no output). The file is not yet referenced anywhere — that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/DatabaseBuilderPanel.tsx
git commit -m "feat: extract DatabaseBuilderPanel from DatabaseWizard page"
```

---

## Task 2: Recompose `DataManagement` with Build + Mapping tabs

**Files:**
- Modify: `src/pages/DataManagement.tsx`

- [ ] **Step 1: Swap the ImportFlow import for DatabaseBuilderPanel**

In `src/pages/DataManagement.tsx`, the import (line 5) currently reads:
```tsx
import { ImportFlow } from '../components/ImportFlow';
```
Replace it with:
```tsx
import { DatabaseBuilderPanel } from '../components/DatabaseBuilderPanel';
```

- [ ] **Step 2: Rename the tab state from `import` to `build`**

Currently (line 198):
```tsx
  const [activeTab, setActiveTab] = useState<'import' | 'mapping'>('import');
```
Change to:
```tsx
  const [activeTab, setActiveTab] = useState<'build' | 'mapping'>('build');
```

- [ ] **Step 3: Widen the page container**

Currently (line 206):
```tsx
    <div className="space-y-6 max-w-5xl mx-auto">
```
Change to:
```tsx
    <div className="space-y-6 max-w-6xl mx-auto">
```

- [ ] **Step 4: Replace the "Data Import" tab button with "Build Database"**

Currently (lines 228-232):
```tsx
        <button onClick={() => setActiveTab('import')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'import' ? 'border-[#c96442] text-[#c96442]' : 'border-transparent text-text-muted hover:text-text')}>
          Data Import
        </button>
```
Replace with:
```tsx
        <button onClick={() => setActiveTab('build')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'build' ? 'border-[#c96442] text-[#c96442]' : 'border-transparent text-text-muted hover:text-text')}>
          Build Database
        </button>
```

- [ ] **Step 5: Replace the import-tab body with the builder panel**

Currently (line 251):
```tsx
      {activeTab === 'import' && <ImportFlow showTypePicker onComplete={refreshData} />}
```
Replace with:
```tsx
      {activeTab === 'build' && <DatabaseBuilderPanel />}
```

Note: `refreshData` is still used by `StaffMappingPanel` (the `onSaved={refreshData}` prop on line 248), so it stays destructured from `useData()`. The `DatabaseBuilderPanel` calls `useData()` internally, so it does not need `refreshData` passed in.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint src/pages/DataManagement.tsx`
Expected: both clean. If eslint flags `refreshData` or any import as unused, recheck — `refreshData` must still be referenced by the mapping panel; `ImportFlow` must no longer be imported.

- [ ] **Step 7: Commit**

```bash
git add src/pages/DataManagement.tsx
git commit -m "feat: Data Management hosts Build Database + Staff Mapping tabs"
```

---

## Task 3: Redirect `/db-wizard` and delete the wizard page

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/DatabaseWizard.tsx`

- [ ] **Step 1: Remove the DatabaseWizard lazy import**

In `src/App.tsx`, delete this line (line 48):
```tsx
const DatabaseWizard    = lazy(() => import('./pages/DatabaseWizard'));
```

- [ ] **Step 2: Replace the `/db-wizard` route with a redirect**

Currently (line 164):
```tsx
            <Route path="/db-wizard" element={<ProtectedRoute allowedRoles={['SystemAdmin','MasterAdmin']}><DatabaseWizard /></ProtectedRoute>} />
```
Replace with:
```tsx
            <Route path="/db-wizard" element={<Navigate to="/data" replace />} />
```
(`Navigate` is already imported in `src/App.tsx` line 3 — no import change needed.)

- [ ] **Step 3: Delete the old page file**

```bash
git rm src/pages/DatabaseWizard.tsx
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/App.tsx`
Expected: clean. No remaining references to `DatabaseWizard` anywhere (the lazy import and route were the only two).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: redirect /db-wizard to /data and remove wizard page"
```

---

## Task 4: Update navigation

**Files:**
- Modify: `src/components/layout/Layout.tsx`

The Admin nav section (`NAV_SECTIONS`) currently contains both items:
```tsx
      { path: '/data',         label: 'Data Import',     icon: Database,        allowedRoles: ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] },
      { path: '/db-wizard',    label: 'DB Wizard',       icon: Database,        allowedRoles: ['SystemAdmin', 'MasterAdmin'] },
```

- [ ] **Step 1: Remove the `/db-wizard` item and relabel `/data`**

Replace those two lines with:
```tsx
      { path: '/data',         label: 'Data Management', icon: Database,        allowedRoles: ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] },
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/layout/Layout.tsx`
Expected: clean. `Database` icon is still used by the `/data` item, so its import stays valid.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Layout.tsx
git commit -m "feat: single Data Management nav entry, drop DB Wizard"
```

---

## Final verification

- [ ] `npx tsc --noEmit` → clean
- [ ] `npx eslint src/` → no new errors (5 pre-existing warnings expected)
- [ ] `npx vitest run` → all 284 tests still pass
- [ ] `grep -rn "DatabaseWizard" src/` → no results (page fully removed)
- [ ] `grep -rn "db-wizard" src/` → only the redirect Route in App.tsx
- [ ] Manual user pass (auth-blocked for the agent): `/data` shows "Build Database" + "Staff Mapping" tabs; stepper + template download + upload/manual all work; untagged banner still jumps to Mapping; `/db-wizard` redirects to `/data`; sidebar shows one "Data Management" entry.

---

## Self-review (by plan author)

- **Spec coverage:** Unit 1 (extract panel) → Task 1. Unit 2 (recompose DataManagement) → Task 2. Unit 3 (routing + delete) → Task 3. Unit 4 (nav) → Task 4. Preservation checklist items map to Tasks 1–2 (stepper/templates/upload/manual/banners → panel; mapping/untagged banner → DataManagement) and Task 3 (redirect). All spec requirements covered.
- **Type consistency:** Tab union `'build' | 'mapping'` used consistently across state init (Step 2), button (Step 4), and body (Step 5). `DatabaseBuilderPanel` is a named export (Task 1) and imported as a named import (Task 2 Step 1). `refreshData` retained for `StaffMappingPanel` only.
- **Placeholder scan:** No TBD/TODO; every code step shows complete before/after. The only "manual pass" item is the documented auth-blocked browser check, not a deferred implementation.

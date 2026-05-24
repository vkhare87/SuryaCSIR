# Database Builder — Design Spec

**Date:** 2026-05-25
**Status:** Approved for implementation

## Problem

When the SURYA database is wiped (fresh project / reset), there is no way to seed it
from scratch. The existing `DataManagement.tsx` import wizard assumes you *already have*
a correctly-shaped Excel/CSV file. A user starting from zero has to hand-build that file,
guessing column headers, required fields, date formats, and valid foreign-key values
(division codes, project numbers). `DatabaseWizard.tsx` is an empty placeholder stub.

## Goal

Give the user two complementary ways to create entries from scratch, walked through in
dependency order:

1. **Download a blank template** (.xlsx, headers + one example row + an Instructions sheet)
   per entity, fill it in Excel, re-upload through the existing import pipeline.
2. **Add rows manually** in an in-app grid, no Excel round-trip.

Both reuse the existing parse → validate → upsert pipeline. No new database code.

## Approach (chosen: A)

Rebuild the already-routed `DatabaseWizard.tsx` stub into a guided builder. Extract the
existing import machine out of `DataManagement.tsx` into a reusable `<ImportFlow>` so the
wizard can mount it inline without bouncing the user to another page.

Rejected alternatives:
- **B (third tab in DataManagement):** flat tabs fight the requested guided sequence.
- **C (new page, leave stub):** wastes the already-wired `DatabaseWizard` route.

## Entity dependency order

```
1. Divisions
2. Staff            (Division code → divisions)
3. Projects         (DivisionCode → divisions, PI → staff)
4. Project Staff    (ProjectNo → projects)
5. PhD Scholars     (Supervisor → staff)
6. Equipment
7. Contract Staff   (AttachedToStaffID → staff)
```

Foreign-key dependencies are **soft-blocked**: the wizard warns when a prerequisite table
is empty but still lets the user proceed (late tagging is already handled by
`resolveImportDivisions` + the Staff Mapping tab).

---

## Section 1 — Data layer (`src/utils/dataMigration.ts`)

### `FIELD_META` registry (new, additive)

```ts
interface FieldMeta {
  column: string;    // canonical Supabase column, e.g. 'ID'
  label: string;     // friendly header, e.g. 'Employee ID'
  required: boolean; // drives Instructions sheet + grid asterisk
  example: string;   // sample value, e.g. 'AMP-1024'
  hint: string;      // 'Unique. Format AMP-####'
}
const FIELD_META: Record<FileType, FieldMeta[]>;
```

- One ordered array per `FileType`. `label` reuses the friendly names already in `SCHEMA_MAPS`.
- **Additive, not a refactor.** `ALLOWED_COLUMNS` stays hardcoded as-is. Reason: auto-generated
  PK columns (`id` on `project_staff`, `contract_staff`) live in `ALLOWED_COLUMNS` but must
  NOT appear in templates/grid. Deriving `ALLOWED_COLUMNS` from `FIELD_META` would force
  `id` handling and risk dropping a column. Instead, a test asserts every `FIELD_META[t].column`
  is a member of `ALLOWED_COLUMNS[t]` (consistency guard without coupling).

### Example-row sentinel (new)

```ts
export const EXAMPLE_SENTINEL = '__EXAMPLE__';
```

- The example row in a downloaded template puts `EXAMPLE_SENTINEL` in the first **required**
  field's cell.
- `formatData` gains one filter: drop any row where any value === `EXAMPLE_SENTINEL`.
- If the user overwrites the example row with real data, the sentinel is gone → row is kept.

### `generateTemplate(type, format)` (new)

```ts
export function generateTemplate(type: FileType, format: 'xlsx' | 'csv'): Blob;
```

- **xlsx (default):**
  - Sheet `"Data"`: row 1 = `label`s; row 2 = example row (`example` values, sentinel in key col).
  - Sheet `"Instructions"`: table — `Field | Required | Format / Hint` from `FIELD_META`.
- **csv:** `"Data"` sheet only (headers + example row). CSV can't carry a second sheet, so the
  download UI labels it "headers + example only".
- Built with the already-imported `xlsx` lib; returns a Blob the UI triggers as a download.

---

## Section 2 — `<ImportFlow>` extraction (`src/components/ImportFlow.tsx`)

Move the parse → preview → commit machine out of `DataManagement.tsx` into a reusable component.

**Props:**
```ts
interface ImportFlowProps {
  type?: FileType;          // when provided + showTypePicker=false, type is locked
  showTypePicker?: boolean; // DataManagement = true; wizard = false
  onComplete?: () => void;  // wizard uses this to advance the step
}
```

**Owns** (moved verbatim from `DataManagement.tsx`): file/drag-drop state, `parseFile` →
`detectColumnMappings` → `validateRows`, the 3-step indicator, preview table with inline
flagged-cell editing, step-3 summary, `pushToSupabase`, `refreshData`.

**Mount points:**
- `DataManagement.tsx` Import tab → `<ImportFlow showTypePicker />`.
- `DatabaseWizard.tsx` active step → `<ImportFlow type={stepType} onComplete={advance} />`.

No behavior change to the existing DataManagement page. Staff Mapping tab stays as-is.

---

## Section 3 — In-app manual grid (`src/components/ManualEntryGrid.tsx`)

**Props:** `{ type: FileType; onComplete?: () => void }`.

- Columns from `FIELD_META[type]` — `label` headers, required cols marked `*`.
- Starts with ~5 blank rows; "Add Row" / "Remove Row" controls.
- **FK fields render as dropdowns** fed by `useData()`:
  - Division columns → divisions list
  - `ProjectNo` → projects list
  - `SupervisorName` / PI → staff list
  - everything else → plain text/date input.
- Live per-row validation reusing `validateRows`; bad cells outlined red (same visual as preview).
- "Save All" → strip empty rows → `pushToSupabase` → `refreshData` → `onComplete`.
- Clipboard paste deferred (not v1).

Reuses `validateRows` + `pushToSupabase`; no new DB code.

---

## Section 4 — Wizard shell (`src/pages/DatabaseWizard.tsx`)

Replace stub. Vertical stepper in dependency order, each step showing a **live row count**
from `useData()` (count > 0 → green check). Active step panel offers three actions:

1. **Download Template** (.xlsx default, .csv secondary link) — works offline, no DB needed.
2. **Upload Filled File** — mounts `<ImportFlow type={stepType} onComplete={advance} />`.
3. **Add Rows Manually** — mounts `<ManualEntryGrid type={stepType} onComplete={advance} />`.

- Prerequisite guard: soft-block + warning when the parent table is empty.
- `isProvisioned()` gate (reused): Download enabled offline; Upload/Save disabled when not connected.
- After a commit, counts refresh and the wizard suggests advancing.

---

## Edge cases

- **Example-row round-trip** — sentinel filter in `formatData` drops untouched example rows;
  overwritten rows survive.
- **Empty-DB FK dropdowns** — show "(none — add X first)" placeholder; matches soft-block.
- **Duplicate keys** — `pushToSupabase` already upserts (PK conflict = update); re-running a step is safe.
- **Not provisioned** — Download works; Upload/Save disabled.
- **CSV has no Instructions sheet** — accepted; xlsx is the default, csv is labeled accordingly.

## Testing (vitest, alongside existing `dataMigration` suite)

- `generateTemplate(type,'xlsx')` → re-parse output → headers match `FIELD_META` labels;
  example row present; sentinel sits in the key column.
- `formatData` drops rows containing `EXAMPLE_SENTINEL`.
- Consistency guard: every `FIELD_META[t].column` ∈ `ALLOWED_COLUMNS[t]`.
- `validateRows` behavior unchanged (existing tests stay green).
- Component smoke tests: wizard renders 7 steps with counts; grid flags a bad row.

## Files touched

| File | Change |
|------|--------|
| `src/utils/dataMigration.ts` | + `FIELD_META`, `EXAMPLE_SENTINEL`, `generateTemplate`; sentinel filter in `formatData` |
| `src/components/ImportFlow.tsx` | **new** — extracted import machine |
| `src/components/ManualEntryGrid.tsx` | **new** — manual row grid |
| `src/pages/DatabaseWizard.tsx` | rebuild stub → guided wizard shell |
| `src/pages/DataManagement.tsx` | replace inline import machine with `<ImportFlow showTypePicker />` |
| `src/utils/dataMigration.test.ts` | + template / sentinel / consistency tests |

## Out of scope

- Excel data-validation dropdowns inside the downloaded file (xlsx lib support is weak).
- Clipboard paste into the grid.
- Editing/deleting existing rows (this is a *seeding* tool; CRUD lives elsewhere).

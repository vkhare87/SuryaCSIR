# Responsive Mobile & Tablet Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SURYA's priority flows usable and appealing on phones (360px+) and tablets (768–1024px) without horizontal scroll or cramped controls.

**Architecture:** CSS-first. Fix shared primitives once (`DataTable`, `Modal`) so the win propagates; author proper card renderers for the three list-only priority tables; sweep priority pages for grid/chart/form reflow. Tablet = small desktop except data tables, which show cards (with a toggle back to the table).

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`), Tailwind CSS 4 (`sm:`/`md:`/`lg:` utilities), `useUI()` breakpoints, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-25-responsive-mobile-tablet-design.md`

---

## Verification note (read first)

Pure CSS reflow cannot be meaningfully unit-tested. Only **Task 1** (DataTable view-mode logic) gets a unit test. Every other task is verified in the running preview at **360 / 768 / 1024 px** via `preview_resize` → `preview_screenshot` + `preview_snapshot`, plus `preview_console_logs` (errors) and `npx tsc --noEmit`. The dev server `serverId` is obtained once via `preview_list`.

Acceptance rule across all tasks: **no element exceeds viewport width (no horizontal page scroll) at 360 and 768**.

---

## File Structure

- `src/components/ui/DataTable.tsx` — MODIFY: add `isTablet` to card-mode trigger; add generic stacked-card fallback when no `renderGridItem`.
- `src/components/ui/DataTable.test.tsx` — CREATE: unit test for tablet card-default + generic fallback.
- `src/components/ui/Modal.tsx` — MODIFY: bottom-sheet on phone, centered dialog `sm:`+.
- `src/pages/PhDTracker.tsx` — MODIFY: add `renderStudentCard`, pass as `renderGridItem`.
- `src/pages/proposals/Proposals.tsx` — MODIFY: add `renderProposalCard`, pass as `renderGridItem`; ensure `Card` import.
- `src/pages/Facilities.tsx` — MODIFY: add `renderEquipmentCard`, pass as `renderGridItem` + `onRowClick`.
- Priority pages (KPI grids / charts / forms) — MODIFY per Tasks 6–9.

---

## Task 1: DataTable — tablet card-default + generic fallback

**Files:**
- Modify: `src/components/ui/DataTable.tsx`
- Test: `src/components/ui/DataTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/DataTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

// Mock useUI so we control the breakpoint
const uiState = { isMobile: false, isTablet: false, isDesktop: true };
vi.mock('../../contexts/UIContext', () => ({
  useUI: () => uiState,
}));

interface Row { id: number; name: string }
const data: Row[] = [{ id: 1, name: 'Acme Instrument' }];
const columns: Column<Row>[] = [
  { header: 'Name', accessorKey: 'name' },
  { header: '', cell: () => <button>Edit</button> },
];

describe('DataTable responsive view', () => {
  it('renders a real <table> on desktop', () => {
    uiState.isMobile = false; uiState.isTablet = false; uiState.isDesktop = true;
    render(<DataTable data={data} columns={columns} keyExtractor={(r) => r.id} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders generic stacked cards (no table) on tablet when no renderGridItem', () => {
    uiState.isMobile = false; uiState.isTablet = true; uiState.isDesktop = false;
    render(<DataTable data={data} columns={columns} keyExtractor={(r) => r.id} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();        // column label
    expect(screen.getByText('Acme Instrument')).toBeInTheDocument(); // value
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument(); // action col
  });

  it('defaults to custom grid on tablet when renderGridItem is provided', () => {
    uiState.isMobile = false; uiState.isTablet = true; uiState.isDesktop = false;
    render(
      <DataTable
        data={data}
        columns={columns}
        keyExtractor={(r) => r.id}
        renderGridItem={(r) => <div>CARD:{r.name}</div>}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('CARD:Acme Instrument')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/DataTable.test.tsx`
Expected: FAIL — tablet test still finds a `<table>` (current code only switches on `isMobile`, and has no generic-card branch).

- [ ] **Step 3: Implement the change**

In `src/components/ui/DataTable.tsx`, replace the hook + state block (currently lines ~33–44):

```tsx
  const { isMobile, isTablet } = useUI();
  const cardMode = isMobile || isTablet;
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    cardMode && renderGridItem ? 'grid' : 'list'
  );
  const [currentPage, setCurrentPage] = useState(1);

  // Default to card grid on phone/tablet when a custom card renderer exists
  useEffect(() => {
    if (cardMode && renderGridItem) {
      setViewMode('grid');
    }
  }, [cardMode, renderGridItem]);
```

Then replace the "Main Content Area" conditional (currently the `viewMode === 'grid' && renderGridItem ? (...) : (<Card>table</Card>)` block, ~lines 122–185) with a three-way branch. Add `const showGenericCards = cardMode && !renderGridItem;` just before the `return`, then:

```tsx
      {/* Main Content Area */}
      {renderGridItem && viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedData.map(item => (
            <div
              key={keyExtractor(item)}
              onClick={() => onRowClick && onRowClick(item)}
              className={clsx("h-full", onRowClick && "cursor-pointer transition-transform hover:-translate-y-1")}
            >
              {renderGridItem(item)}
            </div>
          ))}
          {paginatedData.length === 0 && (
            <div className="col-span-full py-16 text-center text-text-muted bg-surface/50 rounded-2xl border-2 border-dashed border-border">
              No records found matching your criteria.
            </div>
          )}
        </div>
      ) : showGenericCards ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paginatedData.length === 0 ? (
            <div className="col-span-full py-12 text-center text-text-muted bg-surface/50 rounded-2xl border-2 border-dashed border-border">
              No records found.
            </div>
          ) : (
            paginatedData.map(row => (
              <Card
                key={keyExtractor(row)}
                onClick={() => onRowClick && onRowClick(row)}
                className={clsx("space-y-2", onRowClick && "cursor-pointer hover:bg-surface-hover transition-colors")}
              >
                {columns.filter(c => c.header).map((col, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-text-muted text-xs font-medium shrink-0">{col.header}</span>
                    <span className="text-text text-right min-w-0">
                      {col.cell ? col.cell(row) : (col.accessorKey ? String(row[col.accessorKey] ?? '') : null)}
                    </span>
                  </div>
                ))}
                {columns.filter(c => !c.header).map((col, i) => (
                  <div key={`act-${i}`} className="flex justify-end pt-1">
                    {col.cell ? col.cell(row) : null}
                  </div>
                ))}
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className={clsx("overflow-hidden p-0", className)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-muted uppercase bg-surface-hover border-b border-border">
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} className={clsx("px-6 py-4 font-semibold", col.className)}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-text-muted">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, rowIndex) => (
                    <tr
                      key={keyExtractor(row)}
                      onClick={() => onRowClick && onRowClick(row)}
                      className={clsx(
                        "border-b border-border/50 hover:bg-surface-hover transition-colors",
                        onRowClick && "cursor-pointer",
                        rowIndex === paginatedData.length - 1 && "border-0"
                      )}
                    >
                      {columns.map((col, colIndex) => (
                        <td key={colIndex} className={clsx("px-6 py-4 whitespace-nowrap", col.className)}>
                          {col.cell
                            ? col.cell(row)
                            : (col.accessorKey ? String(row[col.accessorKey] ?? '') : null)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
```

(`Card` and `clsx` are already imported at the top of the file. No new imports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/DataTable.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/ui/DataTable.tsx src/components/ui/DataTable.test.tsx
git commit -m "feat: DataTable card view on tablet + generic stacked-card fallback"
```

---

## Task 2: Modal — bottom-sheet on phone

**Files:**
- Modify: `src/components/ui/Modal.tsx`

- [ ] **Step 1: Edit the panel layout**

In `src/components/ui/Modal.tsx`, change the outer flex wrapper and panel classes.

Outer wrapper (currently `flex items-center justify-center`) → align to bottom on phone, center on `sm:`+:

```tsx
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
```

Panel `className` (currently `relative bg-surface border border-border rounded-2xl shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto`):

```tsx
        className={clsx(
          'relative bg-surface border border-border shadow-lg w-full overflow-y-auto',
          'rounded-t-2xl max-h-[92vh]',                 // phone: bottom sheet
          'sm:rounded-2xl sm:max-w-lg sm:mx-4 sm:max-h-[90vh]', // sm+: centered dialog
          className,
        )}
```

Body padding (currently `px-6 py-4`) → `px-4 py-4 sm:px-6`. Header padding (currently `px-6 py-4`) → `px-4 py-4 sm:px-6`.

- [ ] **Step 2: Verify in preview**

```
preview_list  → get serverId
preview_resize 360x780 → open any page with a modal (e.g. /staff, click New Staff) → preview_screenshot
```
Expected: modal sits flush to the bottom edge, full width, rounded top corners, close button reachable, content scrolls.
Then `preview_resize 768x1024` and `1280x800` → modal is a centered rounded dialog (`max-w-lg`).
Check `preview_console_logs level=error` → none.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/ui/Modal.tsx
git commit -m "feat: Modal renders as bottom sheet on phones"
```

---

## Task 3: PhDTracker — card renderer

**Files:**
- Modify: `src/pages/PhDTracker.tsx`

- [ ] **Step 1: Add the card renderer**

In `src/pages/PhDTracker.tsx`, immediately AFTER the `const columns = [ ... ];` array (ends ~line 153) and BEFORE `return (`, add:

```tsx
  const renderStudentCard = (s: PhDStudent) => {
    let variant: 'success' | 'warning' | 'info' | 'neutral' = 'neutral';
    if (s.CurrentStatus === 'Ongoing') variant = 'info';
    if (s.CurrentStatus === 'Thesis Submitted') variant = 'success';
    return (
      <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-text truncate" title={s.StudentName}>{s.StudentName}</h3>
            <div className="text-xs text-text-muted mt-0.5 truncate">{s.Specialization}</div>
          </div>
          <Badge variant={variant}>{s.CurrentStatus}</Badge>
        </div>
        <div className="text-xs italic text-text-muted line-clamp-2 mb-3" title={s.ThesisTitle}>
          "{s.ThesisTitle}"
        </div>
        <div className="pt-3 border-t border-border/50 text-xs text-text-muted space-y-1.5 mt-auto">
          <div className="flex items-center justify-between gap-2">
            <span>Enrollment</span>
            <span className="font-mono text-text">{s.EnrollmentNo}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Supervisor</span>
            <span className="text-text truncate max-w-[160px]" title={s.SupervisorName}>{s.SupervisorName}</span>
          </div>
        </div>
      </Card>
    );
  };
```

- [ ] **Step 2: Pass it to the DataTable**

In the same file, the DataTable (~lines 252–256) currently reads:

```tsx
              <DataTable
                data={filteredStudents}
                columns={columns}
                keyExtractor={(item) => item.EnrollmentNo}
              />
```

Change to:

```tsx
              <DataTable
                data={filteredStudents}
                columns={columns}
                keyExtractor={(item) => item.EnrollmentNo}
                renderGridItem={renderStudentCard}
              />
```

- [ ] **Step 3: Confirm imports**

`Card` and `Badge` must be imported from `../components/ui/Cards`. `Badge` is already used in `columns`; confirm `Card` is imported (it wraps the table at line 251). If `Card` is not in the import line, add it. No other new imports (`PhDStudent` type already used).

- [ ] **Step 4: Verify in preview + typecheck**

```
preview_resize 768x1024 → navigate /phd → preview_screenshot
```
Expected: PhD list shows a 2-column grid of student cards by default; list/grid toggle present; flipping to list shows the table.
`preview_resize 360x780` → single-column cards, no horizontal scroll.
`preview_resize 1280x800` → defaults to the table (cardMode false).
`npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PhDTracker.tsx
git commit -m "feat: PhD tracker card view on phone/tablet"
```

---

## Task 4: Proposals — card renderer

**Files:**
- Modify: `src/pages/proposals/Proposals.tsx`

- [ ] **Step 1: Add the card renderer**

In `src/pages/proposals/Proposals.tsx`, add this function inside the component, before the `return (`:

```tsx
  const renderProposalCard = (p: Proposal) => (
    <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-text line-clamp-2" title={p.title}>{p.title}</h3>
          <div className="text-xs text-text-muted mt-0.5 font-mono">{p.proposalCode}</div>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[p.status]}>{STATUS_LABELS[p.status]}</Badge>
      </div>
      <div className="pt-3 border-t border-border/50 text-xs text-text-muted space-y-1.5 mt-auto">
        <div className="flex items-center justify-between gap-2">
          <span>PI</span>
          <span className="text-text truncate max-w-[160px]" title={p.piName}>{p.piName}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Budget</span>
          <span className="text-text">₹{p.requestedBudget.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Created</span>
          <span className="text-text">{new Date(p.createdAt).toLocaleDateString('en-IN')}</span>
        </div>
      </div>
    </Card>
  );
```

- [ ] **Step 2: Pass it to the DataTable**

The DataTable (~line 102) currently opens:

```tsx
        <DataTable<Proposal>
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/proposals/${p.id}`)}
          columns={[
```

Add the `renderGridItem` prop right after `onRowClick`:

```tsx
        <DataTable<Proposal>
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/proposals/${p.id}`)}
          renderGridItem={renderProposalCard}
          columns={[
```

- [ ] **Step 3: Confirm imports**

Ensure `Card` is imported from the UI Cards module (path used by this file for `Badge`/`StatCard`). `Badge`, `STATUS_BADGE_VARIANT`, `STATUS_LABELS`, and the `Proposal` type are already in scope (used in `columns`). Add `Card` to the existing import if missing.

- [ ] **Step 4: Verify in preview + typecheck**

```
preview_resize 768x1024 → navigate /proposals → preview_screenshot
```
Expected: 2-column proposal cards by default; toggle to list shows the table; status badges render.
`preview_resize 360x780` → single-column, no horizontal scroll.
`preview_resize 1280x800` → table by default.
`npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/proposals/Proposals.tsx
git commit -m "feat: proposals card view on phone/tablet"
```

---

## Task 5: Facilities — card renderer

**Files:**
- Modify: `src/pages/Facilities.tsx`

- [ ] **Step 1: Add the card renderer**

In `src/pages/Facilities.tsx`, after the `const columns = [ ... ];` array and before `return (`, add:

```tsx
  const renderEquipmentCard = (e: Equipment) => {
    let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
    if (e.WorkingStatus === 'Working') variant = 'success';
    else if (e.WorkingStatus === 'Under Maintenance') variant = 'warning';
    else variant = 'danger';
    return (
      <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-text truncate" title={e.Name}>{e.Name}</h3>
            <div className="text-xs text-text-muted mt-0.5 font-mono truncate">{e.instrument_code ?? e.UInsID}</div>
          </div>
          <Badge variant={variant}>{e.WorkingStatus}</Badge>
        </div>
        <div className="pt-3 border-t border-border/50 text-xs text-text-muted space-y-1.5 mt-auto">
          <div className="flex items-center justify-between gap-2">
            <span>Location</span>
            <span className="text-text truncate max-w-[160px]" title={e.Location}>{e.Location}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Division</span>
            <span className="text-[#c96442] font-bold uppercase">{e.Division}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>AMC End</span>
            <AmcBadge dateStr={e.amc_end_date} />
          </div>
        </div>
      </Card>
    );
  };
```

- [ ] **Step 2: Pass it to the DataTable**

The DataTable (~lines 354–358) currently reads:

```tsx
              <DataTable
                data={filteredEquipment}
                columns={columns}
                keyExtractor={item => item.UInsID}
              />
```

Change to:

```tsx
              <DataTable
                data={filteredEquipment}
                columns={columns}
                keyExtractor={item => item.UInsID}
                onRowClick={item => navigate(`/facilities/${item.UInsID}`)}
                renderGridItem={renderEquipmentCard}
              />
```

- [ ] **Step 3: Confirm imports**

`Card`, `Badge`, `AmcBadge`, and the `Equipment` type are already in scope (used in `columns`). Confirm `Card` is in the import line; add it if missing. `navigate` is already defined (used in the Instrument column).

- [ ] **Step 4: Verify in preview + typecheck**

```
preview_resize 768x1024 → navigate /facilities → preview_screenshot
```
Expected: 2-column instrument cards by default with status + AMC badges; tapping a card navigates to the instrument detail; toggle shows the table.
`preview_resize 360x780` → single-column, no horizontal scroll.
`preview_resize 1280x800` → table by default.
`npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Facilities.tsx
git commit -m "feat: facilities/instruments card view on phone/tablet"
```

---

## Task 6: Grid reflow sweep — priority pages

Fix fixed-column KPI/stat grids so they collapse on narrow widths. Tablet shows 2 columns, desktop returns to 4 (tablet = small desktop).

**Files (check each; edit only where a fixed `grid-cols-3`/`grid-cols-4` lacks responsive prefixes):**
- `src/pages/dashboards/*View.tsx` (all role dashboards)
- `src/pages/Calendar.tsx`
- `src/pages/Helpdesk.tsx`
- `src/pages/PhDTracker.tsx`, `src/pages/Facilities.tsx` (InsightsStrip already uses `lg:grid-cols-4`; verify only)

- [ ] **Step 1: Find offenders**

Run (Grep tool, not bash): pattern `grid-cols-(3|4)` across `src/pages/**/*.tsx`. For each hit, check whether it already has a smaller-breakpoint base (e.g. `grid-cols-2 sm:... lg:grid-cols-4`). Only the ones that jump straight to 3/4 columns with no base need fixing.

- [ ] **Step 2: Apply the reflow pattern**

For a 4-up KPI row, change:

```tsx
<div className="grid grid-cols-4 gap-4">
```
to:
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

For a 3-up row:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

Leave any grid that already has a responsive base untouched (DRY — don't churn correct code).

- [ ] **Step 3: Verify in preview**

For each edited page: `preview_resize 360`, `768`, `1280` → `preview_screenshot`. Expected: 360 → 1–2 columns, no overflow; 768 → 2 columns; 1280 → 4 columns. `preview_console_logs level=error` → none.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "fix: responsive KPI/stat grid reflow on priority pages"
```

---

## Task 7: Charts — responsive width

**Files:** any priority-page chart not already wrapped (check `src/pages/dashboards/*`, `src/pages/Calendar.tsx`; the `src/components/viz/*` mini-charts already use `ResponsiveContainer`).

- [ ] **Step 1: Find fixed-width charts**

Grep pattern `<(BarChart|LineChart|PieChart|AreaChart|ComposedChart)\b` and `width={` in `src/pages/**/*.tsx`. A chart with a numeric `width={NNN}` prop or no `ResponsiveContainer` ancestor needs fixing.

- [ ] **Step 2: Wrap in ResponsiveContainer**

Wrap the chart and give the parent a min height:

```tsx
<div className="w-full min-h-[240px]">
  <ResponsiveContainer width="100%" height={240}>
    {/* existing <BarChart>… without a fixed width prop */}
  </ResponsiveContainer>
</div>
```

Import `ResponsiveContainer` from `recharts` if not already imported. Remove any fixed `width={NNN}` on the chart element.

- [ ] **Step 3: Verify in preview**

Edited pages at 360 / 768 / 1280 → `preview_screenshot`. Expected: chart fills the column, no clipping or horizontal scroll. `preview_console_logs level=error` → none.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "fix: charts use ResponsiveContainer on priority pages"
```

---

## Task 8: PMS forms — single column on phone/tablet

**Files:** `src/pages/pms/*` (self-report + review forms). Edit only multi-column form rows that don't collapse.

- [ ] **Step 1: Find fixed multi-column form grids**

Grep `grid-cols-2` and `md:grid-cols` within `src/pages/pms/`. Identify form field rows laid out in 2+ columns with no narrow-width base.

- [ ] **Step 2: Collapse to single column under lg**

Change form-field rows to:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
```

Do NOT touch read-only summary grids that already fit. Per the spec, tablet keeps multi-column for general layout — but form *inputs* are the exception that gets single column under `lg:` to stay tappable.

- [ ] **Step 3: Verify in preview**

Navigate to a PMS self-report form. `preview_resize 360` and `768` → `preview_screenshot` + `preview_snapshot`. Expected: every field full-width and visible, labels above inputs, no horizontal scroll. Fill a field with `preview_fill` to confirm inputs are reachable. `1280` → two columns return.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "fix: PMS form fields stack to single column on small screens"
```

---

## Task 9: Touch targets + topbar at 360px

**Files:**
- `src/components/layout/Layout.tsx` (topbar)
- Any priority-page icon-only buttons with padding below `p-2.5`.

- [ ] **Step 1: Verify topbar at 360**

`preview_resize 360x780` → navigate to a page while signed in as a multi-role user → `preview_screenshot` of the topbar. Check: hamburger + title + search-icon + bell + role-switcher + avatar all fit with no overflow/wrap.

- [ ] **Step 2: Fix overflow if present**

If the topbar overflows at 360: the role-switcher already hides its label below `sm:` (`hidden sm:inline`) and search hides its label below `md:`. If still tight, reduce the topbar gap to `gap-1.5 md:gap-4` and ensure the title uses `truncate` (it already does). Apply only the minimal change that removes the overflow.

- [ ] **Step 3: Bump small icon-button tap targets**

For icon-only `<button>`s on priority pages with `p-1`/`p-1.5` (e.g. the edit buttons in table action columns), ensure at least a `p-2` / ~40px hit area on touch. Where a table action button is `p-1.5`, change to `p-2`. Keep visual icon size unchanged.

- [ ] **Step 4: Verify + typecheck**

`preview_resize 360` → topbar fits; tap targets feel ≥40px (visually check padding in `preview_screenshot`). `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: topbar fits 360px and icon buttons meet touch target size"
```

---

## Final verification

- [ ] `npx tsc --noEmit` → clean
- [ ] `npx eslint src/` → clean
- [ ] `npx vitest run` → all pass (incl. new DataTable test)
- [ ] Preview walk of all priority pages at 360 / 768 / 1024: no horizontal page scroll; lists show cards on phone/tablet; modals are bottom sheets on phone; forms stack; charts fill width.

---

## Self-review (done by plan author)

- **Spec coverage:** Unit 1 → Tasks 1–5 (DataTable + Modal + 3 card renderers). Unit 2 → Task 6. Unit 3 → Task 7. Unit 4 → Task 8. Unit 5 → Task 9. List-only-tables-as-cards-on-tablet decision → Tasks 1 + 3/4/5. All spec units mapped.
- **Type consistency:** `renderGridItem` signature matches `DataTableProps`; `Column<T>` shape (`header`/`cell`/`accessorKey`/`className`) used consistently in the generic fallback and the test; `cardMode`/`showGenericCards` named consistently across Task 1 steps.
- **Placeholder scan:** Tasks 6–9 are sweeps over a known file set with concrete before/after patterns and exact grep queries — no "TBD"; the only variability is which files match, which is the nature of a sweep.

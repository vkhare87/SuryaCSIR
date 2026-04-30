---
status: testing
phase: 04-analytics-cross-table-search
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-04-15T00:00:00.000Z
updated: 2026-04-15T00:00:00.000Z
---

## Current Test

number: 1
name: Director Dashboard — Institute KPI Cards
expected: |
  Log in as a Director. Open the Director dashboard.
  Five KPI cards should appear at the top: Total Staff, Active Projects, PhD Students, Equipment, and Scientific Outputs.
  All values should reflect real (or mock) data counts — not hardcoded zeros or placeholders.
awaiting: user response

## Tests

### 1. Director Dashboard — Institute KPI Cards
expected: |
  Log in as a Director. Open the Director dashboard.
  Five KPI cards should appear at the top: Total Staff, Active Projects, PhD Students, Equipment, and Scientific Outputs.
  All values should reflect real (or mock) data counts — not hardcoded zeros or placeholders.
result: [pending]

### 2. Director Dashboard — Division Comparison Chart
expected: |
  On the Director dashboard, below the KPI cards, a bar chart should compare all divisions.
  Each division has two bars: one terracotta (#c96442) for project count, one warm grey (#5e5d59) for scientific output count.
  Hovering a bar shows a tooltip with a parchment-toned background. No blue bars anywhere in the chart.
result: [pending]

### 3. Division Head Dashboard — Division-Scoped KPIs
expected: |
  Log in as a Division Head. Open the Division Head dashboard.
  Five KPI cards should show: Division Staff, Active Projects, PhD Supervisees, Outputs, Equipment — all scoped to that Division Head's division only.
  The dashboard header subtitle shows the divisionCode (e.g. "AES", "BPCS").
result: [pending]

### 4. Staff Portfolio Page — Cross-Table Aggregation
expected: |
  Navigate to a staff member's detail page (e.g. from the staff list, click a name).
  The page should show five stat cards: Projects, Supervised PhDs, Co-supervised PhDs, Publications, Equipment.
  Below, sections for Linked Projects, PhD Mentorship, IP Portfolio, and Assigned Equipment should each list relevant records.
  If the staff member has no associated records for a section, it shows an empty state — not an error.
result: [pending]

### 5. Staff Portfolio Page — Unknown ID Empty State
expected: |
  Navigate to /staff/nonexistent-id in the browser.
  The page should show a "Staff member not found" empty state message — no crash, no blank white screen.
result: [pending]

### 6. Command Palette — Cross-Table Search Results
expected: |
  Open the command palette (Ctrl+K or clicking the search icon in the nav).
  Type a name or keyword that appears in at least one entity type (e.g. a staff member's name).
  Results should appear grouped into sections — at minimum Staff and Projects if those match.
  If the keyword also matches PhD students, scientific outputs, IP intelligence, or equipment, those sections appear too.
  Each result shows the entity name and a short secondary detail.
result: [pending]

### 7. Command Palette — Navigation to Detail Pages
expected: |
  In the command palette, search for a staff member by name and click a staff result.
  The palette closes and you navigate to that staff member's /staff/:id detail page.
  Then open the palette again, type a project name, and click it — you navigate to /projects/:id.
  PhD, output, and IP results navigate to their respective list pages (/phd, /intelligence).
result: [pending]

### 8. Command Palette — Empty State Quick-Navigate Grid
expected: |
  Open the command palette without typing anything.
  The empty state should show six quick-navigate shortcut buttons: Staff, PhD, Projects, Outputs, IP, Equipment.
  Clicking one navigates to that entity's list page and closes the palette.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
skipped: 0
pending: 8

## Gaps

[none yet]

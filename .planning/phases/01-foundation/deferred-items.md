# Deferred Items — 01-foundation

## Pre-existing Build Errors (Out of Scope)

These were present before 01-04 execution and are not caused by this plan's changes:

1. **`src/pages/Facilities.tsx(180,71): TS2304 Cannot find name 'CalendarClock'`** — Missing icon import. The `CalendarClock` lucide-react icon is not imported. Two occurrences (lines 180, 220).

2. **`src/pages/IrinsSync.tsx(301,27): TS2322 Type 'unknown' not assignable to type 'ReactNode'`** — Type mismatch in JSX rendering. A variable with inferred type `unknown` is used as a ReactNode child.

These should be addressed in a future plan or bugfix PR.

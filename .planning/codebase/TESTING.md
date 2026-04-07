# Testing Patterns

_Last updated: 2026-04-07_

## Summary

There are no tests in this codebase. No testing framework is installed, no test scripts are defined, and no test files exist under `SuryaFD/src/`. The project is purely a working prototype with quality enforced only through TypeScript strict mode and ESLint at build time.

---

## Current State

**No test runner.** `SuryaFD/package.json` defines only four scripts:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```
There is no `test`, `test:watch`, `test:coverage`, or `test:e2e` script.

**No testing libraries installed.** Neither `devDependencies` nor `dependencies` in `package.json` contain any of: Vitest, Jest, Testing Library, Playwright, Cypress, or any assertion/mock library.

**No test files.** A glob search for `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` in `SuryaFD/src/` returns zero results. Test files found under `SuryaFD/node_modules/` belong to the `zod` package (a transitive dependency) — not application tests.

**No test configuration.** There are no `vitest.config.*`, `jest.config.*`, or `playwright.config.*` files.

---

## Static Analysis (Current Quality Gates)

The only automated quality checks that run are:

**TypeScript compilation** (`npm run build` → `tsc -b`):
- `strict: true` — enables all strict type checks
- `noUnusedLocals: true` — errors on unused variables
- `noUnusedParameters: true` — errors on unused function parameters
- `noFallthroughCasesInSwitch: true`
- `verbatimModuleSyntax: true` — enforces `import type` for type-only imports
- Target: `ES2023`

**ESLint** (`npm run lint`):
- `@eslint/js` recommended rules
- `typescript-eslint` recommended rules
- `eslint-plugin-react-hooks` — enforces Rules of Hooks
- `eslint-plugin-react-refresh` — prevents non-component default exports in Vite HMR

---

## Coverage Gaps

Every part of the application is untested. The highest-risk areas without any automated coverage:

**`src/utils/dataMigration.ts`**
- `parseFile()` — parses `.xlsx`, `.xls`, and `.csv` files into structured data. Column normalization logic in `formatData()` is complex (schema maps, allowed-column filtering, Excel date conversion). Bugs here silently corrupt data before it reaches Supabase.
- `pushToSupabase()` — batched upsert logic. Error handling returns `false` but callers may not surface this to the user.

**`src/utils/dateUtils.ts`**
- `parseDate()` — handles three date formats (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD). The retirement forecaster, project end alerts, and tenure alerts all depend on this. A regex bug silently returns `null` and hides records from dashboard widgets.
- `staffNameMatchesAuthor()` — fuzzy name matching for linking publications to staff. Logic is non-trivial and has edge cases for abbreviated names.
- `getRetirementDate()` — sets retirement at age 60, last day of retirement month. Policy changes would require updating this.

**`src/utils/dataMapper.ts`**
- All six mapper functions (`mapDivisionRow`, `mapStaffRow`, etc.) use `||` chains to handle both camelCase and snake_case column names from Supabase. Incorrect fallback logic would silently produce empty strings in UI fields.

**`src/contexts/AuthContext.tsx`**
- `hasPermission()` — role hierarchy logic (`MasterAdmin > Admin > User`). If this is wrong, users can access restricted pages.
- `login()` — hardcoded credentials; future Supabase auth integration untested.

**`src/contexts/DataContext.tsx`**
- Dual-mode loading logic (Supabase vs. mock fallback). The `isProvisioned()` branch switch is not exercised in any automated way.

**All page components**
- No rendering tests, no interaction tests, no snapshot tests.
- Filtering logic in `HumanCapital.tsx`, `Projects.tsx` etc. is pure `useMemo` — easily unit-testable but currently not.

---

## Recommended Testing Strategy

When tests are added, the recommended approach is:

### Framework

**Vitest** is the natural choice — it integrates directly with the existing Vite build config, requires minimal setup, and is compatible with the ESM module format the project uses.

Install:
```bash
cd SuryaFD
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Add to `package.json`:
```json
"scripts": {
  "test": "vitest",
  "test:watch": "vitest --watch",
  "test:coverage": "vitest --coverage"
}
```

Add to `vite.config.ts` (or `vitest.config.ts`):
```typescript
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  globals: true,
}
```

### File Organization

Co-locate test files with source files. Name tests `[module].test.ts` or `[Component].test.tsx`:

```
src/
├── utils/
│   ├── dateUtils.ts
│   ├── dateUtils.test.ts       ← unit tests for pure functions
│   ├── dataMapper.ts
│   ├── dataMapper.test.ts
│   └── dataMigration.test.ts
├── components/
│   └── ui/
│       ├── Button.tsx
│       ├── Button.test.tsx     ← component render tests
│       └── DataTable.test.tsx
└── contexts/
    ├── AuthContext.tsx
    └── AuthContext.test.tsx    ← hook tests with renderHook
```

### Priority Order

1. **`src/utils/dateUtils.ts`** — pure functions, no DOM or React dependencies. Highest value per effort. Test every date format, null inputs, edge cases at retirement boundary, fuzzy name matching logic.

2. **`src/utils/dataMapper.ts`** — pure transform functions. Test that camelCase and snake_case column names both map correctly, that missing fields default to `''` not `undefined`.

3. **`src/utils/dataMigration.ts`** — test `formatData()` directly (the pure part). The file I/O in `parseFile()` can be tested with mock `File` objects.

4. **`src/contexts/AuthContext.tsx`** — test `hasPermission()` role logic and login success/failure with `renderHook` from Testing Library.

5. **`src/components/ui/`** — smoke render tests for `Button`, `Card`, `DataTable`. Verify variants render without crashing and that `onRowClick` fires.

### Mock Strategy

- Mock `src/utils/supabaseClient.ts` at the module level in tests that touch `DataContext` — `vi.mock('../utils/supabaseClient', () => ({ supabase: null, isProvisioned: () => false }))`
- Do not mock `dateUtils.ts` or `dataMapper.ts` — they are pure and should be tested directly
- Use the existing `src/utils/mockData.ts` as the source of test fixtures for integration-level tests

---

## Notes

The `zod` library appears in `node_modules` (likely a transitive dependency of `@supabase/supabase-js`) but is not used directly in application code and should not be treated as an available validation tool without explicit installation as a direct dependency.

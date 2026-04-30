# /lint-fix

Run ESLint with auto-fix and report what remains.

## What this does

1. Runs `npm run lint -- --fix` from repo root.
2. Re-runs `npm run lint` to capture unfixable errors.
3. Reports:
   - Files changed by auto-fix (list)
   - Remaining errors with file:line references
   - Suggested next steps for unfixable items

## Common unfixable patterns in this repo

- `react-hooks/exhaustive-deps`: usually intentional (infinite-loop prevention). Check the comment — if `// eslint-disable-next-line` is absent, add the dep or the disable.
- `@typescript-eslint/no-explicit-any`: in `dataMigration.ts` and `dataMapper.ts` this is intentional (raw row shapes). Add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining why.
- `react-refresh/only-export-components`: expected at top of every context file. Suppress with `/* eslint-disable react-refresh/only-export-components */`.

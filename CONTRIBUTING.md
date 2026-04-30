# Contributing to SURYA

## Branches

- `main` — production-ready only
- Feature work: `feat/<name>` or `fix/<name>` off `main`
- PR to `main` after lint + build pass

## Commit style

Conventional Commits:

```
feat: add vacancy management page
fix: correct retirement date calculation for leap years
refactor: extract PMS scoring logic into lib/pms/scoring.ts
db: add calendar_events migration
docs: update DATA-MODEL with new table
```

Subject ≤ 72 chars. Body only when the *why* isn't obvious from the subject.

## Adding a database migration

1. **Never edit** `supabase/migrations/00000000000000_init.sql`.
2. Create `supabase/migrations/YYYYMMDDHHMMSS_description.sql`.
3. Every new table: `CREATE TABLE IF NOT EXISTS`, `ENABLE ROW LEVEL SECURITY`, at least one SELECT policy.
4. Use `public.user_has_role()` and `pms_is_admin()` in policies — no inline subqueries.
5. Update `docs/DATA-MODEL.md` to document new entities.

## Adding a page

1. `src/pages/<PageName>.tsx` — `export default function`
2. Register route in `src/App.tsx`
3. Add nav item in `src/components/layout/Layout.tsx` `NAV_ITEMS` (with `role` guard)
4. Data via `useData()` only — never call Supabase directly from a page

## Code conventions

See [CLAUDE.md](CLAUDE.md) for the full rules. Short version:

- TypeScript strict — no `any` outside `dataMigration.ts` / `dataMapper.ts`
- `import type` for type-only imports (`verbatimModuleSyntax` is on)
- Named exports for UI components and hooks; default export for pages
- Tailwind semantic tokens only (`bg-surface` not `bg-white`)
- `useMemo` for all computed data in pages

## Updating CLAUDE.md

When conventions change — new pattern adopted, new gotcha discovered, new package added — update `CLAUDE.md`. It is read by every Claude Code session and is the authoritative source of project rules.

## Before pushing

```bash
npm run lint
npm run build
```

Both must pass. No `--no-verify` bypasses.

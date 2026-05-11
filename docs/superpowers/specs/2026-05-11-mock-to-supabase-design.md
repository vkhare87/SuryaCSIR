# Sub-project B — Mock data → Supabase

> Move all demo data into Supabase. Kill the mock fallback path. Replace it with
> proper empty-state UI when tables are empty.
>
> Part of the three-part request: **B (data) → C (CRUD audit) → A (clickable
> KPIs)**. This spec covers B only.

---

## Goal

After this work:

1. Every list page renders from Supabase. No code path can render `mockData.ts`
   rows.
2. A fresh `supabase db reset` followed by `seed.sql` produces a working demo
   account with realistic data across every section.
3. When a table is empty, the page shows an empty-state card with an "Upload via
   Data Management" CTA (or section-appropriate equivalent), not a blank screen.
4. `mockData.ts` and `pmsMockData.ts` are deleted from the repo.

Non-goals (deferred to C and A):
- Verifying CRUD UI exists for every entity (sub-project C).
- Making KPI tiles clickable (sub-project A).
- Adding any new domain entity that doesn't already have a Supabase table.

## Current state (verified 2026-05-11)

- `DataContext` already fetches all 19 entity collections from Supabase (see
  [src/contexts/DataContext.tsx:171-225](../../../src/contexts/DataContext.tsx)).
- `useMock` branch fires only when (a) backend not provisioned, or (b) the
  signed-in user is the `dev-admin` bypass identity (only available when
  `import.meta.env.DEV && VITE_DEV_LOGIN === '1'`).
- Calendar (`meetings`, `actionItems`), Recruitment (`vacancyAdvertisements`,
  `vacancyPosts`), `scientificOutputs`, `ipIntelligence`, Committees, Helpdesk
  tickets — **all already Supabase-wired**. CLAUDE.md's "Known Tech Debt"
  section overstates the gap; this spec corrects that.
- `supabase/seed.sql` currently contains only the SystemAdmin bootstrap (12
  INSERTs). No demo HR data.
- `mockData.ts` = 1170 lines of TS object literals covering every entity.
- `pmsMockData.ts` = 289 lines; PMS demo data referenced from PMS pages directly
  (separate from `DataContext`).

## Approach — phased two-PR (Approach 2 locked)

### PR-B1 — seed expansion (additive only)

**Authoring strategy** — the seed is *generated*, then committed as a plain SQL
file. The generator is throwaway.

1. Write `scripts/generate-seed.ts` (node-runnable, dev-only). It:
   - Imports the existing `mockData.ts` and `pmsMockData.ts`.
   - Reuses the inverse of `dataMapper.ts` (or in-place inline transforms) to
     produce row objects in DB shape.
   - Emits a single `supabase/seed.demo.sql` block per entity, in dependency
     order (divisions → staff → projects → project_staff → phd_students →
     equipment → labs → scientific_outputs → ip_intelligence → contract_staff →
     vacancy_advertisements → vacancy_posts → committees → committee_members →
     meetings → agenda_items → action_items → meeting_documents → tickets →
     ticket_responses → ticket_events → pms_cycles → pms_collegiums →
     pms_reports → …).
   - Uses `INSERT ... ON CONFLICT DO NOTHING` so re-runs are idempotent.
2. Append the generated block to `supabase/seed.sql` under a clear
   `-- ============ DEMO SEED (generated) ============` divider.
3. Delete `scripts/generate-seed.ts` from the repo after first successful run.
   (Or commit it under `scripts/` and add a `npm run seed:gen` shortcut — pick
   one in the implementation plan.)
4. Verify: run `supabase db reset` locally, log in as a seeded user, confirm
   every page renders Supabase rows.

**Touches only**:
- `supabase/seed.sql` (extended)
- `scripts/generate-seed.ts` (new, may or may not be retained)
- `package.json` (only if retaining the generator)

**Does not touch**: `DataContext.tsx`, `mockData.ts`, any page component.

**Revert path**: `git revert` the PR. Old seed restored, app still works because
mock fallback still exists.

### PR-B2 — kill mock fallback + empty-state UI

1. **Remove mock branch** in `src/contexts/DataContext.tsx`:
   - Delete the `useMock` boolean and the `else` branch (`L226-247`).
   - Replace with: if `!provisioned || !supabase`, set every entity to `[]` and
     set `error` to "Backend not configured". Pages will render empty states.
   - Remove the `dev-admin` bypass *for data only*. The auth bypass itself
     (Login page) stays — it's a separate concern. Document this in the
     `AuthContext` comment.
2. **Drop mock imports** from `DataContext.tsx`. Resulting diff shrinks the
   bundle.
3. **Delete `src/utils/mockData.ts`** and `src/utils/pmsMockData.ts`. Update
   any remaining references (grep for `mockStaff`, `mockProjects`, etc.) to
   either use `useData()` or be deleted if dead.
4. **Empty-state UI**: introduce a single shared component
   `src/components/ui/EmptyState.tsx` with this signature:
   ```typescript
   interface EmptyStateProps {
     icon?: LucideIcon;
     title: string;
     description?: string;
     action?: { label: string; to: string };
   }
   ```
   Use semantic tokens (`bg-surface`, `text-text-muted`, `border-border`) per
   project rules. Render at module-level in each list page when the array is
   empty *and* `!isLoading`.
5. **Wire empty states** into each list page (one render conditional each):
   - `HumanCapital.tsx` → "No staff records — upload via Data Management" →
     route `/data` (HRAdmin+ only; lower roles see no CTA).
   - `Projects.tsx` → "No projects — upload via Data Management".
   - `PhDTracker.tsx` → "No PhD students — upload via Data Management".
   - `Divisions.tsx` → "No divisions — contact your administrator".
   - `Facilities.tsx` → "No equipment registered — upload via Data Management".
   - `Intelligence.tsx` (`scientificOutputs` + `ipIntelligence`) → per-chart
     empty card.
   - `Calendar.tsx` → "No meetings or action items — create one from the
     Committees workspace".
   - `Recruitment.tsx` → "No vacancies — create one" (HRAdmin+ button) /
     "No active recruitment drives" (everyone else).
   - PMS pages out of scope; PMS uses its own data path.

**Touches**:
- `src/contexts/DataContext.tsx` (mock branch removed)
- `src/components/ui/EmptyState.tsx` (new)
- ~8 page files (one conditional each)
- `src/utils/mockData.ts` (deleted)
- `src/utils/pmsMockData.ts` (deleted)
- `src/contexts/AuthContext.tsx` (comment update for dev-admin scope change)

**Revert path**: `git revert`. Empty-state component stays as dead code; mock
files come back. Acceptable.

## Data flow (after PR-B2)

```
[Supabase tables]
       │
       ▼
[DataContext.loadData] ── error? ──► setError(msg); setX([]) for all entities
       │ ok                              │
       ▼                                 ▼
[setX(rows.map(mapper))]         [Page renders EmptyState]
       │
       ▼
[Page renders list]   ── len 0 ──► [EmptyState with role-gated CTA]
```

No conditional mock branch. One path. Either data or empty state.

## Error handling

- Fetch error → existing `error` state caught + surfaced. Pages should display
  an error banner if `error` is set (existing behaviour, already implemented in
  `HumanCapital`; verify rest as part of PR-B2).
- Empty result → `EmptyState`. Not an error.
- Backend not provisioned → `EmptyState` with "Backend not configured. Go to
  Setup." CTA → routes to `/setup`. (Currently `ProtectedRoute` redirects to
  `/setup` when not provisioned + not authenticated, so this only fires for
  authenticated users on a backend that lost provisioning mid-session — rare.)

## Testing

- **PR-B1**: `supabase db reset && psql -f supabase/seed.sql`. Open app in
  Vite dev. Each page should render rows. Match counts vs the old mock
  fallback by toggling off `VITE_SUPABASE_URL` and noting the old screens, then
  re-enabling.
- **PR-B2**: with backend configured + seeded → identical to PR-B1.
  Without backend (clear env vars) → app shows Setup wizard, then if forced
  past setup with broken backend, every page shows EmptyState. No JS errors.
  Existing tests (`vitest`) must still pass. Add one test:
  `EmptyState.test.tsx` verifying role-gated CTA.

## Risks

| Risk | Mitigation |
|------|------------|
| Generated seed has FK violations (staff references nonexistent division) | Generator must emit in topological order. Add `ON CONFLICT DO NOTHING` only on parent inserts; let child INSERTs hard-fail in dev so we catch ordering bugs early. |
| Demo seed runs in production by accident | `seed.sql` is dev-only by convention. Document this explicitly in seed file header. Production deploys run migrations only, not seed. |
| `dev-admin` bypass users rely on mock data | Only used for local UI work. Acceptable break. Local dev should set up Supabase or rely on the empty-state path. |
| Generator breaks if mock shapes drift before PR-B1 lands | Generator is throwaway. Run it once, commit output, move on. |
| 1170-line mock file → equally large seed | Acceptable. Seed is committed once and rarely edited. |

## Open questions (resolve before implementation)

1. Retain `scripts/generate-seed.ts` long-term, or delete after first run?
   *Default: delete. Resurrect from git history if shape changes.*
2. Should PR-B1 also seed PMS demo data (`pmsMockData.ts`)?
   *Default: yes. Same PR.*
3. Empty-state CTA roles — gate by `useAuth().hasPermission()` or always show?
   *Default: gate. Scientists shouldn't see "Upload data" for staff.*

## Out of scope (covered by sibling specs)

- Sub-project C — CRUD audit across HR/PMS/auth.
- Sub-project A — clickable KPI tiles routing to sections.

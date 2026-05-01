# SURYA — Claude Operating Manual

> Single source of truth for working on this repo. Project rules + stack + folder map + conventions.

---

## Project

**SURYA** = institutional management + analytics dashboard for **CSIR-AMPRI** (CSIR research institute, Bhopal).
Two halves of the same app:

1. **HR analytics & data ops** — staff, divisions, projects, PhD students, equipment, scientific outputs, IP. Excel/CSV upload pipeline with cleaning UI.
2. **PMS (Performance Management System)** — multi-stage scientist appraisal: scientist self-report → collegium evaluation → chairman review → empowered committee final score.

Every staff member logs in and sees their role-scoped slice of the institute.

**User roles** (composite — a user can hold multiple, with one `active_role` driving the current dashboard):
`Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `Student`, `ProjectStaff`, `Guest`, `DefaultUser`, `EmpoweredCommittee`.

---

## Stack

- **React 19** + **TypeScript 5.9** (strict, `verbatimModuleSyntax`)
- **Vite 8** bundler, **Tailwind CSS 4** (via `@tailwindcss/vite` — no `tailwind.config.js`)
- **React Router 7** with `HashRouter` (static-host friendly)
- **Supabase** (`@supabase/supabase-js`) — PostgreSQL + Auth + RLS
- **ReCharts** (charts), **framer-motion** (transitions), **lucide-react** (icons), **clsx** + **tailwind-merge** (class composition)
- **@react-pdf/renderer** (PDF export), **xlsx** + **papaparse** (file parsing), **zod** (validation)
- **ESLint 9** flat config (typescript-eslint + react-hooks). No Prettier.

---

## Folder Map

```
/
├── CLAUDE.md, README.md, CONTRIBUTING.md
├── .env.example, .gitignore
├── package.json, vite.config.ts, tsconfig*.json, eslint.config.js, index.html
├── src/                  Application source (see "Where things live")
├── supabase/
│   ├── migrations/       Single consolidated init.sql; never edit it — add new timestamped files
│   └── seed.sql          Bootstrap data (first SystemAdmin)
├── docs/                 Architecture / Stack / Structure / Data Model
└── .claude/              Project-scoped agents, commands, skills
```

---

## Where Things Live

| Need | Path |
|------|------|
| New page/route | `src/pages/<Page>.tsx`, register in `src/App.tsx`, add nav in `src/components/layout/Layout.tsx` `NAV_ITEMS` |
| PMS page | `src/pages/pms/<Page>.tsx` |
| Role dashboard | `src/pages/dashboards/<Role>View.tsx` |
| Shared UI primitive | `src/components/ui/<Name>.tsx` |
| Layout chrome | `src/components/layout/Layout.tsx` |
| PMS feature component | `src/components/pms/<Name>.tsx` |
| Modal/overlay (top-level) | `src/components/<Name>.tsx` |
| Context | `src/contexts/<Name>Context.tsx` (provider + `use<Name>` hook in same file) |
| PMS business logic | `src/lib/pms/{constants,permissions,scoring,validation}.ts` |
| Domain types | `src/types/index.ts` (single barrel) |
| Pure utility | `src/utils/<name>.ts` (camelCase) |
| Mock data | `src/utils/mockData.ts` |
| Supabase client | `src/utils/supabaseClient.ts` (module-level singleton) |
| New Supabase entity | type → `src/types/index.ts`; mock → `mockData.ts`; mapper → `dataMapper.ts`; load → `DataContext.tsx`; upload → `dataMigration.ts` |
| New migration | `supabase/migrations/<TS>_<name>.sql` (timestamp `YYYYMMDDHHMMSS`) — never edit `00000000000000_init.sql` |

---

## Coding Rules

### TypeScript

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` all on.
- `interface` for object shapes (entities, props, context types). `type` for unions and aliases.
- `import type { ... }` mandatory for type-only imports (`verbatimModuleSyntax`).
- `any` only in mapper / migration boundary layers (`dataMapper.ts`, `dataMigration.ts`). Never in UI/hooks.
- Generics on reusable data components (see `DataTable<T>`).
- Non-null assertion `!` only at root mount (`main.tsx`).

### React

- Function components only. No class components.
- **Pages** → `export default function`. **UI primitives, contexts, providers, hooks** → named export.
- **Context pattern** (used by every context):
  ```typescript
  const FooContext = createContext<FooContextType | undefined>(undefined);
  export function useFoo() {
    const ctx = useContext(FooContext);
    if (ctx === undefined) throw new Error('useFoo must be used within a FooProvider');
    return ctx;
  }
  ```
- `useMemo` for **all** derived/computed data in pages (filter + aggregate). This is the primary perf pattern.
- `useState(() => localStorage.getItem(...))` lazy initializer for persisted state.
- `useEffect` with cleanup for event listeners.
- Pages consume data via `useData()` only — **never** call Supabase directly from a page.
- ESLint disables: `react-refresh/only-export-components` (top of context files), `react-hooks/exhaustive-deps` (only when omission is intentional and infinite-loop preventing).

### Naming

- Files: pages/components `PascalCase.tsx`; contexts `PascalCaseContext.tsx`; utils `camelCase.ts`; types `index.ts`.
- Components & types: `PascalCase`. Hooks: `use` + `PascalCase`. Vars/functions: `camelCase`. Module constants: `SCREAMING_SNAKE_CASE`.
- **Entity field names match Excel/Supabase casing** — HR tables use quoted CamelCase (`StaffMember.ID`, `StaffMember.DOJ`, `DivisionInfo.divCode`). PMS tables use snake_case (`pms_reports.scientist_id`). This split is intentional — the HR schema mirrors source Excel headers; PMS is fresh.

### Imports

Order (not enforced — observed pattern):
1. React + third-party (`react`, `lucide-react`, `clsx`, `motion`, `recharts`)
2. Internal contexts (`../contexts/AuthContext`)
3. Internal components (`../components/ui/Cards`)
4. Internal utils (`../utils/dateUtils`)
5. Internal types (`../types`)

No path aliases. Always relative imports.

### Styling

- Tailwind CSS 4 only. No CSS modules, no styled-components, no inline `style={{}}` except for dynamic numeric values.
- `clsx` for conditional class composition. `tailwind-merge` available but not yet in active use.
- **Always use semantic token classes**: `bg-surface`, `text-text-muted`, `border-border`, `text-brand-blue`. **Never** raw color: `bg-white`, `text-gray-500`, `text-blue-700`. Raw hex only in `index.css` and chart `fill` props.
- Theme via class on `<html>` (`light` / `dark`). Density via `data-density` attribute on `<html>`.
- Animations: `framer-motion` (`<motion.div>`, `<AnimatePresence>`).

### Error Handling

- Async data loading: `try / catch` with `console.error`, fall back to empty arrays. (Note: surfacing errors to UI is open tech debt — see Tech Debt below.)
- File parsing (`parseFile`): never reject; resolve `{ success: false, error: string }`.
- Detail pages: not-found inline UI + back button when route param doesn't match.
- Form errors: `useState('')` + render in JSX. No global error boundary exists.

### Comments

- Default: write none. Code self-documents.
- JSDoc only on utility functions in `utils/` (e.g. `parseDate`, `staffNameMatchesAuthor`). Not on components or hooks.
- `// --- N. Section Name ---` dividers in long pages.
- `// TODO:` for planned work. `// Hardcoded ... for now` for temporary impls.

---

## Database

- **One source of truth**: `supabase/migrations/00000000000000_init.sql` (HR + PMS + Auth/RBAC + RLS in one file).
- **Apply**: Supabase CLI `supabase db reset` against a clean project, or paste into Supabase SQL Editor as `postgres` role (bypasses RLS).
- **Bootstrap user**: run `supabase/seed.sql` after — creates first SystemAdmin (replace placeholders).
- **Add new migration**: new timestamped file alongside init. Never edit init.
- **RLS is mandatory** on every table. New tables ship with RLS enabled and an explicit policy block.
- **Auth source of truth**: Supabase Auth. App roles live in `user_roles` (composite PK `(user_id, role)`). Active role + flags live in `user_profiles`.
- **Auto-register**: on every `auth.users` INSERT, trigger creates `DefaultUser` row in `user_roles` and `user_profiles` row.
- **HR tables**: quoted CamelCase columns (`"divCode"`, `"StaffName"`) — mirrors Excel.
- **PMS tables**: snake_case (`scientist_id`, `cycle_id`).
- **PMS state machine** (in `pms_reports.status`): `DRAFT → SUBMITTED → UNDER_COLLEGIUM_REVIEW → CHAIRMAN_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`. Transitions are atomic via SECURITY DEFINER RPCs (`pms_submit_report`, `pms_assign_evaluators`, `pms_save_chairman_review`, `pms_finalize_report`). Never patch `status` directly from the client.

---

## Do / Don't

**Do**
- Use `useData()` from pages, never Supabase directly.
- Wrap all derived data in `useMemo`.
- Use semantic Tailwind tokens, not raw colors.
- Add new entities through the 5-file dance: type → mock → mapper → context → migration uploader.
- Validate session via `supabase.auth.getSession()` — not `localStorage`.
- Enable RLS on every new table from the first migration.

**Don't**
- Don't store role decisions in `localStorage` (spoofable).
- Don't edit `00000000000000_init.sql` once shipped — add a new timestamped migration.
- Don't drive PMS status transitions from the client — call the RPC.
- Don't introduce `BrowserRouter` — `HashRouter` is intentional for static hosting.
- Don't add `tailwind.config.js` — Tailwind 4 config lives in `vite.config.ts` + CSS variables in `src/index.css`.
- Don't commit `.env`, `dist/`, or `node_modules/`.

---

## Scripts

```bash
npm install        # one-time + after dep changes
npm run dev        # Vite dev server with HMR
npm run lint       # eslint
npm run build      # tsc -b && vite build → dist/
npm run preview    # preview prod build
```

---

## Environment

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Set in `.env` at repo root. The Setup Wizard fallback writes them to `localStorage` (`surya_supabase_url`, `surya_supabase_anon_key`) — acceptable for dev, deprecated for prod.

---

## .claude/

| Folder | Contents |
|--------|----------|
| `.claude/agents/` | `supabase-migrator`, `pms-feature-builder`, `ui-component-author` |
| `.claude/commands/` | `/new-migration`, `/add-page`, `/lint-fix` |
| `.claude/skills/` | `pms-data-model`, `supabase-rls-patterns`, `ui-design-system` |

Read the relevant `.claude/skills/*` before working on PMS, RLS, or new UI primitives.

---

## Known Tech Debt

- **HR column casing**: `"divCode"`, `"DOJ"`, `"CompletioDate"` (typo) etc. — quoted CamelCase, mirrors source Excel. Renaming to snake_case is a coordinated DB-migration + code-change task; out of scope for now.
- **`scientificOutputs` / `ipIntelligence`**: Supabase tables exist but `DataContext` still falls back to mock for these. Wire-up pending.
- **Calendar / Recruitment**: hardcoded sample data, no Supabase backing.
- **No tests**: zero test files in `src/`. `dateUtils.ts` and `dataMigration.ts` are highest-priority unit-test candidates.
- **No error boundary** and `DataContext` swallows fetch errors silently.
- **Hardcoded auth fallback** in `AuthContext` predates real Supabase Auth — expected to be removed once Supabase Auth is fully wired.
- **`dist/build artifacts`** were tracked in early commits (now cleaned).

---

*Refresh this doc when conventions shift. It is read by every Claude session.*

---

## gstack

Use /browse for all web browsing  
Never use mcp__claude-in-chrome__ tools  

Available skills:
- /office-hours
- /plan-ceo-review
- /plan-eng-review
- /plan-design-review
- /review
- /qa
- /ship
- /browse
- /design-review
- /retro
- /investigate
- /learn

---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

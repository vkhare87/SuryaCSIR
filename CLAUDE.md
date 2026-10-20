# SURYA — Claude Operating Manual

> Single source of truth for working on this repo. Project rules + stack + folder map + conventions.

---

## Project

**SURYA** = institutional management + analytics dashboard for **CSIR-AMPRI** (CSIR research institute, Bhopal).
Two halves of the same app:

1. **HR analytics & data ops** — staff, divisions, projects, PhD students, equipment, scientific outputs, IP. Excel/CSV upload pipeline with cleaning UI.
2. **PMS (Performance Management System)** — multi-stage scientist appraisal: scientist self-report → Evaluation Committee (tiers I/II/III) → Empowered Committee final score, with a grievance/representation path. Three tracks: `STANDARD` (Sci B–F), `ANNEXURE_I` (Chief/Outstanding/Distinguished Scientist), `ANNEXURE_II` (Director).

Every staff member logs in and sees their role-scoped slice of the institute.

**User roles** (composite — a user can hold multiple, with one `active_role` driving the current dashboard):
`Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `Student`, `ProjectStaff`, `Guest`, `DefaultUser`, `EmpoweredCommittee`.

---

## Design System

Always read [DESIGN.md](DESIGN.md) before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval. In QA/design-review mode, flag
any code that doesn't match DESIGN.md.

---

## Folder Map

**`docs/` is foldered by purpose** — index at `docs/README.md`:

| Folder | Holds | Authoritative about the system? |
|---|---|---|
| `docs/engineering/` | The system as built | **Yes.** If code disagrees, the doc is a bug |
| `docs/roadmap/` | `ROADMAP.md` (20 work packages), `VISION-ARCHITECTURE.md`, `sources/` | No — intent |
| `docs/operations/` | RAG setup tutorial, evaluation protocol | For running it |
| `docs/project/` | Dissertation / viva artifacts | Records of that phase only |
| `docs/history/` | Design records for shipped work | The *why*, not the *what* |

**Engineering suite** — read the relevant one before working in that area:

| Doc | Owns |
|---|---|
| `docs/engineering/app.md` | Product spec — vision, differentiator, phases, non-goals |
| `docs/engineering/architecture_addendum.md` | Architecture, layers, folder map, security, extension points |
| `docs/engineering/system_design.md` | Flows, all state machines, deployment, failure/scaling |
| `docs/engineering/api_spec.md` | PostgREST + every RPC signature + Ask SURYA HTTP endpoints |
| `docs/engineering/database_design.md` | All 65 tables, ER diagrams, indexes, migrations, retention |
| `docs/engineering/development_guide.md` | Setup, branching, testing, commits, PR checklist, debugging |
| `docs/engineering/coding_standards.md` | Expanded TS / Python / SQL conventions |
| `docs/engineering/FEATURES.md` · `STACK.md` | Feature catalogue · versions |

`docs/ARCHITECTURE.md`, `docs/STRUCTURE.md`, `docs/DATA-MODEL.md` stay at the old paths as
redirect stubs only.

**Planning new work?** `docs/roadmap/ROADMAP.md` is the single merged plan — every proposal
in the repo, grouped into work packages with dependencies and original item IDs preserved.
Add a new proposal to `docs/roadmap/sources/` and index it there; do not start a new
top-level plan document.

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
| File upload (any module) | register in unified registry via `src/lib/documents/registry.ts` (`documents` table = RAG ingest queue; see `docs/history/OVERHAUL-PLAN.md` T1) |
| Page access roles | `src/constants/access.ts` `ACCESS_MAP` — single source for nav + route guards |
| Domain types | `src/types/index.ts` (single barrel) |
| Pure utility | `src/utils/<name>.ts` (camelCase) |
| Mock data | `src/utils/mockData.ts` |
| Supabase client | `src/utils/supabaseClient.ts` (module-level singleton) |
| New Supabase entity | type → `src/types/index.ts`; mock → `mockData.ts`; mapper → `dataMapper.ts`; load → `DataContext.tsx`; upload → `dataMigration.ts` |
| New migration | `supabase/migrations/<TS>_<name>.sql` (timestamp `YYYYMMDDHHMMSS`, after the 8-file baseline) — never edit a shipped baseline file |
| Bootstrap data (app needs it to run) | `supabase/seed/<NN>_<name>.sql` |
| Demo / sample data (dev only) | `supabase/mock/<NN>_<name>.sql` |

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

- **Source of truth**: `supabase/migrations/` — an 8-file domain baseline (`20260712000001`…`20260712000008`: extensions/helpers, auth_rbac, hr_core, pms, committees_helpdesk, proposals_reports, calendar_recruitment, rag_documents). Pre-2026-07-12 history lives in `supabase/migrations_archive/` (reference only, not applied anywhere — see its README).
- **Apply**: `supabase db push` (CLI, tracks what's applied — the only sanctioned path). `supabase db reset` for a full local rebuild. Never paste SQL into the Dashboard SQL Editor — that's exactly how the live project silently drifted from the repo before the 2026-07-12 restructure.
- **Bootstrap data**: run `supabase/seed/*.sql` after the schema — creates helpdesk routing defaults + an OPEN appraisal cycle. First SystemAdmin is created via Dashboard → Authentication → Users, then promoted (see `supabase/ops/README.md`).
- **Add new migration**: new timestamped file after stage 08. Never edit a shipped baseline file.
- **RLS is mandatory** on every table. New tables ship with RLS enabled and an explicit policy block.
- **Every `SECURITY DEFINER` function opens with an authorization block**, client-supplied actor ids must equal `auth.uid()::text`, and never add a blanket `GRANT ALL`. Details and the incidents behind them: `supabase/CLAUDE.md`.
- **Auth source of truth**: Supabase Auth. App roles live in `user_roles` (composite PK `(user_id, role)`). Active role + flags live in `user_profiles`.
- **Auto-register**: on every `auth.users` INSERT, trigger creates `DefaultUser` row in `user_roles` and `user_profiles` row.
- **HR tables**: quoted CamelCase columns (`"divCode"`, `"StaffName"`) — mirrors Excel.
- **PMS tables**: snake_case (`scientist_id`, `cycle_id`).
- **PMS state machine** (in `pms_reports.status`, 2026 guidelines): `DRAFT → SUBMITTED → UNDER_EVALUATION_COMMITTEE_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`, plus terminal `NOT_ASSESSED` (duty days < 90) and `FINALIZED ⇄ UNDER_GRIEVANCE_REVIEW` (representation within 15 days). Transitions are atomic via SECURITY DEFINER RPCs (`pms_submit_report`, `pms_assign_evaluators`, `pms_finalize_report`, `pms_mark_not_assessed`, `pms_record_non_submission`, `pms_submit_representation`, `pms_resolve_representation`). Scores are integers 0–100; absolute cycle lock after Nov 30. Never patch `status` directly from the client. See `.claude/skills/pms-data-model/SKILL.md`.

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
- Don't edit a shipped `supabase/migrations/` baseline file — add a new timestamped migration.
- Don't drive PMS status transitions from the client — call the RPC.
- Don't introduce `BrowserRouter` — `HashRouter` is intentional for static hosting.
- Don't add `tailwind.config.js` — Tailwind 4 config lives in `vite.config.ts` + CSS variables in `src/index.css`.
- Don't commit `.env`, `dist/`, or `node_modules/`.

---

## Environment

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` at repo root. The Setup Wizard fallback writes them to `localStorage` (`surya_supabase_url`, `surya_supabase_anon_key`) — acceptable for dev, deprecated for prod.

---

## Health Stack

- typecheck: `npm run build` — **`npx tsc --noEmit` passes vacuously** under the
  project-references layout, so it proves nothing. `npm run build` runs `tsc -b`.
- lint: `npm run lint` (`eslint .` — covers `scripts/` and configs too, not just `src/`)
- test: `npm test` — 66 files, 652 tests (as of 2026-08-08)
- python: `python -m pytest` in `rag/` and in `ingest/`
- policy audit: `python scripts/check_security_definer.py`

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

**Open:**
- **HR column casing**: `"divCode"`, `"DOJ"`, `"CompletioDate"` (typo) etc. — quoted CamelCase, mirrors source Excel. Renaming to snake_case is a coordinated DB-migration + code-change task; out of scope for now.
- **RAG production host not yet stood up.** The full loop *is* proven E2E — document row → worker → parse → PageIndex tree → `indexed` → Ask SURYA answers with a page-level citation, on real institute data (2026-08-05, `docs/project/VIVA-PLAN.md`). What remains is host provisioning: migrations applied, `SUPABASE_SERVICE_KEY`, native DLLs allowed past WDAC, and **a GPU** — CPU-only Ollama measured 3–4 min/question. Runbook: `deploy/README.md`.
- **M4b duplication precision below target** — 0.38–0.41 vs a 0.60 target (`rag/eval/eval_report.md`). Recall (0.90) and citation hit-rate (0.93–1.00) are met.

**Deferred:**
- Error-variant `<EmptyState>` rollout beyond Projects/HumanCapital/PhDTracker — apply per page as touched.
- Code-split admin-only routes (`/data`, `/pms/audit`, `/audit`) so non-admin sessions don't ship those bundles.

---

*Refresh this doc when conventions shift. It is read by every Claude session.*

---

## gstack

Use /browse for all web browsing  
Never use mcp__claude-in-chrome__ tools  

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

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

# SURYA — Folder & Source Structure Guide

A walkthrough of what lives where in this repo and **why** each piece sits at the level it does. Skim it first time, refer back when adding a new file and unsure where it belongs.

---

## 1. Root layout

```
/
├── .env / .env.example          environment config (secrets in .env, template in .env.example)
├── .github/                     CI workflows (build/lint/test on push)
├── .gitignore                   files git must ignore (node_modules, dist, .env, supabase/bundles)
├── .claude/                     project-scoped Claude Code agents/skills/commands
├── .planning/                   GSD planning artifacts (PROJECT.md, ROADMAP.md, phase dirs)
├── CLAUDE.md                    operating manual every Claude session reads
├── README.md                    human-facing project intro
├── docs/                        long-form architecture / stack / data model docs
├── scripts/                     standalone Node scripts (e.g. irins-sync cron job)
├── src/                         application source — React + TypeScript
├── supabase/                    database layer (migrations, seed, mock, ops)
├── dist/                        Vite production build output (gitignored)
├── node_modules/                npm install target (gitignored)
├── index.html                   Vite entry HTML — single mount point #root
├── package.json                 npm manifest + scripts (dev/build/lint/test)
├── package-lock.json            pinned dependency tree
├── tsconfig.json                root TS config — references the two configs below
├── tsconfig.app.json            TS config for application code under src/
├── tsconfig.node.json           TS config for Vite + tooling (Node-runtime files)
├── vite.config.ts               Vite bundler + Tailwind CSS 4 plugin config
└── eslint.config.js             ESLint 9 flat config (typescript-eslint + react-hooks)
```

### Why these files sit at the root

| File / dir         | Why it must be at the root                                                                 |
|--------------------|--------------------------------------------------------------------------------------------|
| `package.json`     | npm only resolves `node_modules/` and `scripts` when run from the directory containing it. |
| `package-lock.json`| Locked alongside `package.json` so `npm ci` is deterministic across machines.              |
| `tsconfig*.json`   | `tsc` walks up from the cwd; nested configs would need explicit `--project` flags everywhere. |
| `vite.config.ts`   | Vite expects its config beside `index.html` and `package.json`.                            |
| `index.html`       | Vite serves it as the dev-server root; `<script src="/src/main.tsx">` is resolved relative to it. |
| `eslint.config.js` | ESLint 9 flat config is discovered from cwd upward — must live at the project root.        |
| `.env`             | Vite only loads `.env*` files from the project root for `import.meta.env.VITE_*`.          |
| `.env.example`     | Copy-paste template — sits next to `.env` so it’s obvious what to fill in.                 |
| `.gitignore`       | Git only respects gitignore files relative to the repo root for top-level patterns.        |
| `.github/`         | GitHub Actions reads `.github/workflows/*.yml` only from the default branch root.          |
| `CLAUDE.md`        | Claude Code auto-loads it as the session's project instructions on every cwd-rooted launch. |
| `README.md`        | GitHub renders it as the project landing page when the repo is opened.                     |
| `dist/`            | Vite's default `build.outDir`. Kept at root because deploy adapters (Vercel/Netlify) look there. |
| `docs/`            | Hand-written long-form docs — separated from `src/` so they don't get bundled.             |
| `scripts/`         | Standalone Node scripts (`irins-sync.ts`) that run **outside** the Vite bundle.            |
| `supabase/`        | Mirrors the Supabase CLI conventions (`supabase/migrations`, `supabase/seed.sql`). The CLI hard-codes this path. |
| `.planning/`       | The Get-Shit-Done (GSD) workflow tools write artifacts here by convention.                 |
| `.claude/`         | Claude Code looks for project-scoped agents, skills, commands under this folder.           |

---

## 2. `src/` — application source

```
src/
├── main.tsx                   entry point — mounts <App /> into #root
├── App.tsx                    top-level router + provider tree
├── index.css                  Tailwind 4 directives + CSS custom properties (theme tokens)
├── vite-env.d.ts              Vite-injected types (import.meta.env, asset imports)
│
├── pages/                     route-level components (one per URL)
│   ├── Dashboard.tsx          /
│   ├── Login.tsx              /login
│   ├── DatabaseWizard.tsx     /setup — first-run Supabase config UI
│   ├── DataManagement.tsx     /data — Excel/CSV upload + clean pipeline (admin)
│   ├── Divisions.tsx, Projects.tsx, HumanCapital.tsx, …    HR analytics pages
│   ├── Facilities.tsx, InstrumentDetail.tsx                Equipment / labs
│   ├── Intelligence.tsx                                    Scientific outputs + IP
│   ├── Recruitment.tsx                                     Vacancies
│   ├── IrinsSync.tsx                                       IRINS scraper admin
│   ├── PhDTracker.tsx, StaffDetail.tsx, ProjectDetail.tsx  Detail screens
│   ├── ChangePassword.tsx, SetupWizard.tsx                 Onboarding flows
│   ├── dashboards/            one file per role — DirectorView, ScientistView, HRAdminView, …
│   ├── pms/                   Performance Management System pages (Reports, Cycles, …)
│   ├── committees/            Committees feature (CommitteeList, MeetingDetail, …)
│   └── helpdesk/              Helpdesk feature (TicketList, TicketDetail, TicketForm)
│
├── components/                reusable UI not tied to one route
│   ├── ui/                    primitives — Button, Card, Modal, DataTable, Skeleton, Toast, …
│   ├── layout/                Layout shell + NotificationBell (chrome around <Outlet />)
│   ├── pms/                   PMS-specific composites (ReportWizard, SectionForms, PDF)
│   ├── committees/            Committee feature components (KanbanBoard, AgendaEditor, …)
│   ├── ScientistProfile.tsx   reused across multiple staff/dashboard pages
│   ├── ErrorBoundary.tsx      wraps <App /> in main.tsx — last-resort UI for thrown errors
│   ├── CommandPalette.tsx, SettingsModal.tsx    global overlays mounted in App.tsx
│   └── *FormModal.tsx                            entity create/edit dialogs (Staff, Division, PhD, Project, Instrument)
│
├── contexts/                  React Contexts — one file per concern
│   ├── AuthContext.tsx        Supabase Auth session + role resolution
│   ├── DataContext.tsx        HR analytics data loader (single source of truth for pages)
│   ├── PMSContext.tsx         PMS reports + evaluations
│   ├── ThemeContext.tsx       light/dark, density toggle on <html>
│   ├── ToastContext.tsx       global toast queue
│   └── UIContext.tsx          CommandPalette open/close, transient UI state
│
├── lib/                       framework-agnostic business logic (no JSX, no Supabase imports in most files)
│   ├── pms/                   constants, permissions, scoring, validation — pure functions
│   ├── committees/            committee role permissions
│   ├── helpdesk/              routing rules, ticket RPC wrappers, status state machine
│   └── permissions/           generic canEdit() helper
│
├── constants/                 cross-cutting constants
│   └── roleRoutes.ts          role → default landing route map (used by Login + role-switcher)
│
├── types/                     TypeScript types
│   ├── index.ts               entity types (StaffMember, Project, Division, …) — single barrel
│   └── pms.ts                 PMS-specific union types (status, section keys, …)
│
├── utils/                     pure helpers + integration glue
│   ├── supabaseClient.ts      module-level singleton (createClient called once)
│   ├── dataMapper.ts          DB row → typed entity (handles HR CamelCase column oddities)
│   ├── dataMigration.ts       Excel/CSV → DB row + upload pipeline
│   ├── pmsMappers.ts          PMS row → typed entity
│   ├── dateUtils.ts           parseDate + format helpers (dateUtils.test.ts covers it)
│   ├── analytics.ts           tiny telemetry shim
│   └── logger.ts              wrap console with env-gated levels
│
└── test/
    └── setup.ts               vitest setup — jest-dom matchers, jsdom env
```

### Why this split

**`pages/` vs `components/`**
A `page` is anything wired into a React Router `<Route>`. It's a tree leaf for the URL. A `component` is anything reused across pages, or that doesn't deserve its own URL. The rule keeps routing predictable: if a screen has a URL, it lives under `pages/`.

**`components/ui/` vs the rest of `components/`**
`ui/` is the design system — `Button`, `Card`, `DataTable<T>`, `Modal`. Pure presentational, no domain knowledge. The other component folders (`pms/`, `committees/`, `layout/`) compose `ui/` primitives with feature-specific behavior. Keeping `ui/` isolated means a component there should be reusable across **any** feature — including features that don't exist yet.

**`contexts/` as a flat folder**
Every context follows the same pattern (Provider + `useFoo` hook in one file, undefined-check guard). Flat layout makes the inventory obvious; you can scan the folder and immediately see how many global concerns exist. Six is the cap before this becomes a smell.

**`lib/` vs `utils/`**
Both are pure-ish helpers. The distinction is **domain weight**:
- `lib/pms/scoring.ts` knows the appraisal score formula — domain logic, tested in isolation, drives behavior.
- `utils/dateUtils.ts` parses a string into a Date — generic helper, no domain.
Roughly: `lib/` is *business rules*, `utils/` is *plumbing*.

**`types/` as a single barrel**
`types/index.ts` exports every entity type from one file. Pages just write `import type { StaffMember, Project } from '../types'`. The single barrel keeps the import surface small and avoids the n×m import-path explosion you get when types are scattered.

**`constants/` only for cross-cutting tables**
Most constants live next to their feature (`lib/pms/constants.ts`, `lib/helpdesk/constants.ts`). The root `constants/` folder is reserved for things multiple features need — currently just `roleRoutes.ts`. Resist the urge to dump enums here; if only one feature uses it, it belongs in that feature's `lib/` folder.

**`pages/dashboards/`**
One file per role (`DirectorView.tsx`, `ScientistView.tsx`, etc.). The Dashboard route picks the right view based on the authenticated user's `active_role`. Splitting per role keeps each file focused; otherwise a single Dashboard.tsx grows into a 1500-line role-switch.

**`scripts/` (root, not `src/`)**
Files in `scripts/` run under plain Node (or `tsx`) — not Vite, not the browser. `irins-sync.ts` is a cron-style scraper. Keeping it outside `src/` means it's not in the production bundle and has its own `tsconfig.node.json` tooling profile.

---

## 3. Other notable directories

### `supabase/`

See `supabase/ops/README.md` for the full breakdown. In short:
- `migrations/` — schema only. Append new timestamped files; never edit shipped ones.
- `seed/` — bootstrap data the app *needs* to function (e.g. ticket routing categories).
- `mock/` — CSIR-AMPRI demo fixture. Dev only — never in prod.
- `ops/` — `wipe_data.sql` + apply-order README.
- `bundles/` — derived rollups; gitignored.

### `docs/`

Hand-written long-form documentation that's too verbose for `CLAUDE.md` or `README.md`:
- `ARCHITECTURE.md` — system diagram + boundary explanations.
- `STACK.md` — tech choices and trade-offs.
- `STRUCTURE.md` — older version of this document, kept for cross-reference.
- `DATA-MODEL.md` — entity relationships + HR-column-casing rationale.
- `superpowers/` — auxiliary planning artifacts from earlier iterations.

### `.planning/`

Get-Shit-Done workflow artifacts:
- `PROJECT.md` — locked project description.
- `ROADMAP.md` — phase breakdown with goals + requirements.
- `MILESTONES.md` — version history.
- `REQUIREMENTS.md` — REQ-ID registry.
- `STATE.md` — current status snapshot.
- `phases/` — per-phase plans, summaries, verifications.

### `.claude/`

Project-scoped Claude Code customizations:
- `agents/` — `supabase-migrator`, `pms-feature-builder`, `ui-component-author`.
- `commands/` — `/new-migration`, `/add-page`, `/lint-fix`.
- `skills/` — `pms-data-model`, `supabase-rls-patterns`, `ui-design-system`.
- `worktrees/` — temporary worktrees for parallel agent work.
- `settings.local.json` — per-user permission allowlist (gitignored content varies).

### `dist/` and `node_modules/`

Both gitignored. `dist/` is the Vite build output (`npm run build` → ~3.3MB raw / 993KB gzipped). `node_modules/` is the npm install target. Neither should ever be checked in.

---

## 4. Adding a new file — quick decision tree

```
Is it a URL route?                     → src/pages/<Page>.tsx (or pages/<feature>/)
Is it reused across pages?             → src/components/<Name>.tsx
Is it a generic UI primitive?          → src/components/ui/<Name>.tsx
Is it global state / cross-cutting?    → src/contexts/<Name>Context.tsx
Is it business logic, no JSX?          → src/lib/<feature>/<file>.ts
Is it a tiny generic helper?           → src/utils/<name>.ts
Is it a new entity type?               → add to src/types/index.ts
Is it a database change?               → supabase/migrations/<TS>_<name>.sql
Is it bootstrap data the app needs?    → supabase/seed/<NN>_<name>.sql
Is it demo data for dev only?          → supabase/mock/<NN>_<name>.sql
Does it run outside Vite (Node CLI)?   → scripts/<name>.ts
Is it a long-form design doc?          → docs/<NAME>.md
```

When in doubt, check `CLAUDE.md` → "Where Things Live" — it carries the same map in a tabular form.

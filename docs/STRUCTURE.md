# Codebase Structure
_Last updated: 2026-04-30 (post-hoist: SuryaFD/ → repo root)_

## Top-Level Layout

```
/
├── CLAUDE.md              Project rules for Claude (read first)
├── README.md              Setup guide
├── CONTRIBUTING.md        Dev conventions
├── .gitignore
├── .env.example
├── package.json           npm scripts: dev | build | lint | preview
├── package-lock.json
├── index.html             Vite entry point
├── vite.config.ts         Vite + React + Tailwind 4 plugin config
├── tsconfig.json          Project references root
├── tsconfig.app.json      App TypeScript config (strict)
├── tsconfig.node.json     Vite/Node TypeScript config
├── eslint.config.js       ESLint 9 flat config
├── src/                   All application source
├── supabase/
│   ├── migrations/        SQL migrations (ordered by timestamp)
│   └── seed.sql           Bootstrap first admin user
├── docs/                  Architecture, stack, structure, data model
└── .claude/               Project-scoped agents, commands, skills
```

---

## `src/` Directory

```
src/
├── main.tsx               React root — provider tree wrapping App
├── App.tsx                HashRouter, ProtectedRoute, all route declarations
├── index.css              Global CSS, Tailwind base, CSS custom properties
├── contexts/              React Context providers (one file = provider + hook)
├── pages/                 Route-level components
│   ├── dashboards/        Role-specific dashboard views (one per role)
│   └── pms/               PMS workflow pages
├── components/            Reusable UI
│   ├── layout/            App shell (sidebar + topbar)
│   ├── pms/               PMS-specific components
│   └── ui/                Shared primitives (Button, Cards, DataTable, Skeleton)
├── lib/
│   └── pms/               PMS business logic (constants, permissions, scoring, validation)
├── utils/                 Non-React helpers (no JSX, no hooks)
├── types/                 TypeScript interfaces and type aliases (single barrel index.ts)
└── constants/             App-wide constants
```

---

## `src/contexts/`

| File | Manages |
|------|---------|
| `AuthContext.tsx` | Supabase Auth session, multi-role, `hasPermission()` |
| `DataContext.tsx` | All domain entity arrays, dual-mode loading, `refreshData()` |
| `ThemeContext.tsx` | ThemeMode, UIDensity, localStorage sync |
| `UIContext.tsx` | DeviceType, breakpoints, ViewMode override |

All contexts: `createContext<T | undefined>(undefined)` + throwing `useX()` hook.

---

## `src/pages/`

```
pages/
├── Login.tsx              /login
├── SetupWizard.tsx        /setup
├── ChangePassword.tsx     /change-password
├── Dashboard.tsx          /
├── HumanCapital.tsx       /staff
├── StaffDetail.tsx        /staff/:id
├── Projects.tsx           /projects
├── ProjectDetail.tsx      /projects/:id
├── PhDTracker.tsx         /phd
├── Divisions.tsx          /divisions
├── Intelligence.tsx       /intelligence
├── Facilities.tsx         /facilities  (Admin+)
├── Recruitment.tsx        /recruitment (Admin+)
├── Calendar.tsx           /calendar
├── DataManagement.tsx     /data        (MasterAdmin)
├── dashboards/
│   ├── DirectorView.tsx
│   ├── DivisionHeadView.tsx
│   ├── HoDView.tsx
│   ├── ScientistView.tsx
│   ├── TechnicianView.tsx
│   ├── HRAdminView.tsx
│   ├── FinanceAdminView.tsx
│   ├── SystemAdminView.tsx
│   ├── MasterAdminView.tsx
│   ├── EmpoweredCommitteeView.tsx
│   ├── ProjectStaffView.tsx
│   ├── StudentView.tsx
│   ├── GuestView.tsx
│   ├── PendingAccessView.tsx
│   └── KpiCard.tsx
└── pms/
    ├── Index.tsx           /pms
    ├── Cycles.tsx          /pms/cycles
    ├── Reports.tsx         /pms/reports
    ├── ReportNew.tsx       /pms/reports/new
    ├── ReportEdit.tsx      /pms/reports/:id/edit
    ├── ReportView.tsx      /pms/reports/:id
    ├── EvaluatorQueue.tsx  /pms/evaluate
    ├── EvaluateReport.tsx  /pms/evaluate/:id
    ├── AssignEvaluators.tsx /pms/assign
    ├── ChairmanQueue.tsx   /pms/chairman
    ├── CommitteeQueue.tsx  /pms/committee
    ├── Collegiums.tsx      /pms/collegiums
    └── AuditLog.tsx        /pms/audit
```

---

## `src/components/`

```
components/
├── CommandPalette.tsx     Global search (Cmd+K)
├── SettingsModal.tsx      Theme + density settings
├── layout/
│   └── Layout.tsx         Sidebar, topbar, <Outlet>
├── pms/
│   ├── AnnexureUpload.tsx
│   ├── DynamicTable.tsx
│   ├── ReportPDF.tsx
│   ├── ReportWizard.tsx
│   ├── SectionForms.tsx
│   ├── SignatureUpload.tsx
│   ├── StatusBadge.tsx
│   └── WordCountTextarea.tsx
└── ui/
    ├── Button.tsx
    ├── Cards.tsx          Card, StatCard, Badge
    ├── DataTable.tsx      Generic sortable/filterable table
    └── Skeleton.tsx
```

---

## `src/utils/`

| File | Purpose |
|------|---------|
| `supabaseClient.ts` | Module-level Supabase singleton, `isProvisioned()`, `provisionDatabase()`, `wipeProvisioning()` |
| `dataMigration.ts` | `parseFile()`, `formatData()` with `SCHEMA_MAPS` + `ALLOWED_COLUMNS`, `pushToSupabase()` |
| `dataMapper.ts` | `mapDivisionRow()`, `mapStaffRow()`, `mapProjectRow()`, etc. — raw Supabase row → TypeScript type |
| `mockData.ts` | In-memory arrays for all entities (dev/demo fallback) |
| `dateUtils.ts` | `parseDate()`, `getRetirementDate()`, `isWithinMonths()`, `diffInDays()` |

---

## `src/types/index.ts`

All TypeScript interfaces in one barrel file:
`DivisionInfo`, `StaffMember`, `ProjectInfo`, `ProjectStaff`, `PhDStudent`, `Equipment`, `ScientificOutput`, `IPIntelligence`, `ContractStaff`, `VacancyAdvertisement`, `VacancyPost`, `Notification`, `UserAccount`, `Role`, `UIDensity`, `ThemeMode`.

---

## `supabase/migrations/`

```
supabase/migrations/
└── 00000000000000_init.sql   Consolidated schema: HR + PMS + Auth/RBAC + RLS
```

Never edit `00000000000000_init.sql` once deployed. New work = new timestamped file.

---

## Adding New Code — Cheatsheet

**New page/route:**
1. `src/pages/NewPage.tsx`
2. Route in `src/App.tsx` inside `<ProtectedRoute>`
3. Nav item in `Layout.tsx` `NAV_ITEMS`

**New shared UI component:**
- Primitive → `src/components/ui/`
- Overlay/modal → `src/components/`

**New domain entity (5-step dance):**
1. Interface in `src/types/index.ts`
2. Mock array in `src/utils/mockData.ts`
3. Mapper in `src/utils/dataMapper.ts`
4. State + fetch in `src/contexts/DataContext.tsx`
5. Migration column + `SCHEMA_MAPS`/`ALLOWED_COLUMNS` in `dataMigration.ts`

**New migration:**
`supabase/migrations/YYYYMMDDHHMMSS_description.sql`

# Codebase Structure
_Last updated: 2026-04-07_

## Summary

The repo is split into a React/TypeScript frontend (`SuryaFD/`) and a data directory (`Data/`) holding raw Excel/CSV source files. The frontend follows a flat, feature-implicit structure where pages, contexts, components, and utilities each occupy a dedicated top-level directory under `src/`. There is no feature-folder grouping.

---

## Top-Level Layout

```
D:/Claude/Surya/
├── SuryaFD/              # React/TypeScript/Vite frontend application
├── Data/                 # Raw Excel/CSV source data files
├── analyze_data.py       # One-off Python schema inspection script
├── analyze_data_json.py  # One-off Python schema inspection script (JSON output)
├── data_analysis_output.txt  # Output from analyze_data.py
├── schema_info.json      # Output from analyze_data_json.py
├── CLAUDE.md             # Claude Code project instructions
└── DESIGN.md             # Design notes/brief
```

---

## `Data/` Directory

Raw source files used for importing into Supabase via the DataManagement page.

```
Data/
├── AMPRI Master staff data.xls       # Permanent staff records
├── Scientist data.xlsx               # Scientist-specific subset
├── AcSIR Students Data_Updated-_Dec_2025.xlsx  # PhD student records
├── Projects_AMPRI.xlsx               # Project records
├── Project staff.xlsx                # Project-linked staff records
├── Equipment details.xlsx            # Equipment/facilities records
├── TEMPLATE_DIVISIONS.csv            # Division data template (CSV)
└── TEMPLATE_DIVISIONS.xlsx           # Division data template (XLSX)
```

These files are consumed by `SuryaFD/src/utils/dataMigration.ts` when uploaded through the DataManagement page.

---

## `SuryaFD/` Directory

```
SuryaFD/
├── src/                  # All application source code
├── public/               # Static assets served at root
├── dist/                 # Production build output (gitignored)
├── index.html            # Vite HTML entry point
├── package.json          # Dependencies and scripts
├── package-lock.json     # Lockfile
├── vite.config.ts        # Vite + React + Tailwind plugin config
├── tsconfig.json         # TypeScript project references root
├── tsconfig.app.json     # App-specific TypeScript config
├── tsconfig.node.json    # Node/Vite TypeScript config
├── eslint.config.js      # ESLint flat config
├── supabase_schema.sql   # Supabase table DDL reference
├── build_check.txt       # Build output log artifact
├── build_output.txt      # Build output log artifact
└── lint_output.txt       # Lint output log artifact
```

---

## `SuryaFD/src/` Directory

```
src/
├── main.tsx              # React root: provider tree wrapping App
├── App.tsx               # Router, ProtectedRoute, all route declarations
├── index.css             # Global CSS, Tailwind base, CSS variables
├── App.css               # Minimal app-level styles
├── contexts/             # React Context providers
├── pages/                # One file per route/page
├── components/           # Reusable UI components
├── utils/                # Non-UI logic, helpers, data utilities
├── types/                # TypeScript interfaces and type aliases
└── assets/               # Static assets (images, icons)
```

---

## `src/contexts/`

One file per context. Each file exports both the `Provider` component and the consuming hook.

```
contexts/
├── AuthContext.tsx    # Session, login, logout, role, hasPermission
├── DataContext.tsx    # All domain entities, dual-mode loading
├── ThemeContext.tsx   # Theme mode, UI density, localStorage sync
└── UIContext.tsx      # Responsive breakpoints, device type detection
```

**Pattern:** Every context throws if consumed outside its provider:
```typescript
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
```

---

## `src/pages/`

One file per application route. Pages are flat — no subdirectories (the `pms/` subdirectory exists but is empty).

```
pages/
├── Login.tsx           # Public: /login — authentication form
├── SetupWizard.tsx     # Public: /setup — Supabase provisioning form
├── Dashboard.tsx       # Protected: / — summary metrics, charts
├── HumanCapital.tsx    # Protected: /staff — staff list, filters
├── StaffDetail.tsx     # Protected: /staff/:id — individual staff profile
├── Projects.tsx        # Protected: /projects — project list
├── ProjectDetail.tsx   # Protected: /projects/:id — project profile
├── PhDTracker.tsx      # Protected: /phd — PhD student records
├── Divisions.tsx       # Protected: /divisions — division overview
├── Intelligence.tsx    # Protected: /intelligence — scientific outputs, IP
├── Facilities.tsx      # Protected: /facilities — equipment records (Admin+)
├── Recruitment.tsx     # Protected: /recruitment — recruitment tracking (Admin+)
├── Calendar.tsx        # Protected: /calendar — calendar view
├── DataManagement.tsx  # Protected: /data — file upload → Supabase (MasterAdmin)
└── pms/                # Empty directory (placeholder for future phase)
```

**Convention:** Pages use `export default function PageName()`. They consume data exclusively via `useData()` and never fetch directly from Supabase.

---

## `src/components/`

Organized by scope: `layout/` for structural chrome, `ui/` for shared primitives, and two root-level feature components.

```
components/
├── CommandPalette.tsx   # Global search overlay (Cmd+K)
├── SettingsModal.tsx    # Settings panel (theme, density)
├── layout/
│   └── Layout.tsx       # App shell: sidebar, topbar, <Outlet>
└── ui/
    ├── Button.tsx        # Button component
    ├── Cards.tsx         # Card, StatCard, Badge primitives
    ├── DataTable.tsx     # Sortable/filterable table component
    └── Skeleton.tsx      # Loading skeleton placeholder
```

---

## `src/utils/`

Non-React logic. No hooks or JSX.

```
utils/
├── supabaseClient.ts    # Supabase client singleton, isProvisioned(), provisionDatabase(), wipeProvisioning()
├── dataMigration.ts     # parseFile() for XLSX/CSV, formatData() with SCHEMA_MAPS + ALLOWED_COLUMNS, pushToSupabase()
├── dataMapper.ts        # mapDivisionRow(), mapStaffRow(), mapProjectRow(), etc. — Supabase row → TypeScript type
├── mockData.ts          # In-memory mock data arrays for all entities
└── dateUtils.ts         # parseDate(), getRetirementDate(), isWithinMonths(), diffInDays()
```

---

## `src/types/`

Single file containing all TypeScript interfaces and type aliases.

```
types/
└── index.ts    # DivisionInfo, StaffMember, ProjectInfo, ProjectStaff,
                # PhDStudent, Equipment, ScientificOutput, IPIntelligence,
                # Role, UserAccount, UIDensity, ThemeMode
```

All types are imported from `'../types'` (resolves to `types/index.ts`).

---

## Naming Conventions

**Files:**
- Pages: `PascalCase.tsx` — `HumanCapital.tsx`, `StaffDetail.tsx`
- Components: `PascalCase.tsx` — `Layout.tsx`, `DataTable.tsx`
- Contexts: `PascalCase` + `Context` suffix — `AuthContext.tsx`
- Utilities: `camelCase.ts` — `supabaseClient.ts`, `dataMigration.ts`, `dateUtils.ts`
- Types: `index.ts` (single barrel file)

**Exports:**
- Pages: `export default function PageName()`
- Context providers: named export `export function AuthProvider()`
- Context hooks: named export `export function useAuth()`
- Utilities: named exports only, no default exports

**Directories:**
- All lowercase: `contexts/`, `pages/`, `components/`, `utils/`, `types/`
- Subdirectories by scope: `components/layout/`, `components/ui/`

---

## Where to Add New Code

**New page/route:**
1. Create `SuryaFD/src/pages/NewPage.tsx`
2. Add route in `SuryaFD/src/App.tsx` inside the `<ProtectedRoute>` block
3. Add nav item in `SuryaFD/src/components/layout/Layout.tsx` `NAV_ITEMS` array with appropriate `role`

**New shared UI component:**
- Primitive (button, badge, card): `SuryaFD/src/components/ui/ComponentName.tsx`
- Structural (modal, overlay): `SuryaFD/src/components/ComponentName.tsx`

**New data entity:**
1. Add TypeScript interface to `SuryaFD/src/types/index.ts`
2. Add mock data array to `SuryaFD/src/utils/mockData.ts`
3. Add mapper function to `SuryaFD/src/utils/dataMapper.ts`
4. Add state + fetch logic to `SuryaFD/src/contexts/DataContext.tsx`
5. Expose from `DataContextType` interface and provider value
6. Add `ALLOWED_COLUMNS` and `SCHEMA_MAPS` entry to `SuryaFD/src/utils/dataMigration.ts`

**New utility function:**
- Date/time helpers: `SuryaFD/src/utils/dateUtils.ts`
- Data transformation: `SuryaFD/src/utils/dataMapper.ts` or a new `utils/` file

**New context:**
- Create `SuryaFD/src/contexts/NewContext.tsx` following the existing pattern
- Add provider to the nesting in `SuryaFD/src/main.tsx`

---

## Special Files

**`SuryaFD/supabase_schema.sql`:** Reference DDL for the Supabase tables. Not executed by the app — used manually to set up the remote database schema.

**`SuryaFD/src/utils/mockData.ts`:** The authoritative source of truth for data shape when Supabase is not provisioned. When adding new fields to a type, add them here too.

**`SuryaFD/index.html`:** Vite's HTML entry point. Mounts at `<div id="root">`.

**`SuryaFD/src/index.css`:** Defines all CSS custom properties (color tokens, spacing, shadows) used by Tailwind. Modifying theme colors happens here.

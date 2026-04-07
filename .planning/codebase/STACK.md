# Technology Stack

_Last updated: 2026-04-07_

## Summary

SURYA is a single-page React/TypeScript application bundled with Vite. The frontend runs entirely in the browser with no server-side rendering. A separate set of Python scripts (`analyze_data.py`, `analyze_data_json.py`) exist at the repo root for one-off data inspection tasks and are not part of the deployed application.

---

## Languages

**Primary:**
- TypeScript ~5.9.3 — all frontend source code in `SuryaFD/src/`
- TSX — React component files throughout `SuryaFD/src/components/`, `SuryaFD/src/pages/`, `SuryaFD/src/contexts/`

**Secondary:**
- Python 3.x (version not pinned) — one-off scripts `analyze_data.py`, `analyze_data_json.py` at repo root; not part of the built app
- SQL — `SuryaFD/supabase_schema.sql` for Supabase table definitions

---

## Runtime

**Environment:**
- Node.js v24.14.0 (detected in dev environment)
- Browser-only SPA (no Node.js at runtime — Vite produces static assets)

**Package Manager:**
- npm (lockfile: `SuryaFD/package-lock.json` — present)

---

## Frameworks

**Core UI:**
- React ^19.2.4 — component model and rendering (`react`, `react-dom`, `react-is`)
- React Router DOM ^7.13.1 — client-side routing via `HashRouter`; configured in `SuryaFD/src/App.tsx`

**Styling:**
- Tailwind CSS ^4.2.1 — utility-first CSS; integrated via the `@tailwindcss/vite` Vite plugin (no `tailwind.config.js` — config is in `vite.config.ts`)
- `tailwind-merge` ^3.5.0 — merges conflicting Tailwind class strings
- `clsx` ^2.1.1 — conditional className construction
- CSS variables — theme (light/dark/system) applied via `document.documentElement.classList` in `SuryaFD/src/contexts/ThemeContext.tsx`

**Data Visualization:**
- Recharts ^3.8.0 — chart components used on dashboard/analytics pages

**Animation:**
- `motion` ^12.36.0 — Framer Motion v12 (published as `motion` package)

**Icons:**
- `lucide-react` ^0.577.0 — SVG icon set

---

## Build Tools

**Bundler:**
- Vite ^8.0.0 — dev server with HMR and production build
- Config: `SuryaFD/vite.config.ts`
- Plugins: `@vitejs/plugin-react` ^6.0.0 (Babel-based Fast Refresh), `@tailwindcss/vite` ^4.2.1

**TypeScript Compiler:**
- `tsc` (via `typescript` ~5.9.3) — type-checking only; Vite handles transpilation
- Build command: `tsc -b && vite build` (defined in `SuryaFD/package.json`)
- Target: ES2023; module: ESNext; strict mode enabled
- Config files: `SuryaFD/tsconfig.json`, `SuryaFD/tsconfig.app.json`, `SuryaFD/tsconfig.node.json`

**Strict TypeScript settings (from `SuryaFD/tsconfig.app.json`):**
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `erasableSyntaxOnly: true`

---

## Development Tooling

**Linter:**
- ESLint ^9.39.4 — flat config format (`SuryaFD/eslint.config.js`)
- Plugins: `eslint-plugin-react-hooks` ^7.0.1, `eslint-plugin-react-refresh` ^0.5.2
- TypeScript support: `typescript-eslint` ^8.56.1
- Command: `npm run lint` (from `SuryaFD/`)

**Formatter:**
- No Prettier or Biome detected — formatting not enforced by tooling

**Dev Server:**
- `npm run dev` — Vite dev server with HMR
- `npm run preview` — preview production build locally

---

## Key Runtime Libraries

**File Parsing:**
- `papaparse` ^5.5.3 — CSV parsing in browser (used in `SuryaFD/src/utils/dataMigration.ts`)
- `@types/papaparse` ^5.5.2 — type definitions (listed as a production dependency, not devDependency)
- `xlsx` ^0.18.5 — Excel `.xlsx`/`.xls` parsing in browser (used in `SuryaFD/src/utils/dataMigration.ts`)

**Database Client:**
- `@supabase/supabase-js` ^2.99.2 — Supabase client for database reads and upserts (used in `SuryaFD/src/utils/supabaseClient.ts`, `SuryaFD/src/utils/dataMigration.ts`)

---

## Python Scripts (Non-deployed)

Files: `analyze_data.py`, `analyze_data_json.py`

**Required packages (not in any package manifest — install manually):**
- `pandas` — DataFrame operations
- `openpyxl` — `.xlsx` engine for pandas
- `xlrd` — `.xls` engine for pandas

**Note:** Both scripts hardcode `data_dir = r"D:\Antigravity\Surya\Data"`. The path must be updated to `D:\Claude\Surya\Data` (or the local equivalent) before running.

---

## Configuration

**Environment variables (Vite — `VITE_` prefix required):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- A `.env` file is present at `SuryaFD/.env` (contents not read)
- Fallback: credentials can also be stored in `localStorage` keys `surya_supabase_url` and `surya_supabase_anon_key` (set by the in-app Setup Wizard)

**Build output:**
- `SuryaFD/dist/` — static files for deployment (HTML + JS + CSS bundles)

---

## Platform Requirements

**Development:**
- Node.js (v24.x in use; minimum not specified)
- npm
- Modern browser for preview

**Production:**
- Static file host (no server required — SPA with hash routing)
- Supabase project (optional; app runs on mock data without it)

---

*Stack analysis: 2026-04-07*

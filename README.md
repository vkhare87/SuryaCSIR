# SURYA — CSIR-AMPRI Management Dashboard

Institutional analytics + Performance Management System (PMS) for CSIR-AMPRI, a CSIR research institute.

- **HR analytics**: staff, divisions, projects, PhD students, equipment, scientific outputs, IP. Excel/CSV import with batch upsert.
- **PMS**: multi-stage scientist appraisal — self-report → collegium evaluation → chairman review → committee final score.

Every staff member logs in and sees a role-scoped dashboard.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Supabase · ReCharts · framer-motion

## Quickstart

```bash
# 1. Clone and install
git clone <repo-url>
cd surya
npm install

# 2. Configure Supabase
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Apply database schema (one-time, clean project)
# Paste supabase/migrations/00000000000000_init.sql into
# Supabase SQL Editor (run as postgres role), OR:
# supabase db reset  (if using Supabase CLI)

# 4. Create first admin user
# Edit supabase/seed.sql — replace REPLACE_WITH_* placeholders
# Run seed.sql in Supabase SQL Editor

# 5. Start dev server
npm run dev
```

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | TypeScript check + Vite production build → `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build locally |

## Project layout

```
/
├── src/               Application source (components, pages, contexts, utils, types)
├── supabase/
│   ├── migrations/    Database schema — one init file + timestamped additions
│   └── seed.sql       Bootstrap first admin user
├── docs/              Architecture, stack, data model reference
├── .claude/           Project agents, commands, skills
├── CLAUDE.md          Full project rules (read by Claude automatically)
└── .env.example       Required environment variables
```

See [CLAUDE.md](CLAUDE.md) for coding conventions, folder map, and do/don't rules.
See [docs/DATA-MODEL.md](docs/DATA-MODEL.md) for the full database schema reference.

## Roles

`Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `EmpoweredCommittee`, `ProjectStaff`, `Student`, `Guest`, `DefaultUser`

Each role sees a scoped dashboard on login. A user can hold multiple roles; active role drives the current view.

## Environment

The app runs in mock-data mode without Supabase credentials — useful for UI development. Set the env vars to switch to live data.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

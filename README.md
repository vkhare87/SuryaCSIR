# SURYA — CSIR-AMPRI Management Dashboard

Institutional analytics + Performance Management System (PMS) for CSIR-AMPRI, a CSIR research institute.

- **HR analytics**: staff, divisions, projects, PhD students, equipment, scientific outputs, IP. Excel/CSV import with batch upsert.
- **PMS**: multi-stage scientist appraisal — self-report → Evaluation Committee → Empowered Committee final score, with a grievance path. Three proforma tracks (Scientist B–F, senior scientists, Director).
- **Ask SURYA**: natural-language questions over institute documents and data, answered with citations by an on-premise model — or refused when the corpus does not support an answer.

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

# 3. Apply database schema (Supabase CLI is the only sanctioned path)
supabase link --project-ref <ref>
supabase db push        # applies supabase/migrations/* in order
supabase config push    # applies the [auth] block from supabase/config.toml

# 4. Bootstrap
# Run supabase/seed/*.sql, then create the first user via
# Dashboard -> Authentication -> Users and promote it per supabase/ops/README.md

# 5. Start dev server
npm run dev
```

Never paste SQL into the Dashboard SQL Editor — that is how the live project drifted from
the repo before the 2026-07-12 restructure.

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
├── src/               SPA source (pages, components, contexts, lib, utils, types)
├── rag/               Ask SURYA query API + ingestion worker (Python 3.12)
├── ingest/            Optional watched-folder / mail-in capture worker
├── supabase/
│   ├── migrations/    Schema — 8-file domain baseline + append-only additions
│   ├── seed/          Bootstrap data every environment needs
│   ├── mock/          Demo fixture (dev only)
│   ├── ops/           Runbooks and cleanup scripts
│   └── tests/         RLS policy suites (run by CI)
├── deploy/            Windows Server runbook, nginx.conf, env examples
├── docs/
│   ├── engineering/   The system as built — the verified reference
│   ├── roadmap/       Future work: ROADMAP.md, the vision, and the source proposals
│   ├── operations/    Running and measuring it
│   ├── project/       Dissertation / viva artifacts
│   └── history/       Design records for work already shipped
├── .claude/           Project agents, commands, skills
├── CLAUDE.md          Full project rules (read by Claude automatically)
└── .env.example       Required environment variables
```

## Documentation

**[docs/README.md](docs/README.md) is the full index.** `docs/engineering/` describes the
system as built; `docs/roadmap/` describes what might come next; nothing else is
authoritative about the system.

**Engineering suite** — start here:

| Doc | What it covers |
|---|---|
| [app.md](docs/engineering/app.md) | Product spec — vision, differentiator, phases, non-goals |
| [architecture_addendum.md](docs/engineering/architecture_addendum.md) | Architecture — principles, layers, folder map, security, extension points |
| [system_design.md](docs/engineering/system_design.md) | Flows, state machines, deployment, failure recovery, scaling |
| [api_spec.md](docs/engineering/api_spec.md) | All three API surfaces: PostgREST, RPCs, Ask SURYA HTTP |
| [database_design.md](docs/engineering/database_design.md) | All 65 tables, ER diagrams, indexes, migrations, retention |
| [development_guide.md](docs/engineering/development_guide.md) | Setup, branching, testing, commits, PR checklist, debugging |
| [coding_standards.md](docs/engineering/coding_standards.md) | TypeScript, Python, and SQL conventions |

**Reference:**

| Doc | What it covers |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Condensed project rules, read by every Claude session |
| [DESIGN.md](DESIGN.md) | Design system — read before any visual change |
| [docs/engineering/FEATURES.md](docs/engineering/FEATURES.md) | Every feature, who can use it, and how (routes + steps) |
| [docs/engineering/STACK.md](docs/engineering/STACK.md) | Versions and dependencies |
| [docs/roadmap/ROADMAP.md](docs/roadmap/ROADMAP.md) | Master roadmap — 20 work packages merged from every proposal |
| [docs/roadmap/VISION-ARCHITECTURE.md](docs/roadmap/VISION-ARCHITECTURE.md) | The north star: the institute record spine |
| [docs/operations/RAG-SETUP-TUTORIAL.md](docs/operations/RAG-SETUP-TUTORIAL.md) | Set up the PageIndex RAG stack from zero to a cited answer |
| [deploy/README.md](deploy/README.md) | Windows Server production deployment runbook |

## Roles

`Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `EmpoweredCommittee`, `ProjectStaff`, `Student`, `Guest`, `DefaultUser`

Each role sees a scoped dashboard on login. A user can hold multiple roles; active role drives the current view.

## Environment

The app runs in mock-data mode without Supabase credentials — useful for UI development. Set the env vars to switch to live data.

## Contributing

See [docs/development_guide.md](docs/engineering/development_guide.md) — setup, branching, testing
workflow, commit conventions, PR checklist, and Definition of Done.

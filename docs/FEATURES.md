# SURYA — Feature Reference

Complete reference of what the app does and how to use each feature. SURYA is the
institutional management and intelligence portal for CSIR-AMPRI: HR analytics + data
operations, a multi-stage Performance Management System (PMS), a unified document
registry, and an AI query layer (Ask SURYA) grounded in institute documents and data.

Every feature below lists **who** can use it (roles) and **how** (route + steps).
Role gating is enforced three ways: navigation, route guards (`src/constants/access.ts`
`ACCESS_MAP`), and Postgres Row-Level Security — RLS is the hard gate.

Related docs: [RAG-SETUP-TUTORIAL.md](RAG-SETUP-TUTORIAL.md) (set up the AI layer),
[DATA-MODEL.md](DATA-MODEL.md) (schema), [ARCHITECTURE.md](ARCHITECTURE.md),
[IMPROVEMENT-PROPOSALS.md](IMPROVEMENT-PROPOSALS.md) (planned upgrades).

---

## 1. Platform & Access

### Login, roles, and role switching
- **Who:** everyone. **Route:** `/login`.
- Supabase Auth (email + password). New sign-ups auto-register as `DefaultUser` and
  land on a pending-access view.
- A user can hold multiple roles (`user_roles` table); the **active role** drives the
  current dashboard and nav. Switch roles from the role switcher in the top layout bar.
- Roles: `Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`,
  `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `Student`, `ProjectStaff`, `Guest`,
  `DefaultUser`, `EmpoweredCommittee`.

### Access requests
- **Who:** new users request; `SystemAdmin`/`MasterAdmin` approve. **Route:** `/admin/access-requests`.
- A `DefaultUser` submits a role request from their pending view; admins approve or
  reject, which writes `user_roles`.

### Setup wizard & forced password change
- First-run Supabase credential wizard (dev convenience; `.env` is the production path).
- Admin-created accounts are forced through `/change-password` on first login.

### Command palette, theme, density
- `Ctrl+K` opens the command palette (navigate anywhere by name).
- Light/dark theme and UI density toggles live in the layout header; persisted per user.

---

## 2. Dashboards & My Actions

- **Who:** every role gets a scoped dashboard on `/` (e.g. `ScientistView`,
  `DirectorView` under `src/pages/dashboards/`).
- **My Actions inbox** sits at the top of each dashboard: pending PMS submissions or
  evaluations, proposal revisions requested, progress reports due, assigned committee
  action items, open helpdesk tickets, access requests (admins). Each item deep-links
  to the owning module.

---

## 3. HR Analytics & Data Operations

### Human Capital
- **Who:** Director, DivisionHead, HR/System/Master admins. **Routes:** `/staff`, `/staff/:id`, `/staff/analytics`.
- Staff roster with per-person detail (division, designation, expertise, reporting
  line) and analytics (headcount by division/category/gender, age & tenure profiles).

### Divisions
- **Route:** `/divisions` (Analytics tab on the page). Division registry + cross-division comparisons.

### Project staff & PhD scholars
- **Routes:** `/staff/project` (roster + embedded analytics), `/phd` (Analytics tab).
- PhD tracker includes **milestone tracking** (coursework → synopsis → thesis defence)
  with due dates, completion flags, and overdue detection. Students see their own slice.

### Recruitment
- **Who:** HR admins. **Route:** `/recruitment` (Analytics tab).
- Vacancy advertisements and posts, plus a **recruitment drive funnel**: stage-wise
  progress (advertised → screening → interview → offer → joined), permanent vs
  project-staff split.

### Data Management (the data backbone)
- **Who:** System/Master/HR admins. **Route:** `/data`.
- Excel/CSV upload with column mapping, validation, and a cleaning UI; Manage Records
  CRUD for every entity. This is how institutional data enters SURYA.
- **How:** `/data` → pick entity → upload file → review detected column mappings →
  fix flagged rows → import. Entity field names intentionally mirror Excel headers.

### IRINS sync
- **Route:** `/irins-sync`; CLI `npm run sync:irins`.
- Mirrors publications/patents/awards metadata from the IRINS research profile system
  (metadata only — full-text PDFs are uploaded by authors, see Documents).

---

## 4. Research Operations

### Projects
- **Routes:** `/projects`, `/projects/:id` (Analytics tab on the list page).
- Project registry (fund type, sponsor, sanctioned vs utilized cost, PI, division,
  status) with analytics.

### Proposals (full lifecycle state machine)
- **Who:** Scientists draft; review chain up to Director. **Route:** `/proposals`.
- `DRAFT → SUBMITTED → … → OM_ISSUED → LINKED` (linked = becomes a project). PDF
  uploads up to 25 MB. Transitions run through RPCs — status is never patched from
  the client.
- **Duplication check:** on a proposal's detail page, "Check for similar work" queries
  the document index for prior/ongoing work similar to the proposal topic and lists
  matches with page-level citations (`/similar` endpoint).
- **Comparable past projects:** the same page ranks completed projects similar in
  domain/division/fund-type, with sanctioned/utilized amounts — evidence for evaluation.

### Project progress reports
- **Routes:** `/reports`, `/reports/new`, `/reports/:id`.
- `project_reports` with `DRAFT → SUBMITTED → REVIEWED`; due dates auto-scheduled when
  a proposal links to a project; HOD/DivisionHead review. Submitted PDFs file into the
  document registry.

### Facilities & instruments
- **Who:** Technicians (scoped), admins. **Routes:** `/facilities`, `/facilities/:uInsID` (Analytics tab).
- Instrument registry, AMC (maintenance contract) tracking with due alerts.

### Partnerships (MOUs & technology transfer)
- **Route:** `/partnerships`. Two tabs:
  - **MOUs** — partner, purpose, validity, status; expiry alerts (90-day window).
  - **Tech transfers** — licensee, agreement type, value (₹ lakhs), status; feeds
    commercialisation analytics.
- Admin entry forms on the same page.

### R&D lifecycle monitor
- **Route:** `/rnd-monitor`. End-to-end view from proposal conceptualisation →
  sanction → project execution → progress reporting, per project.

---

## 5. Governance

### PMS — Performance Management System
- **Who:** Scientists (self-report), collegium evaluators, chairman, Empowered
  Committee, admins. **Routes:** under `/pms`.
- State machine: `DRAFT → SUBMITTED → UNDER_COLLEGIUM_REVIEW → CHAIRMAN_REVIEW →
  EMPOWERED_COMMITTEE_REVIEW → FINALIZED`. All transitions via SECURITY DEFINER RPCs.
- **How (scientist):** `/pms/reports/new` → 13-section wizard → annexure uploads →
  signature → submit. Track status at `/pms/reports/:id`; export PDF when finalized.
- **How (evaluator/chairman/EC):** role-specific queues at `/pms/evaluate`,
  `/pms/chairman`, `/pms/committee`. Admins manage cycles (`/pms/cycles`), collegiums
  (`/pms/collegiums`), evaluator assignment (`/pms/assign`), and the audit log
  (`/pms/audit`).

### Committees
- **Route:** `/committees`. Meetings, agendas, minutes (lockable), document uploads,
  and an action-item kanban. Action items land in assignees' My Actions.

### Helpdesk
- **Who:** all roles. **Route:** `/helpdesk`. Ticket creation, category routing to the
  owning team, status tracking, analytics for admins.

### Calendar
- **Route:** `/calendar`. Events derived from meetings/action items + institute
  holidays (admin-managed).

### Audit log
- **Route:** `/pms/audit` (data admins). PMS actions plus an "All" tab merging
  HR-data changes and PMS events into one timeline with source badges.

---

## 6. Intelligence & Analytics

### Intelligence page
- **Route:** `/intelligence`. Scientific outputs (publications) and IP registry
  (patents/copyrights/designs) plus derived analytics:
  - **Commercialisation strip** — granted patents (licensable assets), filed patents,
    external/sponsored project count and value.
  - **Patent pipeline funnel** — filed → published → granted, median time-to-grant.
  - **Emerging themes** — keywords rising in recent project titles across ≥2 divisions
    (convergence detection).
  - **Collaboration analysis** — co-authorship pairs with cross-division flags
    (expertise mapping evidence).

### Entity analytics
- Staff, divisions, projects, project staff, PhD, recruitment, and facilities each
  carry an analytics view (ReCharts) — `/staff/analytics` standalone, the rest as an
  Analytics tab on the entity's own page. For cross-entity questions, use Ask SURYA
  instead — that is the design intent.

---

## 7. Ask SURYA — the AI query layer

- **Who:** any authenticated role; answers are scoped by RLS to what the caller may
  see. **Route:** `/ask`. Backend: `rag/` FastAPI service (`/query`, `/similar`).
- **How:** type a natural-language question → the router classifies it and picks one
  of three answer paths, shown as a badge on the answer:

| Mode | When | What you get |
|---|---|---|
| `structured` | Counts/sums/aggregates over database tables | A computed answer naming its source table |
| `document` | Content questions about reports/proposals/minutes | An answer built from indexed document sections, with page-level citations |
| `hybrid` | Needs both | Numbers first, then document evidence with citations |

- **Structured analytics available** (whitelisted functions — never free-form SQL):
  documents by ingestion status; projects by division (optional status filter);
  projects by status; sanctioned-vs-utilized expenditure + utilization % (optional
  division); patent pipeline counts; publications by division (optional year); staff
  by division; overdue PhD milestones; MOU status + 90-day expiry; tech-transfer
  totals.
- **Citations are clickable** — they open the source PDF at the cited page via a
  signed URL.
- **Grounding guarantee:** if the indexed documents don't contain the answer, SURYA
  replies "Not found in institute documents." — it never answers from outside
  knowledge, and every non-refusal document answer carries citations.
- **Feedback:** 👍/👎 on each answer is logged (`query_log`) with latency, powering the
  eval loop.

Example questions:
- "What is the total sanctioned cost versus utilized amount across all projects?"
- "What outcomes did the 2025 progress reports highlight?"
- "How many patents were granted, and which technologies do they cover?"

---

## 8. Documents & RAG operations

### Unified document registry
- One `documents` table + one storage convention for every module (proposals, PMS
  annexures, committee docs, progress reports, publications, CVs).
- Each document has an **access tier** — `institute` / `division` / `owner` /
  `confidential` — shown as a badge on document lists and enforced by RLS + storage
  policies.
- `ingest_status` (`pending → processing → indexed | failed | skipped`) doubles as the
  RAG ingestion queue: finishing a workflow files the artifact; the worker picks it up
  automatically. Users never "upload to the RAG".

### RAG admin console
- **Who:** SystemAdmin/MasterAdmin. **Route:** `/admin/rag`.
- Per-document ingestion status with retry, index freshness, and the query log
  (who asked what, which mode answered, latency, feedback).
- A document that parses to no text (scanned PDF with OCR disabled) is marked
  `failed` with an explanatory error rather than silently indexed empty.

Setting up the backend service: see [RAG-SETUP-TUTORIAL.md](RAG-SETUP-TUTORIAL.md).
Production deployment: see [`deploy/README.md`](../deploy/README.md).

---

## 9. Scripts & health

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run test` | SPA tests (vitest) |
| `npm run lint` | ESLint |
| `npm run sync:irins` | IRINS metadata sync |
| `python -m pytest` (in `rag/`) | RAG service tests (offline by default) |
| `python eval/run_eval.py` (in `rag/`) | Router accuracy + citation hit-rate eval |

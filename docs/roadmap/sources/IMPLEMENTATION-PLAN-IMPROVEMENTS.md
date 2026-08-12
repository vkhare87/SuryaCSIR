# Phased Implementation Plan — SURYA Improvements

> **Source document for [ROADMAP.md](../ROADMAP.md).** This brief carries the implementation detail;
> the roadmap says which work package it belongs to and what it depends on. Item IDs here
> are the ones the roadmap references. Status lines below may predate the roadmap — check
> there first.


**Source of truth for proposals:** [improvement-proposals-grok.md](improvement-proposals-grok.md)  
**Goal:** Ship high-value navigation, accessibility, on-prem readiness, and operational hardening in ordered phases without breaking RLS, HashRouter, or service-key isolation.

---

## Principles (all phases)

1. **DB is the fortress** — no security logic moved into the SPA; RLS + RPCs stay authoritative.  
2. **Surgical diffs** — touch only what the phase needs; match existing conventions (`ACCESS_MAP`, semantic tokens, contexts).  
3. **Verify before “done”** — lint, typecheck, relevant tests; for deploy phases, preflight + smoke.  
4. **No premature rewrites** — no BrowserRouter, no NL→SQL, no service key in rag-api.  
5. **Two tracks can run in parallel** after Phase 0:
   - **Track A — Product UX** (nav, a11y, inbox, dossiers)  
   - **Track B — On-prem / platform** (nginx, healthz, config, backups, scans)  

---

## Phase overview

| Phase | Name | Track | Est. effort | Depends on |
|------:|------|-------|-------------|------------|
| 0 | Foundations & shared primitives | A+B | 3–5 days | — |
| 1 | Navigation hub (⌘K + breadcrumbs) | A | 1–2 weeks | 0 |
| 2 | Unified Inbox + role home v1 | A | 1–2 weeks | 0–1 |
| 3 | Accessibility baseline | A | 1–2 weeks | 0 (overlaps 1–2) |
| 4 | Findability (URL filters + dossiers) | A | 1–2 weeks | 1 |
| 5 | On-prem platform hardenin | B | 1–2 weeks | 0 |
| 6 | Config lock + observability | B | 1 week | 5 |
| 7 | Performance & data loading | A+B | 1–2 weeks | 2, 4 optional |
| 8 | Contextual intelligence | A | 1–2 weeks | 4, 5 (health) |
| 9 | Domain UX polish | A | 1–2 weeks | 2 |
| 10 | Staging go-live gate | B | ongoing | 5–6 |

**Recommended sequence for a single team:**  
`0 → 1 → 2 → 3` (user-facing value) **in parallel with** `5 → 6 → 10` (host readiness) → then `4 → 7 → 8 → 9`.

---

## Phase 0 — Foundations & shared primitives

**Goal:** Unblock every later phase with reusable UI and focus/a11y patterns; document phase checklist in-repo.

### Tasks

| ID | Task | Primary files / areas |
|----|------|------------------------|
| 0.1 | Shared **focus-visible** token (replace ad-hoc `#3898ec` rings over time; introduce utility class now) | `src/index.css`, `DESIGN.md` note if needed |
| 0.2 | Harden **Modal / Sheet** a11y: focus trap, Escape, restore focus, `aria-labelledby`, `role="dialog"` | `src/components/ui/Modal.tsx`, `Sheet.tsx` |
| 0.3 | **Skip link** + landmark structure on authenticated shell | `src/components/layout/Layout.tsx` (`<main id="main">`, skip link) |
| 0.4 | Sidebar `nav` `aria-label` | `Sidebar.tsx` |
| 0.5 | Add implementation checklist section to `docs/roadmap/sources/improvement-proposals-grok.md` or link this plan as `docs/roadmap/sources/IMPLEMENTATION-PLAN-IMPROVEMENTS.md` (copy of approved plan) | `docs/` |
| 0.6 | Baseline verification script note: `npm run lint`, `npm test`, `npx tsc --noEmit` | CI already exists |

### Acceptance criteria

- [ ] Tab order reaches main content via skip link  
- [ ] Opening/closing Modal restores focus to trigger  
- [ ] Escape closes Modal/Sheet  
- [ ] No regression in existing Modal/Sheet consumers  
- [ ] Lint + unit tests green  

### Out of scope

Command palette rewrite, nginx, DataContext split.

---

## Phase 1 — Navigation hub (⌘K + breadcrumbs)

**Goal:** Users can jump anywhere allowed for their role and always know where they are on detail pages.

### 1A — Command palette v2

| ID | Task | Notes |
|----|------|-------|
| 1.1 | Index **nav destinations** from `ACCESS_MAP` + `FEATURE_LABELS` / Sidebar sections, filtered by role + `useFeatureControls` | Reuse single source of truth |
| 1.2 | Index **My Actions** via `deriveMyActions` | Deep links already on actions |
| 1.3 | Keep entity search; raise limits modestly; respect access where routes are gated | Detail routes stay open; RLS still scopes data |
| 1.4 | **Recent** items (sessionStorage or `user_preferences` if already available) | Start with sessionStorage to avoid migration |
| 1.5 | Keyboard: ↑↓, Enter, Home/End; focus trap; `aria-activedescendant` or roving tabindex | Build on Phase 0 dialog pattern |
| 1.6 | Empty query: “Jump to pages” + recent + areas chips | Mirror My Actions empty chips |
| 1.7 | Tests for search ranking / filtering pure helpers | Extract pure functions from component |

**Files:** `CommandPalette.tsx`, new `src/lib/nav/commandPalette.ts` (preferred), `Layout.tsx` (if needed).

### 1B — Breadcrumbs + page title

| ID | Task | Notes |
|----|------|-------|
| 1.8 | `Breadcrumbs` component + route meta map | e.g. `/projects/:id` → Projects › {name} |
| 1.9 | Use on detail pages: staff, project, instrument, committee, meeting, ticket, PMS report, proposal, progress report | Incremental: highest-traffic first |
| 1.10 | Optional: set `document.title` from breadcrumb trail | Small win for tabs |
| 1.11 | “Back to list” prefers `location.state` / query restore when present | Phase 4 completes URL filters |

### Acceptance criteria

- [ ] Scientist can ⌘K → “Helpdesk” / “PMS” without sidebar  
- [ ] Arrow keys + Enter navigate without mouse  
- [ ] Palette does not show pages disabled by feature kill-switch  
- [ ] Staff/project detail shows working breadcrumb to list  
- [ ] Escape closes palette; focus returns to search trigger  

### Verify

`npm test` (new pure tests), manual keyboard pass, lint.

---

## Phase 2 — Unified Inbox + role home v1

**Goal:** One place for “what needs me”; dashboards orient role in &lt;30 seconds.

### 2A — Unified Inbox

| ID | Task | Notes |
|----|------|-------|
| 2.1 | Extract shared inbox model: merge `deriveMyActions` + PMS `notifications` | `src/lib/dashboard/inbox.ts` |
| 2.2 | Top-bar **Inbox** control (badge count); panel or route `/inbox` | Prefer panel first (less routing) |
| 2.3 | Filters: All \| PMS \| Committees \| Helpdesk \| Workforce | Map from action `kind` |
| 2.4 | Mark notification read on open (existing PMS API) | Keep worker/API contracts |
| 2.5 | Optional dismiss/snooze for retirement noise (local or preferences) | Can be Phase 2.5 if timeboxed |
| 2.6 | Dashboard My Actions becomes thin wrapper or links to Inbox | Avoid two divergent UIs |

**Files:** `NotificationBell.tsx`, `MyActions.tsx`, `Layout.tsx`, `lib/dashboard/*`.

### 2B — Role-first home v1

| ID | Task | Notes |
|----|------|-------|
| 2.7 | Scientist: “Continue PMS” + my open actions + 3 quick links | Build on `ScientistView` |
| 2.8 | HOD/DivisionHead: attention list + division shortcuts | Existing views |
| 2.9 | Director: lead with AttentionStrip / exceptions before vanity KPIs | Reorder, don’t redesign charts |
| 2.10 | DefaultUser/Guest: clearer request status copy | `PendingAccessView` |
| 2.11 | First-login 3-step checklist (dismissible, local or preferences) | Lightweight |

### Acceptance criteria

- [ ] Badge count matches pending work + unread notifs  
- [ ] Clicking item deep-links correctly  
- [ ] Scientist home shows PMS draft without opening sidebar  
- [ ] Role switch still lands on correct home  

### Verify

Unit tests for inbox merge/sort; manual multi-role smoke.

---

## Phase 3 — Accessibility baseline

**Goal:** WCAG-oriented baseline on critical paths; shared patterns for the rest of the app.

*Can start in parallel with Phase 1 once 0.2 is done; finish after palette/inbox so those surfaces inherit a11y.*

| ID | Task | Routes / components |
|----|------|---------------------|
| 3.1 | Form error pattern: `aria-invalid`, `aria-describedby`, visible errors | Login, TicketForm, PMS section forms (sample) |
| 3.2 | Tables: caption / `sr-only` + `scope` on major DataTables | HumanCapital, Projects, TicketList |
| 3.3 | Toast live region audit | `ToastContext` (already has `role="status"` — verify) |
| 3.4 | Status never color-only on badges (text already present — audit charts) | StatusBadge, PMS StatusSeal |
| 3.5 | Contrast + dark mode pass on muted text / terracotta | `index.css` tokens only if needed |
| 3.6 | Keyboard-only QA script documented | Login → Dashboard → Staff → PMS wizard step 1 |
| 3.7 | Optional: axe-core or eslint-plugin-jsx-a11y in CI (warn first) | `package.json`, eslint config |

### Acceptance criteria

- [ ] Keyboard-only path completes without mouse  
- [ ] Screen reader can name main buttons on Login + palette + inbox  
- [ ] No critical axe issues on 4 routes (if tool added)  
- [ ] Reduced motion still respected  

---

## Phase 4 — Findability (URL filters + dossier consistency)

**Goal:** Lists shareable and restorable; detail pages feel like one product.

### 4A — URL-synced filters

| ID | Task | Pages (priority order) |
|----|------|------------------------|
| 4.1 | Hook `useUrlFilters` or similar (searchParams) | Shared util |
| 4.2 | Staff list, Projects, Helpdesk, PhD, Facilities | Highest traffic |
| 4.3 | Active filter chips + Clear all | Consistent UI |
| 4.4 | Detail “Back” restores query string | Integrate with breadcrumbs |

### 4B — Standard dossier shell

| ID | Task | Notes |
|----|------|-------|
| 4.5 | Document layout pattern: Header · KPIs · Tabs · RelatedRail · Docs | Component or convention |
| 4.6 | Ensure RelatedRail on: Staff, Project, Division, Instrument, PhD, Committee | Where relations exist |
| 4.7 | EntityLink hover/focus keyboard accessible | Phase 0 focus |

### Acceptance criteria

- [ ] Copy-paste URL recreates filtered Projects list  
- [ ] Browser back from detail restores filters  
- [ ] Connections rail present on staff + project detail  

---

## Phase 5 — On-prem platform hardening

**Goal:** Staging host can run SPA + Supabase + RAG + LLM safely.

| ID | Task | Area |
|----|------|------|
| 5.1 | Expand `deploy/nginx.conf`: security headers, TLS settings, `limit_req` on `/rag/`, `client_max_body_size`, SSE `proxy_buffering off` | `deploy/nginx.conf` |
| 5.2 | Document firewall: only 443; LLM/DB/Studio not LAN | `deploy/README.md` |
| 5.3 | `GET /healthz` on rag-api (Supabase anon reachability + LLM optional ping) | `rag/api.py` |
| 5.4 | nginx upstream health optional; service restart policy notes | deploy docs |
| 5.5 | Secrets layout checklist (three files, ACLs) | deploy docs / profiles |
| 5.6 | Backup runbook: pg_dump + storage paths + restore drill template | `deploy/` or `docs/` |
| 5.7 | Preflight remains required before services | `rag/preflight.py` (already) |
| 5.8 | Pin model name in institute-server profile (Gemma or chosen) | `deploy/profiles/institute-server/*` |

### Acceptance criteria

- [ ] curl `/rag/healthz` returns ok when stack up  
- [ ] curl `/rag/query` without JWT → 401  
- [ ] Headers present on HTTPS responses  
- [ ] Ollama not reachable from another LAN machine  
- [ ] Restore drill documented (even if first run is dry-run)  

### Out of scope for this phase

Full semantic layer rewrite; multi-worker claim system (can be 5.x later).

---

## Phase 6 — Config lock + observability

**Goal:** Production misconfig paths closed; ops can see failures.

| ID | Task | Notes |
|----|------|-------|
| 6.1 | **Prod disable** Setup Wizard localStorage override for Supabase keys | `supabaseClient.ts`, `SetupWizard` gated by `import.meta.env.PROD` |
| 6.2 | CI or script: fail if service key patterns appear under `src/` | Simple grep in CI |
| 6.3 | Structured logging in rag-api/worker (request id, latency) | Python logging JSON |
| 6.4 | Connectivity banner in SPA when DataContext error or RAG health fails | Layout banner |
| 6.5 | Ask SURYA: disable submit + clear message if healthz LLM down | `AskSurya.tsx` |
| 6.6 | Optional: scrape metrics endpoint (queue depth, query count) | Minimal |

### Acceptance criteria

- [ ] Production build ignores wizard localStorage for URL/key  
- [ ] Failed Supabase load shows user-visible banner, not only empty tables  
- [ ] Ask shows “assistant unavailable” when healthz fails  

---

## Phase 7 — Performance & data loading

**Goal:** Faster first paint after login; admin code not shipped to all roles.

| ID | Task | Notes |
|----|------|-------|
| 7.1 | Audit DataContext fetch list; split into domain loaders (core vs lazy) | Careful: many pages assume all data present |
| 7.2 | Lazy load domain when first route needing it mounts | e.g. equipment on `/facilities` |
| 7.3 | Route-level code-split admin/PMS audit if not already complete | `App.tsx` already lazy — verify chunking |
| 7.4 | Skeleton layouts matching page chrome | Reduce CLS |
| 7.5 | Measure: login → interactive dashboard time (before/after) | Manual or simple mark |

### Acceptance criteria

- [ ] Scientist login does not block on unused admin-only datasets (where safe)  
- [ ] No blank flash regressions on critical pages  
- [ ] Tests for any new loaders  

### Risk

Breaking pages that assume full DataContext — mitigate with “core pack” (staff, divisions, projects) always loaded for authenticated users.

---

## Phase 8 — Contextual intelligence

**Goal:** Ask and Graph are entry points from work, not only top-level pages.

| ID | Task | Notes |
|----|------|-------|
| 8.1 | “Ask about this …” on project/staff/doc detail — navigate to `/ask` with query/context state | No backend rewrite required for v1 |
| 8.2 | Explore Graph: “Open from this entity” deep link | Pass seed id in hash/query |
| 8.3 | Graph legend + basic keyboard focus | A11y |
| 8.4 | Dashboard: last N Ask questions (local) | Optional |
| 8.5 | Expand eval gold set 20–50 institute questions; run on model pin | `rag/eval/` |

### Acceptance criteria

- [ ] From project detail, Ask opens with project name in context  
- [ ] Graph opens centered/filtered on seed entity  
- [ ] Eval documented for go-live model  

---

## Phase 9 — Domain UX polish

**Goal:** Day-to-day module friction down for HR, helpdesk, committees, PMS, calendar.

| ID | Task | Module |
|----|------|--------|
| 9.1 | Empty states show data-health / “upload next” hints | Data Management, HumanCapital empty |
| 9.2 | Import 5-row preview before commit (if not present) | ImportFlow |
| 9.3 | Helpdesk default filter: my + assigned | TicketList |
| 9.4 | Committees: “my cards” default on Kanban | KanbanBoard / actions |
| 9.5 | Calendar agenda/list view + “my” events default | Calendar.tsx |
| 9.6 | PMS: sticky section checklist + deadline banner on author surfaces | ReportWizard, ReportEdit |
| 9.7 | Multi-role toast on switch | Layout role switcher |
| 9.8 | Nav pending badges + pin favourites (user_preferences) | Sidebar |

### Acceptance criteria

- [ ] Helpdesk opens to actionable subset for scientist  
- [ ] PMS author always sees deadline + incomplete sections  
- [ ] Favourites persist across sessions if preferences API exists  

---

## Phase 10 — Staging go-live gate (ops)

**Goal:** Checklist before real users on institute server.

### Gate checklist

```
[ ] supabase db push + seed + first admin promote documented
[ ] SPA built with VITE_RAG_URL=/rag and self-hosted VITE_SUPABASE_URL
[ ] rag-api + rag-worker preflight green
[ ] nginx TLS + headers + rate limit live
[ ] Smoke: 401 without token; Ask with citations; refusal on off-corpus
[ ] /admin/rag shows ingest counts
[ ] Backup taken and restore tested once
[ ] npm audit / pip-audit / gitleaks clean (or accepted risks logged)
[ ] ZAP or manual IDOR: Scientist cannot read other-division restricted rows (RLS)
[ ] Keyboard a11y path signed off
[ ] Model version pinned; eval run archived
[ ] Feature kill-switches known to MasterAdmin
```

### Continuous (post go-live)

- CI remains green on main  
- Re-run eval on every model upgrade  
- Quarterly restore drill  
- Expand RLS tests when new tables ship  

---

## Dependency graph (simplified)

```
Phase 0 ──┬──► Phase 1 ──► Phase 2 ──► Phase 9
          │         │
          │         └──► Phase 4 ──► Phase 8
          │
          ├──► Phase 3 (parallel, finish after 1–2)
          │
          └──► Phase 5 ──► Phase 6 ──► Phase 10
                              │
Phase 7 ◄── after 2+4 stable; optional before 10
```

---

## Team / sequencing options

### Option A — UX-first (recommended if users already on cloud Supabase)

`0 → 1 → 2 → 3 → 4 → 9 → 7 → 8` and run **5–6–10** when hardware is ready.

### Option B — On-prem-first (institute server install soon)

`0 → 5 → 6 → 10` gate staging, then `1 → 2 → 3 → 4…` on the same codebase.

### Option C — Two streams

- Stream A: Phases 0–4, 9  
- Stream B: Phases 5–6, 10  
- Merge before Phase 8 (Ask health depends on B).

---

## Definition of done (per phase)

1. Tasks for the phase completed or explicitly deferred with reason  
2. `npm run lint` + `npm test` + `npx tsc --noEmit` (SPA phases)  
3. RAG phases: `pytest` in `rag/` as needed  
4. Manual acceptance criteria checked  
5. Short note in `docs/roadmap/sources/improvement-proposals-grok.md` §12 history or phase checklist updated  
6. Prefer small commits per task cluster (not one mega-commit)

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| DataContext lazy load breaks pages | Phase 7 last among data changes; “core pack” always loaded |
| Inbox double-counts PMS | Single merge function + unit tests |
| a11y changes break dense tables | Visual QA on compact density |
| nginx rate limits break legitimate Ask | Tunable limits; higher for authenticated if possible |
| Prod wizard lock blocks legitimate air-gap setup | Allow wizard only when `!import.meta.env.PROD` or explicit build flag |
| Scope creep into redesign | Phase goals fixed; new ideas → backlog in proposals doc |

---

## Immediate next step (after plan approval)

Start **Phase 0** only:

1. Modal/Sheet a11y  
2. Skip link + `<main>`  
3. Focus-visible token  
4. Commit checklist file under `docs/roadmap/sources/IMPLEMENTATION-PLAN-IMPROVEMENTS.md` (copy of this plan)

No Phase 1 work until Phase 0 acceptance criteria pass.

---

## Mapping back to proposals doc

| Proposals section | Phases |
|-------------------|--------|
| §3 Architecture | 5, 6, 7 |
| §4 Infrastructure | 5, 10 |
| §5 Hardening tools | 10 (+ CI nits in 3/6) |
| §6.1 Tier 1 UX | 0, 1, 2, 3 |
| §6.2 Tier 2 findability | 4, 8 |
| §6.3 Tier 3 domain | 9 |
| §8 Roadmaps | This document expands them into executable phases |

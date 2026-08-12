# SURYA — Improvement Proposals (Grok)

> **Source document for [ROADMAP.md](../ROADMAP.md).** This brief carries the implementation detail;
> the roadmap says which work package it belongs to and what it depends on. Item IDs here
> are the ones the roadmap references. Status lines below may predate the roadmap — check
> there first.


**Date:** 2026-07-30  
**Scope:** Architecture for on-prem hosting, operational hardening, navigation, accessibility, and high-value feature optimisations.  
**Source:** Read-only review of the SURYA codebase (routes, contexts, deploy runbook, RAG stack, CI/RLS gates).  
**Status:** Proposals only — not an implementation commitment.

---

## 1. App snapshot (context)

SURYA is an institutional SPA for **CSIR-AMPRI** with two halves:

1. **HR / research data ops** — staff, divisions, projects, PhD, equipment, publications, IP, partnerships, Excel/CSV import  
2. **PMS** — multi-stage scientist appraisal (`DRAFT → SUBMITTED → … → FINALIZED`)

**Stack:** React 19 + Vite + Tailwind 4 + Supabase (Auth, Postgres, RLS) + optional Python RAG (`rag/`) + local LLM (Ollama/OpenLLM-compatible).

**Access model:** 14 roles, `ACCESS_MAP` + MasterAdmin feature kill-switches + Postgres RLS. Pages use contexts (`useData`, `usePMS`, proposals, reports), not raw Supabase from page components.

**Nav (sidebar sections):** Overview · Unified HR · Research Ops · Governance · Admin.

**Already strong foundations to build on:**

| Strength | Location |
|----------|----------|
| Role-filtered sidebar | `Sidebar.tsx`, `constants/access.ts` |
| ⌘K / Ctrl+K command palette (entity search) | `CommandPalette.tsx` |
| Cross-module pending work | `MyActions` + `lib/dashboard/myActions.ts` |
| Entity deep-links + connections | `EntityLink`, `RelatedRail` |
| Role switcher, density modes, reduced motion | `Layout`, Theme, `index.css` |
| Service key isolation (worker only) | `deploy/` env split |
| RLS + SECURITY DEFINER CI gates | `supabase/tests/*`, `scripts/check_security_definer.py` |
| Same-origin `/rag/` proxy design | `deploy/nginx.conf`, `deploy/README.md` |

---

## 2. Target on-prem topology

Intended institute stack: **self-hosted Supabase + nginx + local OpenLLM/Ollama (e.g. Gemma)**.

```
Browser (LAN)
    │
    ▼
nginx (TLS)
    ├── /          → SPA static (dist/, HashRouter)
    ├── /rag/      → 127.0.0.1:8000  surya-rag-api  (caller JWT only)
    └── (optional) → Supabase Kong
    │
    ├── Ollama / vLLM / Gemma   → localhost only (never LAN-exposed)
    ├── surya-rag-worker        → holds SUPABASE_SERVICE_KEY only
    └── Supabase stack          → Postgres · GoTrue · Storage (Studio admin-only)
```

### Non-negotiables (keep)

- **API never holds the service key**; worker/ingest only.  
- RAG reads use **caller JWT → RLS** as the document gate.  
- Same-origin `/rag/` via nginx (no browser CORS to LLM).  
- LLM bound to **loopback** only.  
- Schema changes only via **migrations** (`supabase db push`), not Dashboard paste.

`LLM_BACKEND=openllm` + OpenAI-compatible `/v1/chat/completions` already supports Gemma via Ollama/vLLM without redesign.

---

## 3. Architecture improvements (on-prem)

### 3.1 Config and secrets

| Gap | Proposal |
|-----|----------|
| Setup Wizard can store Supabase URL/anon key in `localStorage` | **Prod builds:** disable wizard/localStorage override; build-time or server-injected config only |
| Service role vs anon confusion | CI/docs assert service key never in SPA or `rag-api.env` |
| Multi-env rebuild friction | Optional runtime `config.json` served by nginx (anon URL/key only) |
| Env sprawl | Standardize **three sealed files**: SPA build args, rag-api, rag-worker — ACL-restricted |

### 3.2 SPA data architecture

| Gap | Proposal |
|-----|----------|
| `DataContext` bulk-loads ~20 tables at session start | **Lazy/domain loaders** when routes open; keep RLS on every query |
| Client-side joins for relations/analytics | Long-term: hot dashboards as **server views/RPCs**; pure `src/lib/*` remains semantic source |
| Admin code still in large bundles | Finish **route-level code-split** for `/data`, `/pms/audit`, `/admin/*` |
| Errors often logged + empty UI | Global error surfacing + API correlation IDs; EmptyState error variant rollout |
| No client telemetry | Optional auth’d, on-prem telemetry for failed loads (not SaaS if air-gapped) |

### 3.3 Auth (self-hosted GoTrue)

| Gap | Proposal |
|-----|----------|
| App password policy vs server config | Align GoTrue: length, rotation, MFA if required |
| Active role is UI-driven | Every privileged write remains RLS/RPC-checked; audit client-only gates |
| Dev auth bypass | Confirm stripped from production builds |
| First admin bootstrap | Documented promote path (ops runbook), not ad-hoc SQL |

### 3.4 RAG / LLM service

| Gap | Proposal |
|-----|----------|
| No rate limits | nginx `limit_req` + optional per-user Ask quota |
| No body size limits in nginx conf | `client_max_body_size`; cap question length server-side |
| Single worker | Optional multi-worker claim/lease on document queue |
| Health | `/healthz`: DB reachable + model loaded |
| Streaming | nginx `proxy_buffering off` for SSE |
| Model strategy | Optional small model for route/pick; larger Gemma for answer/summarize |
| Quality gate | Extend `rag/eval` gold set with real institute Q&A before go-live |

### 3.5 Database / Supabase self-host

| Gap | Proposal |
|-----|----------|
| Cloud mental model | Pin self-host versions; migrations-only |
| Backups not in app repo | Nightly logical + periodic base backup; **tested restore** (Postgres + Storage) |
| Studio | Not on LAN; SSH/admin VLAN only |
| Storage | Encrypted volume; backup with DB |
| Time | NTP (JWT validity) |

### 3.6 Observability

| Need | Proposal |
|------|----------|
| Process health | NSSM/systemd + health endpoints |
| Logs | Structured JSON from rag-api/worker; rotation |
| Metrics | Latency, LLM time, queue depth, 401/429 |
| Alerts | Stuck ingest, worker down, disk, cert expiry |
| Audit | Login / role-change / feature-control reviewable |

### 3.7 Build and release

| Gap | Proposal |
|-----|----------|
| Manual `dist/` copy | Versioned release artifact + checksum |
| Manual migrate | Playbook: migrate → seed → preflight → start services |
| No staging | Staging stack (smaller model, synthetic data) before prod |

### 3.8 Longer-term maintainability

1. Semantic layer consolidation (TS metrics vs Python `analytics.py` catalog twin).  
2. Domain contexts instead of one HR “god” context.  
3. Keep **whitelist analytics** — never free-form NL→SQL.

---

## 4. Infrastructure hardening (nginx, host, LLM)

### 4.1 nginx (beyond current minimal conf)

Current `deploy/nginx.conf`: TLS + SPA + `/rag/` proxy only.

**Add before production:**

- Security headers: HSTS, `X-Content-Type-Options`, frame denial, `Referrer-Policy`, CSP (start report-only)  
- TLS 1.2+ only; modern ciphers  
- `limit_req_zone` on `/rag/`  
- `client_max_body_size` for uploads if proxied  
- Hide server tokens; restrict methods  
- Access/error log retention  
- SSE buffering off for streaming routes  
- **Never** proxy Ollama, Postgres, or Studio to the open LAN  

### 4.2 LLM (Gemma / Ollama / vLLM)

1. Bind `127.0.0.1` only.  
2. Preload model (`OLLAMA_KEEP_ALIVE=-1` or vLLM warm).  
3. Air-gap weight transfer; pin version digests.  
4. Document SLOs (e.g. p95 answer latency with GPU).  
5. Treat document text as untrusted (prompt injection); keep refusal invariant.  
6. Host any future embeddings locally if air-gapped.  

### 4.3 Host OS

- Least-privilege service accounts  
- Document WDAC/native DLL exceptions for PyMuPDF (Windows hard prerequisite)  
- Patch cadence; no public RDP  
- Firewall: default-deny except 443  

---

## 5. Pre-deploy hardening tools

### 5.1 Already in repo — make them release gates

| Check | Catches |
|-------|---------|
| `npm run lint` / `test` / `build` | SPA correctness |
| `pytest` in `rag/` and `ingest/` | RAG/ingest regressions |
| `supabase db reset` + RLS positive/negative SQL | Privilege bugs |
| `scripts/check_security_definer.py` | RPCs without authz |
| `rag/preflight.py --api` / `--worker` | Env, schema, LLM reachability |
| `rag/eval/run_eval.py` | Router/refusal quality |

Run preflight + eval **on the target server** before go-live, not only in CI.

### 5.2 Recommended additional tools

| Category | Tools |
|----------|--------|
| Dependency CVEs | `npm audit`, `pip-audit`, **osv-scanner** |
| Images / FS | **Trivy** or Grype (Supabase images) |
| Secrets in git | **gitleaks** / trufflehog |
| SAST | **Semgrep** (OWASP), optional CodeQL |
| DAST | **OWASP ZAP** or Burp on staging (two roles) |
| Load | **k6** / locust on `/rag/query` |
| Network | **nmap** (Ollama/Postgres/Studio closed), **testssl.sh** |
| DB forensics | **pgAudit** |
| Secrets ops | Vault / SOPS / institute secret store |

### 5.3 Process hardening

- Short STRIDE threat model: Ask SURYA, PMS RPCs, helpdesk, data import  
- Role matrix manual tests  
- Backup restore drill (RTO/RPO)  
- Break-glass MasterAdmin + feature kill-switch procedure  
- Incident: rotate service key, disable features  

---

## 6. Feature & UX optimisations (navigation, access, daily use)

### 6.1 Tier 1 — highest value

#### A. Command palette → “jump anywhere” hub

**Today:** Client search of staff / projects / PhD / outputs / IP / equipment (3 hits each). Weak keyboard UX.

**Enhance:**

1. Nav jump to any page allowed by `ACCESS_MAP` + feature flags  
2. Surface **My Actions** (draft PMS, tickets, evaluations)  
3. Recent / frequent entities and pages  
4. Keyboard: ↑↓, Enter, focus trap, `role="dialog"`, result count announced  
5. Empty state: shortcuts + “my areas” chips  
6. Role-scoped results  

#### B. Wayfinding: breadcrumbs + “you are here”

**Today:** Static top-bar title; detail pages lack hierarchy.

**Enhance:**

- Breadcrumbs: `Projects › GAP-2024-01`  
- Dynamic page title / H1  
- Back to list **restoring filters**  
- Context chips: active division (HOD), active PMS cycle  

#### C. Unified Inbox

**Today:** My Actions (dashboard only) vs NotificationBell (PMS only).

**Enhance:**

- Global top-bar Inbox (badge = actions + unread)  
- Merge derived actions + PMS notifs (+ later helpdesk/committee dues)  
- Filters: All | PMS | Committees | Helpdesk | Workforce  
- Dismiss / snooze for noisy items (e.g. retirement horizon)  

#### D. Accessibility baseline (WCAG-oriented)

**Today:** Sparse `aria-*`; uneven focus rings (`#3898ec` in places); palette not a proper dialog.

**Minimum package:**

| Area | Change |
|------|--------|
| Skip link | Skip to main content |
| Landmarks | `<main>`, labeled sidebar `nav`, header |
| Focus | Tokenized `focus-visible` rings |
| Overlays | Focus trap, Escape, return focus, labelled dialogs |
| Forms | Labels; `aria-invalid` / `aria-describedby` for errors |
| Tables | Captions / `th` scope; sticky headers |
| Status | Never color-only (text + icon) |
| Contrast | Audit terracotta/muted on light and dark |
| Motion | Keep reduced-motion; lighter first paint motion |
| Zoom | PMS wizard and Login usable at 200% |
| Live regions | Toasts + Ask SURYA streaming |

#### E. Role-first home experience

Most users need 3–5 destinations daily — not the full sidebar.

| Role focus | Home content |
|------------|--------------|
| Scientist | Continue PMS, my projects, my students, tickets, meetings |
| HOD / DivisionHead | Division pulse, people needing attention, budget/AMC flags |
| Director | Exceptions / AttentionStrip first, then KPIs |
| DefaultUser / Guest | Access request status and next steps |
| All (first login) | 3-step checklist: profile, primary area, density/theme |

---

### 6.2 Tier 2 — findability & consistency

| # | Proposal | Why |
|---|----------|-----|
| F | **URL-synced list filters** (`?div=&status=`) + clear chips | Shareable lists; back button works |
| G | **Standard dossier layout** on all detail pages (header · KPIs · tabs · Connections · docs) | EntityLink/RelatedRail not universal today |
| H | **Explore Graph** entry from current entity; legend; keyboard select; role-scoped nodes | Graph is impressive but under-anchored |
| I | **Contextual Ask SURYA** from dossiers (“Ask about this project”) | `/ask` is a dead-end island today |
| J | **Sidebar polish**: section collapse memory, pin favourites, pending badges, mobile search | Long nav for multi-role users |
| K | **Calendar**: default “my” agenda + list view (a11y) | Month grids are hard daily/AT |
| L | **PMS authoring**: section checklist, deadline always visible, keyboard-friendly tables | Highest-stakes annual workflow |

---

### 6.3 Tier 3 — feature optimisations that feel like UX

| # | Proposal |
|---|----------|
| M | Data import: “what to upload next” from DataHealthDigest; freshness on empty lists; 5-row preview before commit |
| N | Helpdesk: default **my / assigned to me**; SLA age with text labels; link ticket to staff/project |
| O | Committees: “meetings this week” on home; Kanban default **my cards** for non-secretaries |
| P | Performance: lazy DataContext domains; layout-stable skeletons; optional EntityLink prefetch |
| Q | Connectivity honesty: banner when Supabase/RAG/LLM down; disable Ask with clear reason |
| R | Multi-role: toast “Now acting as HOD” after switch; optional quick actions for secondary role |

---

## 7. Priority matrices

### 7.1 On-prem / architecture

| Priority | Item | Why |
|----------|------|-----|
| P0 | Service key isolation + RLS CI + Studio/LLM not on LAN | Catastrophic-leak prevention |
| P0 | TLS + same-origin nginx + preflight | Matches threat model |
| P0 | Backup/restore Postgres + Storage | On-prem durability |
| P1 | Rate limits + body size + healthz | Protect GPU/LLM and ops |
| P1 | Dep CVE scan + secrets scan | Cheap risk reduction |
| P1 | Eval gate + pinned model | Avoid demo-only quality |
| P2 | Disable prod localStorage wizard | Misconfig path |
| P2 | Logs / metrics / alerts | Operability |
| P2 | Lazy data load + admin code-split | Scale headroom |
| P3 | Semantic layer consolidation | Maintainability |

### 7.2 Navigation / UX / a11y

| Order | Item | Impact | Effort |
|------:|------|--------|--------|
| 1 | ⌘K: pages + actions + keyboard a11y | Very high | M |
| 2 | Breadcrumbs + dynamic title | High | S |
| 3 | Unified Inbox | Very high | M |
| 4 | a11y baseline (skip, focus, modals, forms) | High | M |
| 5 | URL filters + restore list state | High | M |
| 6 | Role-first home cards | High | M–L |
| 7 | Standard dossier + RelatedRail everywhere | High | M |
| 8 | Nav badges + favourites | Medium–high | S–M |
| 9 | Contextual Ask / Graph | Medium–high | M |
| 10 | Import guidance + data health on empty states | Medium | S–M |
| 11 | Lazy data load (speed) | Medium | M |
| 12 | Calendar agenda + my meetings | Medium | S–M |

S ≈ days · M ≈ 1–2 weeks · L ≈ multi-week.

---

## 8. Suggested roadmaps

### 8.1 On-prem deploy phases

1. **Host readiness** — TLS, Supabase, Ollama+Gemma, firewall (443 only), secrets ACLs  
2. **Staging = prod topology** — migrate → seed → preflight → smoke (401 without JWT; Ask with citations)  
3. **Harden** — headers, rate limits, dep/DAST scans, 20–50 gold questions, restore drill  
4. **Prod debt** — wizard lock, healthz, lazy data, monitoring  
5. **Continuous** — CI green; eval on every model upgrade; quarterly restore test  

### 8.2 “Navigation & Access” product milestone

Single implementation track if prioritising UX:

1. Shared accessible modal/sheet primitive  
2. Command palette v2 (pages + My Actions + keyboard)  
3. Breadcrumbs + page titles  
4. Unified Inbox (actions + notifications)  
5. Focus / skip / form a11y pass on: Login, Dashboard, Staff list, PMS wizard step 1  

---

## 9. Explicit non-goals (do not prioritise early)

- Rewriting RLS into the SPA (DB stays fortress)  
- Free-form NL→SQL for Ask SURYA  
- Putting service key in rag-api “for convenience”  
- Exposing Ollama or Studio on the institute LAN  
- BrowserRouter migration solely for prettier URLs (HashRouter is intentional for static nginx)  
- Visual redesign of the whole design system before focus tokens / a11y  
- More sidebar modules before search, inbox, and favourites  
- Cloud-only SaaS monitoring on an air-gapped network  

---

## 10. Success metrics (optional)

**Ops / security**

- Preflight green on target host  
- Restore drill within agreed RTO  
- Zero critical findings from ZAP on auth/IDOR for two roles  
- nmap: no Ollama/Postgres/Studio on LAN  

**UX / navigation**

- Time to first meaningful action after login (by role)  
- % sessions using ⌘K  
- Support tickets of type “I can’t find X” trending down  
- Keyboard-only path: login → staff detail → PMS draft  
- axe / Lighthouse: zero **critical** a11y issues on Login, Dashboard, Staff list, PMS wizard step 1  

**RAG**

- Eval pass rate on institute gold set  
- p95 Ask latency within documented SLO  
- Refusal rate healthy on off-corpus questions  

---

## 11. Implementation checklist (condensed)

### Architecture / deploy

```
[ ] Prod: disable Setup Wizard localStorage config
[ ] Three sealed env files; service key only on worker/ingest
[ ] Self-hosted Supabase; Studio not LAN-exposed
[ ] nginx: headers, rate limit, body size, SSE buffering off
[ ] LLM localhost only; model pinned + preloaded
[ ] /healthz on rag-api
[ ] Backup + restore drill (DB + Storage)
[ ] preflight + eval on target server
[ ] Dep scan (npm/pip) + secrets scan + Trivy
[ ] Staging topology matches prod
```

### Navigation / a11y / features

```
[ ] Skip to main + landmarks
[ ] ⌘K: pages + entities + my actions + arrow keys + focus trap
[ ] Breadcrumbs on all :id routes
[ ] URL-synced filters on major list pages
[ ] Tokenized focus-visible (no random focus colours)
[ ] Shared modal/sheet/palette a11y pattern
[ ] Form errors announced (aria-invalid / describedby)
[ ] Tables: captions / th scope
[ ] Unified Inbox (actions + notifications)
[ ] Role home “3 next steps”
[ ] Nav badges for pending work
[ ] Favourites / pinned destinations
[ ] Contextual Ask + Graph from dossiers
[ ] Data health guidance on empty / import surfaces
[ ] Connectivity banners when backends down
[ ] Reduced motion + 200% zoom verified on Login + PMS wizard
```

---

## 12. Document history

| Date | Author | Notes |
|------|--------|-------|
| 2026-07-30 | Grok (codebase review session) | Initial proposals: on-prem architecture, hardening tools, nav/a11y/feature optimisations |

---

*Refresh this file when priorities are accepted, rejected, or shipped. Link PR numbers next to checklist items as work lands.*

# Report ↔ Repository Map (presentation prep)

Maps `SURYA-Final-Project-Report v3.docx` to the codebase, section by section.
Purpose: understand what was actually built, prove every report claim from the repo,
and prepare for the viva/presentation (see also `docs/project/VIVA-PLAN.md`, which has the
measured evaluation numbers and a day-by-day readiness plan).

---

## 1. Report at a glance

| Report section | What it claims | Where it lives in the repo |
|---|---|---|
| 1 Problem statement | CSIR data is fragmented; no unified query layer; make-or-buy | `README.md` intro, `docs/engineering/FEATURES.md` §1–7 |
| 2 Objectives (6 SMART) | Data integration, PageIndex retrieval, NL interface, use-case validation, scalability, evaluation | Sections 6.3/6.4 (data), 6.6 (RAG), 6.8 (UCs), 10.3 (scalability), 6.9 (metrics) |
| 3 Scope + 7 use cases | Three-layer system; governance; UC-1…UC-7 | `docs/engineering/FEATURES.md`; each UC has a route (see §5) |
| 3.5 Make-or-buy | Open-source build vs ERP/BI/DMS/hosted AI | `docs/engineering/STACK.md`, `deploy/README.md` |
| 4 Methodology | DSR, 18 weeks, 6 phases, baseline-first evaluation | `docs/operations/EVALUATION-PROTOCOL.md`, `docs/project/VIVA-PLAN.md` |
| 5 Plan vs progress | All phases 100% | Git history; `docs/project/VIVA-PLAN.md` Day-1 status |
| 6 Detailed description | Three layers + governance (see §2) | Whole repo, mapped in §3 |
| 6.8 Use-case validation | 7 working functionalities | See §5 route table |
| 6.9 Evaluation results | M1–M6 against targets | `rag/eval/run_eval.py` + `rag/eval/eval_report.md`, `docs/project/VIVA-PLAN.md` (measured values) |
| 6.10 Business case | Cost–benefit, payback | `docs/roadmap/sources/IMPROVEMENT-PROPOSALS.md`; figures live in report only |
| 7 Resources | Open-source stack, local LLM | `rag/requirements.txt`, `package.json`, `deploy/README.md` |
| 8 Risks / 9 Issues | RLS gate, OCR, refusal invariant, migrations | See §3 row per risk; all were real bugs fixed in repo |
| 10 Conclusions + scalability | Federated per-lab topology | `docs/ARCHITECTURE.md`, `deploy/profiles/` |
| Annexure-1 | Three-layer architecture | §2 below |
| Annexure-2 | Data category mapping | `supabase/migrations/` schema per domain |
| Annexure-3 | Ingestion pipeline flow | `rag/worker.py`, `src/utils/dataMigration.ts`, `src/components/DocumentPanel.tsx` |
| Annexure-4 | Evaluation instruments | `rag/eval/` (harness, gold sets), `docs/operations/EVALUATION-PROTOCOL.md` |
| Annexure-5 | Module & feature inventory | §4 below |
| Annexure-6 | Tech stack | `package.json`, `rag/requirements.txt`, `.github/workflows/ci.yml` |
| Annexure-7 | Query walk-throughs | `rag/eval/log_queries.py`, `query_log` table, `docs/project/VIVA-PLAN.md` measured runs |

---

## 2. The three-layer architecture → code

**Layer 1 — Data Management** (knowledge repository + ingestion + document registry)
- Repository: `supabase/migrations/` — 31 versioned SQL files (auth/RBAC → HR core → PMS
  → committees/helpdesk → proposals/reports → calendar/recruitment → RAG documents…).
- Structured ingestion: `src/utils/dataMigration.ts` (parse → column-map detect → validate
  → `pushToSupabase`), UI in `src/pages/DataManagement.tsx` + `src/components/ImportFlow.tsx`,
  `DatabaseBuilderPanel.tsx`, `EntityRecordsPanel.tsx`.
- Document registry + ingest queue: `src/components/DocumentPanel.tsx`; `rag/worker.py`
  claims pending → parse → index; `rag/db.py` queue logic (retry cap, dead-letter, stale requeue).
- IRINS sync: `scripts/irins/sync.ts` (`npm run sync:irins`), page `src/pages/IrinsSync.tsx`.

**Layer 2 — Analytics**
- Role dashboards: `src/pages/dashboards/` — exactly 14 views (Director, DivisionHead, HoD,
  Scientist, Technician, HR/Finance/System/Master Admin, EmpoweredCommittee, ProjectStaff,
  Student, Guest, PendingAccess).
- Entity analytics: `src/pages/StaffAnalytics.tsx`, `DivisionsAnalytics.tsx`,
  `ProjectsAnalytics.tsx`, `ProjectStaffAnalytics.tsx`, `PhDAnalytics.tsx`,
  `RecruitmentAnalytics.tsx`, `FacilitiesAnalytics.tsx`.
- Decision composites: `src/pages/Intelligence.tsx` (commercialisation strip, patent funnel,
  emerging themes, collaboration) + `src/components/PatentPipelineCard.tsx`,
  `src/pages/RnDMonitor.tsx`, `src/components/MyActions.tsx` (action inbox).

**Layer 3 — RAG Intelligence (Ask SURYA)** — `rag/` FastAPI service
- `api.py` (endpoints `/query`, `/query_stream`, `/similar`, `/map_columns`),
  `router.py` (structured / document / hybrid routing), `query_service.py` (mode handling,
  history, corpus selection), `retrieval.py` (tree reasoning + refusal path),
  `pageindex.py` (tree index build), `parse.py` + `ocr.py` (parsing, Tesseract/Ollama OCR),
  `llm.py` (OpenAI-compatible client, FakeLLM for tests), `analytics.py` (whitelisted
  analytic functions — never free-form SQL), `answer.py` (grounded answer composition).
- Frontend: `src/pages/AskSurya.tsx`, admin console `src/pages/RagMonitor.tsx` (ingestion
  status, retry, query log, M3 traceability stat, CSV export).
- Knowledge-graph explorer: `src/pages/ExploreGraph.tsx` + `src/components/NetworkCanvas.tsx`.

**Governance (cross-cutting)**
- RBAC: `src/constants/access.ts` (ACCESS_MAP), `src/lib/access/featureControls.ts`,
  route guards in `src/App.tsx` (every route wrapped in `ProtectedRoute`).
- RLS + SECURITY DEFINER state machines: `supabase/migrations/` (RLS on every table;
  proposal/PMS transitions as RPCs — `20260712000004_pms.sql`,
  `20260712000006_proposals_reports.sql`, `20260718000007_lock_rpc_execute.sql`,
  `20260726000005_relock_rpc_execute.sql`).
- Audit: `src/pages/pms/AuditLog.tsx`; query log: `20260714000002_query_log_decision_trace.sql`.

---

## 3. Feature inventory (Annexure-5) → routes & files

| Module group | Report claims | Route(s) in `src/App.tsx` | Key files |
|---|---|---|---|
| Platform & access | login, role switching, access requests, forced password change, command palette, theme/density | `/login`, `/setup`, `/change-password`, `/pending`, `/admin/access-requests`, `/admin/features` | `Login.tsx`, `AccessRequests.tsx`, `CommandPalette.tsx`, `SettingsModal.tsx`, `AuthContext.tsx` |
| Dashboards | 14 role-scoped, My Actions inbox | `/`, `/director`…`/pending` | `src/pages/dashboards/*` (14 files), `MyActions.tsx` |
| HR analytics | staff/divisions/project-staff/PhD/recruitment + analytics; Data Management; IRINS | `/staff*`, `/projects*`, `/phd`, `/divisions`, `/recruitment`, `/data`, `/irins-sync` | see §2 Layer 2; `PhDTracker.tsx` milestone tracking |
| Research ops | projects, proposals (state machine, similar-work, comparables), progress reports, facilities+AMC, partnerships (MOU/tech-transfer), R&D monitor | `/projects`, `/proposals*`, `/reports*`, `/facilities*`, `/partnerships`, `/rnd-monitor` | `SimilarWorkPanel.tsx`, `RelatedRail.tsx` (comparables), `ProposalForm.tsx`, `dateUtils.ts` (AMC/due dates) |
| Governance | PMS full cycle + grievance + audit, committees, helpdesk, calendar | `/pms*` (12 routes), `/committees*`, `/helpdesk*`, `/calendar` | `src/lib/pms/` (permissions, scoring, constants), `ReportWizard.tsx`, `src/pages/committees/`, `src/pages/helpdesk/` |
| Intelligence & AI | Intelligence page, Ask SURYA, RAG admin, knowledge-graph explorer | `/intelligence`, `/ask`, `/admin/rag`, `/explore` | §2 Layer 3; `src/lib/intelligence/commercialisation.ts` |

---

## 4. The seven use cases → where each is demonstrated

| UC | Route/system path | Code |
|---|---|---|
| UC-1 Portfolio optimisation | Director dashboard, project analytics, RnD monitor, budget-variance analytic | `DirectorView.tsx`, `ProjectsAnalytics.tsx`, `RnDMonitor.tsx`, `rag/analytics.py` (budget variance fn) |
| UC-2 Duplication avoidance | Proposal detail → “Check for similar work” | `SimilarWorkPanel.tsx`, `/similar` endpoint (`rag/api.py`), `rag/eval` duplication gold set |
| UC-3 Expertise discovery + succession risk | Ask SURYA expertise search; Intelligence collaboration; succession-risk analytic | `rag/analytics.py` (expertise search, succession risk), `src/lib/intelligence/*` |
| UC-4 Faster proposal evaluation | Comparable past projects panel | `RelatedRail.tsx`, `ProposalDetail.tsx` |
| UC-5 Commercialisation | Intelligence commercialisation strip, patent funnel, partnerships | `Intelligence.tsx`, `PatentPipelineCard.tsx`, `Partnerships.tsx`, `src/lib/intelligence/commercialisation.ts` |
| UC-6 Convergence detection | Emerging themes (cross-division keyword rise) | `Intelligence.tsx` / `src/lib/intelligence/` |
| UC-7 Grounded NL decision support | Ask SURYA three modes + refusal | `AskSurya.tsx`, `router.py`, `retrieval.py` (refusal path), `query_service.py` |

---

## 5. Evaluation indicators → evidence files

| Metric | Target | Evidence location | Measured (VIVA-PLAN, 2026-08-05) |
|---|---|---|---|
| M1 Sanction-processing prep time | ≥50% ↓ | Trial record; report §6.9.2 | ~1–2 days → ~2 hours (trial observation) |
| M2 Retrieval accuracy | ≥80% | `rag/eval/run_eval.py` → `eval_report.md` | **0.93–1.00** (13–14/14 gold questions) |
| M3 Source traceability | ≥95% | `query_log` + `eval/log_queries.py` | **1.00** (8/8 non-refusal answers cited; refusals 0 citations) |
| M4 Duplication recall | ≥70% | `rag/eval` duplication gold set | **0.90** recall; precision 0.38–0.41 (below target — own it, don't relabel) |

---

## 6. Verification status — what matches, what still needs attention

**Verified match (report ↔ repo):** all routes exist; 14 dashboards; 31 migrations; RAG
service complete with router/refusal/citations; whitelisted analytics; RLS on every table;
CI (`.github/workflows/ci.yml`: lint + vitest + build for SPA, pytest for rag incl.
tesseract); 75 test files in `src`+`rag`; deployment runbook `deploy/README.md`; docs for
every annexure.

**Open items before the presentation:**
1. **Report §6.9 M4 row still says “To confirm”** — the report itself flags highlighted
   cells to be replaced with final harness output. The numbers now exist (VIVA-PLAN §
   measured results): M2 0.93–1.00, M4a recall 0.90, M4b precision 0.38–0.41, M3 1.00.
   Either update the report before submission or be ready to quote the harness run.
2. **M4b precision below target** — cause is a labelling artifact (seeded topics list only
   2 known overlaps while the corpus contains more genuine overlaps). Recall (the metric
   the report targets) is met. State this exactly as VIVA-PLAN does.
3. **Report §6.10.1 input table says “avg 3 Hour per task”** while §6.9 says ~2 hours and
   ~½ hour per task — inconsistent numbers; reconcile before anyone reads the business case.
4. **Run-to-run variance:** M2 measured 0.93 then 1.00 on identical code (hosted model is
   not bit-reproducible). Quote the run whose `eval_report.md` you submit, as one run.

---

## 7. Presentation cheat sheet (5 days)

Story arc the report itself uses — use it as your slide skeleton:
1. **Problem:** institute has the data, not the recall. Money framing: every decision is
   capital allocation (portfolio, underwriting, cost-avoidance).
2. **Make-or-buy:** three filters kill all commercial options (sovereignty, row-level
   governance, workflow fit) → open-source build is also cheapest (5-yr TCO table).
3. **The artefact:** three layers + governance — data in → analytics → grounded answers.
4. **Demo spine (7 UCs):** portfolio view → duplication check → expertise/succession →
   proposal comparables → commercialisation → emerging themes → Ask SURYA (show a refusal!).
5. **Numbers:** M1 time cut, M2 0.93+, M3 1.00, M4 recall 0.90 (precision caveat).
6. **Business case:** recurring cost ≈ staff attention; payback within year 1 on M1 alone.
7. **Scalability:** per-lab instances + federated query tier; zero marginal licence cost.

Screens worth capturing (per VIVA-PLAN): Director dashboard, Data Management import flow,
proposal detail with similar-work panel, Intelligence page, Ask SURYA answer with citation
badge + mode badge, refusal answer, RAG admin console query log.

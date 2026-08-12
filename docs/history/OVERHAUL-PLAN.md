# SURYA Overhaul & RAG Roadmap

> **Status: HISTORICAL — tranches T0–T6 are all shipped.** Written 2026-07-07 as the plan
> that produced the RAG stack; retained as a design record of why the tranches were
> sequenced this way. Its "Current Feature Inventory" is a 2026-07-07 snapshot and has
> since drifted — notably it uses the pre-2026 PMS vocabulary ("collegium", "chairman
> review"), which was never the shipped state machine.
>
> **For current system state, read `docs/engineering/app.md`, `docs/engineering/system_design.md`, and
> `docs/engineering/FEATURES.md` instead.** Planned work now lives in
> `docs/roadmap/sources/IMPROVEMENT-PROPOSALS.md` (P1–P10) and `docs/roadmap/VISION-ARCHITECTURE.md`.

> Holistic feature review + overhaul plan toward a document-collecting, LLM-queryable institutional portal.
> Implement in tranches (T0–T6). Each tranche independently shippable.

---

## 1. Current Feature Inventory (as-built review)

### Platform / Auth
| Feature | State | Review |
|---|---|---|
| Supabase Auth + composite roles (14) + `active_role` switcher | Solid | Role switcher in Layout works. Auto-register trigger → `DefaultUser`. |
| Access Requests (`/admin/access-requests`, PendingAccessView) | Works | Good onboarding entry, but no notification to admins on new request. |
| Setup Wizard, forced password change | Works | Dev-friendly. localStorage fallback deprecated for prod (known). |
| Command palette (Ctrl+K), notifications bell, theme/density | Works | Palette is power-user only; first-time users never discover it. |

### HR Analytics & Data Ops
| Feature | State | Review |
|---|---|---|
| Human Capital + Staff Analytics + StaffDetail | Rich | Analytics read-only; good for Director/HR. |
| Project Staff roster + analytics | Works | |
| PhD Tracker + analytics | Works | Student role sees own slice. |
| Divisions + analytics | Works | Director/admin only. |
| Recruitment + analytics | Works | HR-only. |
| Data Management (Excel/CSV upload, cleaning UI, Manage Records CRUD) | Works | The data backbone. Excel-mirrored CamelCase columns = known debt. |
| IRINS Sync (publications/patents/awards mirror) | Phase 1 | Server-side script (`npm run sync:irins`), metadata only — **no full-text PDFs**. |

### Research Ops
| Feature | State | Review |
|---|---|---|
| Projects + ProjectDetail + analytics | Works | **No progress-report capability** — projects are static records after creation. |
| Proposals (DRAFT→…→OM_ISSUED→LINKED, PDF uploads 25MB, own bucket) | Solid | Full state machine, RPC transitions, storage. Best-designed module; template for others. |
| Facilities/Instruments + AMC + detail | Works | Technician-scoped. |
| Intelligence (scientific outputs + IP) | Works | Metadata-only analytics. |

### Governance
| Feature | State | Review |
|---|---|---|
| PMS (cycles, collegiums, wizard 13-section report, annexures, signature, scoring, chairman/EC queues, audit log, PDF export) | Solid | Complete state machine via SECURITY DEFINER RPCs. Finalized PDFs are **not filed anywhere queryable**. |
| Committees (meetings, agenda, minutes, action-item kanban, document uploads) | Works | Minutes/docs uploaded ad hoc — own uploader, own storage path. |
| Helpdesk (tickets, routing, analytics) | Works | ALL_ROLES; good universal utility. |
| Calendar (derived events + holidays admin) | Works | |

### Structural findings (the review's core)

1. **Fragmented document handling — #1 blocker for RAG.** Four independent upload implementations: `lib/proposals/storage.ts` (bucket `proposal-documents` + `proposal_documents` table), `components/committees/DocumentUploader.tsx`, `components/pms/AnnexureUpload.tsx`, `components/pms/SignatureUpload.tsx`. No shared `documents` table, no common metadata (owner, division, doc_type, confidentiality), no single ingestion tap point.
2. **Missing data sources for the stated goal.** No project progress reports module. No expertise/CV documents. No publication full-texts (IRINS = metadata only). PMS work reports exist but the finalized artifact isn't captured as a document.
3. **Triple source of truth for access**: `NAV_SECTIONS.allowedRoles` (Layout), route-level `ProtectedRoute allowedRoles` (App.tsx), and RLS. They drift — e.g. `/staff` has **no route-level role guard**; nav hides it from HOD/Scientist but the URL opens for any authenticated user. RLS is the real gate but the page renders assuming full data.
4. **First-time UX is data-first, not task-first.** Dashboards land on KPIs. A new Scientist doesn't see "your PMS report is due", "proposal revision requested", "2 action items assigned". Actions are scattered across PMS queue pages, proposals list, committee kanbans, helpdesk.
5. **HOD role under-served**: nav gives HOD only Dashboard, Calendar, Proposals, Committees, Helpdesk, PMS. No staff or projects visibility for their department.
6. **Analytics are siloed per entity** (8 separate `*Analytics` pages). No cross-entity questions ("which division's externally-funded projects produced the most papers?"). This is exactly the hole the NLP/RAG layer fills — don't build more dashboards.

---

## 2. Overhaul Design Principles

1. **Task-first, role-scoped IA.** Every role lands on **My Actions** (unified inbox) + role dashboard. Mental model: *My Work → My Unit → Institute → Admin*. Rename/regroup nav accordingly.
2. **One document spine.** Single `documents` registry table + one storage convention + one `<DocumentUpload>` primitive. Every module files into it. Registry = RAG ingestion queue source.
3. **One access truth.** Route guards derived from the same config as nav (extend `constants/roleRoutes.ts` into a single `ACCESS_MAP` consumed by both App.tsx and Layout.tsx). RLS remains the hard gate.
4. **Workflows produce documents automatically.** Users shouldn't "upload to the RAG" — finishing a workflow (finalize PMS report, submit progress report, approve proposal) files the artifact.
5. **NLP layer answers, dashboards orient.** Stop adding analytics pages; add the query surface.

---

## 3. New Features (features first)

### F1 — Unified Document Registry
- `documents` table: `id, entity_type, entity_id, doc_type, title, storage_path, file_name, file_size, mime, owner_id, division_code, access_tier, uploaded_at, ingest_status`.
- `access_tier`: `institute | division | owner | confidential` → mirrored in RLS + storage policies.
- One bucket (`documents/`) with `entity_type/entity_id/` path convention; existing buckets migrated or aliased.
- Shared `src/lib/documents/` (upload, signed URL, list-by-entity) + `src/components/ui/DocumentUpload.tsx`.
- `ingest_status`: `pending | processing | indexed | failed | skipped` — the RAG queue is just this column.

### F2 — Project Progress Reports
- `project_reports` table (snake_case, like PMS): `project_id, period_type (Q/H/Y), period_label, due_date, status (DRAFT→SUBMITTED→REVIEWED), structured fields (objectives progress, milestones, expenditure summary, outcomes), remarks`.
- PDF annexure via F1. Auto-schedule report due-dates when proposal hits `LINKED`/project created.
- Reviewer = HOD/DivisionHead → Director visibility. Reuse proposals module patterns (state machine + RPC transitions).

### F3 — PMS artifact filing
- On `pms_finalize_report`, generate/register the report PDF in F1 registry (`entity_type='pms_report'`, tier `confidential` or `owner+committee`).
- Annexures re-pointed at F1.

### F4 — Publications full-text
- Extend IRINS sync: new publication detected → notification to author → author uploads accepted manuscript/preprint PDF via F1 (`entity_type='publication'`).
- Expertise/CV: scientist profile page gains "Expertise documents" section (F1, `entity_type='staff_profile'`).

### F5 — My Actions inbox
- `v_my_actions` DB view (or client aggregation in DataContext) unioning: pending PMS evaluations/submissions, proposal reviews/revisions, progress reports due, assigned action items, open tickets, access requests (admins).
- Rendered at top of every role dashboard. Deep-links to the owning module.

### F6 — RAG Ingestion Service (server-side, separate from SPA)
- Small worker (FastAPI or Node) on the institute server next to OpenLLM.
- Poll/webhook on `documents.ingest_status='pending'` → download from Supabase Storage (service key) → parse (PyMuPDF / unstructured; OCR fallback for scans — government PDFs are often scanned) → build **PageIndex tree** (hierarchical TOC-style node tree, node summaries generated by OpenLLM) → store tree JSON in `doc_indexes (document_id, tree jsonb, model, built_at)`.
- PageIndex is vectorless (reasoning-based tree traversal) → **no vector DB required**. Keep pgvector as optional later hybrid, not in MVP.
- Corpus level: `collection_indexes` — per-collection (e.g. "2025 progress reports", "Division X publications") doc-summary layer so cross-document traversal starts at collection → document → tree node.

### F7 — Ask SURYA (query surface)
- Chat page + palette entry. Request → RAG service `/query` with user JWT.
- **Router step** (OpenLLM): classify question → (a) *structured*: answered from analytics via whitelisted SQL template functions (never free-form text2SQL against prod in v1) → (b) *document*: PageIndex traversal over documents the requester's role/tier permits → (c) *hybrid*.
- Answers carry citations: document title + node/page reference, deep-link to signed URL.
- Role scoping enforced server-side: service filters candidate docs by the caller's `access_tier` rights *before* traversal.

### F8 — RAG Admin console
- Ingestion monitor (per-doc status, retry, re-index), index freshness, query log, ACL audit (who asked what, which docs answered). SystemAdmin/MasterAdmin only.

---

## 4. Workflows (second)

| # | Workflow | Trigger → steps → artifact |
|---|---|---|
| W1 | Proposal lifecycle | Scientist drafts → uploads proposal PDF (F1) → SUBMITTED → review chain → OM_ISSUED → LINKED creates project + schedules W2 reports. Docs auto-ingested at SUBMITTED. |
| W2 | Progress reporting | Due date approaches → My Actions + notification → scientist submits structured report + PDF → HOD reviews → REVIEWED → ingest. |
| W3 | PMS appraisal | Existing state machine unchanged → FINALIZED files PDF to registry (confidential tier) → ingest into restricted index. |
| W4 | Publication capture | IRINS sync finds new paper → action item to author → full-text upload → ingest (institute tier). |
| W5 | Expertise profile | Scientist edits profile + uploads CV/expertise docs → ingest → powers "who knows X?" queries. |
| W6 | Ask SURYA | Any role asks NL question → router → analytics answer or document deep-dive with citations, scoped to role. |
| W7 | RAG ops | Admin monitors ingestion, re-indexes on model upgrade, audits access. |

---

## 5. Stakeholder Usability (CSIR/government context)

| Stakeholder | Today | Overhaul target |
|---|---|---|
| Scientist | Must discover PMS/proposals/helpdesk separately | Lands on My Actions: due reports, revisions, evaluations. ≤2 clicks to any submission. |
| HOD | Nav-starved (no staff/projects view) | Department-scoped staff + projects + progress-report review queue. |
| DivisionHead | Analytics-heavy | Same as HOD + division analytics + Ask SURYA. |
| Director | KPI dashboards | My Actions (chairman queue, approvals) + Ask SURYA as primary interface ("show me delayed externally-funded projects"). |
| HR/Finance/System Admin | Data Management works | + RAG admin console, access-request notifications. |
| Technician | Instruments only | Fine — add AMC-due actions to inbox. |
| EC member (external) | CommitteeQueue | Keep queue-only minimal UX; no clutter. |
| Student/ProjectStaff/Guest | Thin views | Fine — thin is correct. |

Government-environment specifics to honor: self-hosted OpenLLM = data residency ✔ (no external API for confidential PMS/proposal content); scanned-PDF OCR is mandatory (office memoranda are scans); audit trails already exist (extend to query log); slow networks → code-splitting already done, keep chat page light; retention — never hard-delete registry rows, use `ARCHIVED`.

---

## 6. Tranche Plan

### T0 — Foundation hardening (small, do first)
- Single `ACCESS_MAP`: one config drives nav + route guards; add missing route-level guards (`/staff`, etc.).
- My Actions inbox (F5) on all dashboards.
- Per-role first-visit empty states ("What you can do here").
- **Verify:** each role's nav == reachable routes; new user of each role sees actionable landing.

### T1 — Document Registry (F1)
- Migration: `documents` table + RLS by tier + one bucket + policies.
- `src/lib/documents/` + `<DocumentUpload>` primitive.
- Migrate proposals storage to registry (compat view or dual-write during transition); re-point committees uploader + PMS annexures.
- **Verify:** all four legacy upload paths write registry rows; signed-URL download respects tier RLS.

### T2 — Progress Reports (F2) + PMS filing (F3)
- `project_reports` + RPC state machine + review workflow + auto-scheduling on project link.
- PMS finalize files PDF to registry.
- **Verify:** report due → inbox → submit → HOD review → registry row `ingest_status=pending`.

### T3 — Publications & expertise (F4)
- IRINS-triggered upload prompts; profile expertise docs section.
- **Verify:** new IRINS pub → action item → uploaded PDF in registry.

### T4 — RAG ingestion MVP (F6, server-side)
- Worker service + parser + OCR + PageIndex tree builder against OpenLLM; `doc_indexes` table; retry/failure handling.
- RAG admin monitor page (F8 minimal).
- **Verify:** upload doc → `indexed` within N min; tree JSON inspectable; scanned PDF OCRs.

### T5 — Ask SURYA (F7)
- `/query` endpoint: router → whitelisted analytics functions | PageIndex traversal → cited answer.
- Chat page, role-scoped doc filtering server-side.
- **Verify:** structured Q answered from DB; document Q answered with correct citation; Scientist cannot elicit another scientist's confidential PMS content.

### T6 — Scale & quality
- Corpus/collection indexes for cross-document questions; query log + feedback (👍/👎) loop; eval set of ~50 gold Q&A; optional pgvector hybrid if traversal latency/quality demands; re-index tooling.
- **Verify:** eval-set accuracy tracked per release.

---

## 7. Explicit non-goals (for now)
- No free-form text2SQL against production tables (whitelisted query functions only).
- No vector DB in MVP (PageIndex is reasoning-based; add hybrid only if evals demand).
- No renaming of HR CamelCase columns (existing known debt, separate task).
- No mobile app; responsive web suffices.

# SURYA — Product Specification

_Status: current as of 2026-11-21. Describes what is built, not what is planned; planned
work is explicitly labelled **Planned**._

| | |
|---|---|
| **Product** | SURYA — institutional management, R&D lifecycle, and intelligence portal |
| **Customer** | CSIR-AMPRI (Advanced Materials and Processes Research Institute), Bhopal — a CSIR national laboratory |
| **Form factor** | Single-page web application (React 19 SPA) over a Supabase/PostgreSQL 17 backend, plus an on-premise Python AI service and capture worker |
| **Deployment target** | One institute-owned Windows Server; static SPA behind nginx, AI/capture services as Windows services (NSSM), database on hosted or self-hosted Supabase |
| **Feature catalogue** | [FEATURES.md](FEATURES.md) — per-feature "what it does, who uses it, where to find it, and how it works". This document does not repeat it |

---

## 1. Problem

A CSIR laboratory's institutional record is spread across artefacts that never meet:
Excel rosters maintained by HR, project sheets from Finance, appraisal proformas circulated
as Word documents, committee minutes in shared folders, MoUs in filing cabinets, and PDFs
of sanction orders in mailboxes.

Three consequences follow, and all three are what SURYA exists to remove:

1. **No single answer.** "How many active projects does CMPD run, and who leads them?"
   requires three people and a day — and different sheets rarely quote the same number.
2. **Appraisal & project compliance live on paper.** The CSIR scientist appraisal (PMS), Annual Work Plans (Part V), project proposals, re-appropriation/extension packs, and committee COI declarations run through disconnected forms with no audit trail, no deadline enforcement, and no unified record spine.
3. **Institutional memory is unqueryable.** The documents that hold the actual knowledge
   (proposals, completion reports, minutes, sanction orders) are unsearchable beyond filename.

## 2. Vision

One portal where every staff member logs in and sees a role-scoped slice of the institute:
their own data, their division's data, or the whole institute — decided by the database,
not by the UI. Every official number comes from one shared metric registry, every institutional workflow produces its own audit trail as a by-product of work, and every document that enters the system becomes queryable in natural language, with citations, without leaving the premises.

## 3. Core differentiator

Three properties together, none of which is individually novel:

**(a) The database is the only access boundary.**
Row-Level Security is enforced across all 121 tables in `public`. Navigation and route guards exist for
usability, not security — an attacker who bypasses both still sees only their own rows.
Every state transition that matters (PMS appraisal, AWP approval, proposal review & sanction, project funds/changes/closure, publication clearance, contribution requests, ticket routing) runs as a guarded `SECURITY DEFINER` function with its own authorization block, so the client cannot drive a workflow by patching a status column.

**(b) Grounded, on-premise document & metric intelligence.**
Ask SURYA answers questions over institute documents using a hierarchical
[PageIndex](https://github.com/VectifyAI/PageIndex)-style tree rather than vector embeddings,
and queries structured numbers through 18 whitelisted Python analytics functions (including the unified `metrics` registry).
The model runs locally (Ollama) — institute text never leaves the network. The answer
path holds a **refusal invariant**: an answer either cites the document nodes it was built
from, or it is the literal string _"Not found in institute documents."_ There is no
ungrounded generation path. Crucially, the query API reads with the **caller's own JWT**,
so a user's question can never surface a document or row RLS would have hidden from them.

**(c) One identity model spanning operations, projects, and appraisal.**
The same `user_roles` composite-role record (plus dated `acting_assignments` and `feature_grants`) drives the HR dashboard, the PMS evaluation queue, the PME project desk, committee COI workflows, contribution requests, and the helpdesk routing table. A person who is simultaneously a Scientist and a Division Head holds both roles and switches `active_role`; they do not hold two accounts.

## 4. Users

Fifteen roles, held in composition (`user_roles` has PK `(user_id, role)`), with one
`active_role` in `user_profiles` driving the current dashboard (plus temporary dated `acting_assignments` for `HOD`, `DivisionHead`, and `Director`).

| Role | Primary job in SURYA |
|---|---|
| `Director` | Institute-wide cockpit; empowered-committee chair; proposal/change/AWP/publication approvals; acting charge orders |
| `DivisionHead`, `HOD` | Division-scoped analytics, staff, projects, PhD, proposals, progress reports, AWP RO review, publication clearance |
| `Scientist` | Own PMS report & AWP, personal research profile (`/me`), project proposals & Project File, progress reports, publication files, Ask SURYA |
| `Technician` | Division instruments, usage logbooks, publication files, committees, lessons learned |
| `HRAdmin` | Staff & sanctioned posts, workforce planning, career events, recruitment funnel, data imports, PMS cycle & AWP administration |
| `FinanceAdmin` | Project expenditure, portfolio & burn-rate variance, proposals & change-request finance steps, partnerships |
| `PME` | Project Monitoring & Evaluation office — owns the full project lifecycle from proposal vetting to sanction, funds, milestones, monitoring, changes, closure, archive, and CPD reporting; not an admin |
| `SystemAdmin` | User/role administration, access requests, data imports, people links, IRINS sync, RAG ingestion monitor, holidays |
| `MasterAdmin` | Superuser across all institute workflows plus CSIR Rules (`/admin/rules`), runtime Feature Controls, and per-user feature grants |
| `EmpoweredCommittee` | Final PMS scoring & panel concurrence queue |
| `Student` | Own PhD milestone record, Ask SURYA, calendar, My Work, helpdesk |
| `ProjectStaff` | Own project-staff record, Ask SURYA, calendar, My Work, helpdesk |
| `Guest`, `DefaultUser` | Unverified identities; excluded from Ask SURYA, My Work, and all institute knowledge until an admin approves a real role |

`Guest`/`DefaultUser` are a deliberate quarantine tier: `ACCESS_MAP` derives `VERIFIED` as
"all roles minus these two" and gates the AI layer and detail routes on it (`src/constants/access.ts`).

## 5. Capability map

Forty-eight access-controlled feature paths in `ACCESS_MAP` ([src/constants/access.ts](../../src/constants/access.ts)), driving both the sidebar and route guards.

| Group | Capabilities |
|---|---|
| **Platform & Access** | Login + OTP fallback, composite roles + role switching, acting charges, access requests, forced password change, command palette (`Ctrl+K` / `Cmd+K` with record + document title search), theme/density, runtime feature kill-switches + per-user feature grants, CSIR Rules engine |
| **My Work & Profile** | Unified `My Actions` dashboard inbox, Contribution Requests (`/work` + daily staleness sweep), Notification Bell (nightly deadlines, weekly Monday metric digests, one-click AI record suggestions), Staff Research Profile (`/me` self-service + IRINS matching + 1-page CV & Nomination Brief PDFs) |
| **HR & Workforce** | Staff roster + dossier + analytics, sanctioned posts register + career event import, workforce planning (retirement horizon & workload), project staff roster + §3.3 rule-checked engagements, divisions + snapshot scorecards + Research Council pack PDF, PhD tracker + milestones, recruitment stage-gated funnel, expertise finder + shortlist PDF |
| **Research Operations (PL0–PL7)** | PME desk (`/pme`), private proposal workspace (autosave, notes, versions, readiness, duplication check, comparable projects), track-specific review chains (`ULIP`, `HQ`, `EFP`, `OLP`), sanction-to-project creation, modular Project File (Overview, Monitoring + stage gates + ad-hoc review calls, Funds + browser OCR release-order reader + multi-lab tracking + HQ paper packs + legacy balances, Milestones, rule-enforced Changes, Closure + Lessons + archive), Portfolio health view, Lessons Learned archive, progress reports, publication files & consents, facilities + major-equipment usage logbook, partnerships (MoUs, tech transfers), R&D monitor |
| **Appraisal (PMS & AWP)** | Appraisal cycles + Nov 30 lock, 2026 Annexure-A proforma ("Fill from my records", Part I prefill/verification, Questionnaire A & Pay Level 13+ Questionnaire B, Appendix-A I–V), Annexure-I & Annexure-II senior/Director tracks, Evaluation Committee single panel score + quorum + 15-item pen picture, Empowered Committee concurrence, 15-day representation / grievance committee / deemed acceptance, Annexure-B timeline & DG delay PDF, standalone Part V AWP (`/pms/awp`, RO → RvO → Director inbox, offline browser PDF/Tesseract OCR import, register) |
| **Institutional Governance** | Committees + meetings + agendas + rule-lockable minutes + action-item Kanban + COI Format 1/2 declarations & Annexure 3 PDF, helpdesk tickets with category routing, calendar + holidays, merged HR + PMS audit log |
| **Intelligence & Ask SURYA** | Ask SURYA streaming Q&A (`/ask`) with 18 whitelisted analytics functions + PageIndex document citations + entity-scoped `context_entity` ("Ask about this") + scheduled briefs, Research Intelligence (commercialization, patent funnel, emerging themes, collaboration), 2D Explore Graph, unified 12-metric registry, connected chart-to-list analytics |
| **Data Operations & Capture** | Excel/CSV import with AI-assisted `/map-columns` + cleaning UI, People/Identity Links resolution (`/data/links`), Data Freshness Ledger + stewards, harvested-import review queue, unified `documents` registry (7 storage buckets, 4 access tiers), RAG ingestion monitor, IRINS/Vidwan profile sync, watched-folder & mail-in capture workers (`ingest/`) |

## 6. Key user flows

Sequence-level detail lives in [system_design.md](system_design.md). This is the narrative.

### 6.1 Scientist annual appraisal & Annual Work Plan (2026 guidelines)
- **Part V AWP:** Scientist fills and submits their Annual Work Plan for the upcoming year at `/pms/awp` (due May 15); it routes through Reporting Officer → Reviewing Officer → Director at `/pms/awp/inbox` (revisions allowed until September 30 with Director approval). HR can also batch-import signed/scanned AWP PDFs via local browser OCR at `/pms/awp/import`.
- **Annual Report:** Scientist opens `/pms/reports/new` during an `OPEN` cycle → the track (`STANDARD` 2026 proforma, `ANNEXURE_I`, or `ANNEXURE_II`) is resolved server-side from designation → Establishment pre-fills Part I and the scientist confirms records or flags discrepancies → **"Fill from my records"** pulls confirmed projects, papers, patents, students, and committees of the reporting year → scientist completes Questionnaire A (plus Questionnaire B for Pay Level 13+), Appendix-A/B sections, uploads annexures/signature, and submits via `pms_submit_report` (fewer than 90 duty days transitions to `NOT_ASSESSED`).
- **Evaluation & Finalization:** HR assigns the grade-appropriate Evaluation Committee → the Reporting Officer records the committee's single integer panel score (0–100), quorum, 15-item behavioural pen picture, and Appendix-B integrity entry → Empowered Committee concurs, upgrades, or downgrades with reasons & quorum → once finalized, the scientist has 15 days from `score_communicated_at` to file a representation before it is deemed accepted; cycles lock hard after November 30.

### 6.2 Proposal to Project Closure & Archive (`PL0–PL7`)
- **Drafting:** Researcher starts a private draft on the dashboard *Start Idea* card or `/proposals/new` → writes across 5 autosaved sections with private notes, version snapshots, readiness meter, Year × Head budget lines, PDF print for signature, and **Check for similar work** (`/similar`) + comparable completed projects → uploads signed scan and submits.
- **Review & Sanction:** Proposal advances through its track-specific chain (`ULIP`, `OLP`, `HQ`, or `EFP`), with reviewers commenting by section and seeing diffs on resubmission → `PME` records the sanction order, automatically creating the linked `projects` row, sanctioned budget lines, and scheduled monitoring/progress-report slots.
- **Execution, Changes & Closure:** First fund receipt transitions the project from `SANCTIONED` to `ACTIVE`. PME tracks receipts (with browser OCR release-order reading), expenditures/reversals, multi-lab splits, HQ paper packs, milestones, stage gates, and reviews; PIs submit milestone progress, CSIR-guideline-checked change requests, and completion reports. Once closed and approved, PME **publishes & archives** the completion report PDF into Ask SURYA and turns the file read-only while feeding **Lessons Learned** (`/lessons`).

### 6.3 Ask a question about the institute (or a specific record)
User types a question at `/ask` — or clicks **"Ask about this"** from a project, staff, division, or instrument page (passing `context_entity`) → the query service classifies the intent (`structured` / `document` / `hybrid`):
- `structured` executes one of **18 whitelisted Python analytics functions** against RLS-scoped tables (including `metric` from the 12-metric registry).
- `document` traverses `collection_indexes` → `doc_indexes` → `doc_pages` and synthesizes strictly from retrieved text.
The answer streams back over SSE (`/query/stream`) with clickable page-level citations opening signed Storage URLs. Users can rate answers (👍/👎), label routes (admins), or save recurring **Scheduled Briefs** (`scheduled_queries`) delivered by `worker.py --briefs` to the Notification Bell.

### 6.4 Institutional data arriving & staying fresh
Data arrives via admin Excel/CSV uploads at `/data` (with optional AI column mapping at `/map-columns` confirmed by a human and remembered by header fingerprint), automated harvesting via `ingest/` watched folders / IMAP mailbox into `harvested_imports`, or targeted **Contribution Requests** (`/work`) routed to data stewards and reviewed as field-by-field diffs. Non-spreadsheet files (PDFs, scans) enter `documents` (`ingest_status = 'pending'`) and are indexed automatically by `rag/worker.py`.

## 7. Implementation phases

### Shipped
| Phase | Content |
|---|---|
| **T0–T3** | SPA foundation, Supabase wire-up, composite RBAC, role dashboards, HR analytics, PMS base workflow, committees, helpdesk, calendar, recruitment |
| **T4–T6** | RAG ingestion worker (`doc_indexes` + `doc_pages`), Ask SURYA (`/query`, `/query/stream`, `/similar`, `/map-columns`), collection indexes, `rag/eval` harness, feedback & route labels |
| **Phase A/B ingest** | Import events, field-mapping memory, harvested-import review queue, watched-folder and mail-in capture workers (`ingest/`) |
| **Security & Senior PMS (2026-07)** | Privilege-escalation fix, `SECURITY DEFINER` authorization audit + CI gate, RLS read scoping, Annexure-I & Annexure-II senior/Director PMS tracks |
| **Operating Model & AWP (2026-10/11)** | Contribution Requests & My Work (`/work`), Data Stewards & freshness cadences, feature grants, standalone Part V Annual Work Plan (`/pms/awp*`) with offline browser PDF/Tesseract OCR import |
| **Project Lifecycle PL0–PL7 (2026-11)** | `PME` role & desk, private proposal workspace & review chains, Funds/Milestones/Monitoring/Changes/Closure/Legacy panels, Portfolio view (`/portfolio`), Lessons Learned (`/lessons`), HQ paper packs, Stage gates, CPD half-yearly report |
| **Enterprise AI-Native P1–P9 (2026-11)** | CSIR Rules engine (`/admin/rules`), Identity Links (`/data/links`), Staff Research Profile (`/me` + self-service + CV/Nomination PDFs), Committee COI + Annexure 3, Equipment Usage Logbook, PMS 2026 Annexure-A proforma + Part I + 15-item pen picture + single panel score, Sanctioned Posts + Workforce Planning + Acting Charges + §3.3 Project Staff Engagements, Expertise Finder (`/expertise`), 12-Metric Registry + snapshots + weekly digests, AI Bell Actions + `context_entity` + Release Order OCR, `EFP`/`OLP` schemes + Multi-lab accounting + Publication Files (`/publication-files`) |

### Planned (not built)
- Multi-level PageIndex trees (current trees are one level deep) and remaining RAG retrieval upgrades ([IMPROVEMENT-PROPOSALS.md](../roadmap/sources/IMPROVEMENT-PROPOSALS.md)).
- Watched-folder / mail-in capture **in production** — the workers exist and are tested, but the institute folder share and mailbox are unprovisioned infrastructure; mail-in acknowledge-after-land hardening remains open ([TODOS.md](../../TODOS.md)).
- Remaining roadmap packages in [ROADMAP.md](../roadmap/ROADMAP.md) (including Committee Module `CM*` expansions, role-specific home overhauls `SH*`/`HH*`/`DH*`, Common Desk `CD*`, and EFP 2017 rule packs / assessment-promotion files when guidelines arrive).

**Long-horizon target.** [VISION-ARCHITECTURE.md](../roadmap/VISION-ARCHITECTURE.md) remains the standing north-star architecture beyond the current system; several foundational record-spine pieces (identity linking, entity timelines, rules engine, unified metrics) shipped in Enterprise P1–P9, while federation and broader phases remain future work.

### Known operational caveat
The RAG stack is verified end-to-end, and its production host requires environmental provisioning: migrations applied via `supabase db push`, native Python DLLs allowed past WDAC / Smart App Control, `SUPABASE_SERVICE_KEY`, and a GPU-backed Ollama host (CPU-only Ollama takes minutes per question — see [deploy/README.md](../../deploy/README.md#model-host-sizing-read-before-choosing-hardware)).

## 8. Non-goals

Explicit, so nobody builds them by accident:

- **Not a payroll or finance system of record.** Project funds, receipts, and expenditure are tracked and audited against sanction; no money moves through SURYA.
- **No server-rendered pages.** The SPA is static files. `HashRouter` is deliberate so it can be served from any static host without rewrite rules.
- **No Node.js API or Supabase Edge Functions tier.** Business rules live in PostgreSQL functions and pure TypeScript modules under `src/lib/`. The only HTTP service is the Python AI layer (`rag/`).
- **No free-form SQL from the language model.** Structured questions may only invoke a function present in `analytics.CATALOG`; that membership check is the guarantee.
- **No ungrounded answers.** If retrieval produces nothing, the system refuses. It does not fall back on the model's own knowledge.
- **No anonymous or public access.** `anon` has been explicitly dropped from default ACLs and public signup is disabled.
- **No native mobile app.** The SPA is responsive (mobile/tablet/desktop breakpoints in `UIContext` with `desktopOnly` guards on heavy authoring/admin routes); there is no separate mobile client.
- **Not a general document management system.** The `documents` table is a registry and RAG ingest queue, not a versioned DMS.

## 9. Glossary

| Term | Meaning |
|---|---|
| **PMS** | Performance Management System — the CSIR scientist appraisal workflow |
| **AWP** | Annual Work Plan (Part V) — scientist's yearly target plan submitted before May 15 and reviewed via RO → RvO → Director |
| **Cycle** | An appraisal period (`appraisal_cycles`), `OPEN` / `CLOSED` / `ARCHIVED`, hard-locked after Nov 30 |
| **Track (PMS)** | Which proforma a report uses: `STANDARD` (Sci B–F, 2026 Annexure-A), `ANNEXURE_I` (senior), `ANNEXURE_II` (Director) |
| **Track / Scheme (Project)** | Proposal & project funding track: `ULIP` (In-house), `HQ` (CSIR HQ), `EFP` (Externally Funded), `OLP` (Lab Seed) |
| **PME** | Project Monitoring & Evaluation office — owns the project lifecycle from submission to archive (non-admin role) |
| **Evaluation Committee** | Tiered panel (I → Sci B/C/D, II → E, III → F) that records the single panel score and 15-item pen picture |
| **Empowered Committee** | Per-cycle body that concurs, upgrades, or downgrades the final score |
| **Representation** | A scientist's formal objection to a finalized score, within 15 days (otherwise deemed accepted) |
| **CSIR Rules** | Effective-dated guideline thresholds (`csir_rules`) with OM citations governing budgets, overruns, tenure, and compliance |
| **Contribution Request** | Owned update ask on an institutional record (`/work`), routed to data stewards and committed only after field-diff review |
| **Stage Gate** | Milestone/go-kill governance checkpoints (`I`–`VI`) required for HQ `FTT` / `FTC` / `MMP` projects |
| **PageIndex** | Hierarchical document tree (sections with summaries + page spans) used instead of embeddings |
| **Collection** | A rollup summary over all documents of one `entity_type`, used as the first retrieval stage |
| **Refusal invariant** | Every non-refusal answer carries citations; anything else becomes the refusal string |
| **Access tier** | Per-document read scope: `institute` / `division` / `owner` / `confidential` |
| **IRINS** | Indian Research Information Network System — external scientist profile source, keyed by `VidwanID` |
| **OM** | Office Memorandum — the sanction or policy document governing proposals and CSIR rules |

# SURYA — Product Specification

_Status: current as of 2026-08-08. Describes what is built, not what is planned; planned
work is explicitly labelled **Planned**._

| | |
|---|---|
| **Product** | SURYA — institutional management and intelligence portal |
| **Customer** | CSIR-AMPRI (Advanced Materials and Processes Research Institute), Bhopal — a CSIR national laboratory |
| **Form factor** | Single-page web application (React 19 SPA) over a Supabase/PostgreSQL backend, plus an on-premise Python AI service |
| **Deployment target** | One institute-owned Windows Server; static SPA behind nginx, AI services as Windows services, database on hosted Supabase |
| **Feature catalogue** | [FEATURES.md](FEATURES.md) — per-feature "who can do it and how". This document does not repeat it |

---

## 1. Problem

A CSIR laboratory's institutional record is spread across artefacts that never meet:
Excel rosters maintained by HR, project sheets from Finance, appraisal proformas circulated
as Word documents, committee minutes in shared folders, MoUs in filing cabinets, and PDFs
of sanction orders in mailboxes.

Three consequences follow, and all three are what SURYA exists to remove:

1. **No single answer.** "How many active projects does CMPD run, and who leads them?"
   requires three people and a day.
2. **Appraisal is paper.** The CSIR scientist appraisal (PMS) is a multi-stage workflow —
   self-report, evaluation committee, empowered committee — executed on paper with no
   audit trail, no deadline enforcement, and no way to prove who scored what and why.
3. **Institutional memory is unqueryable.** The documents that hold the actual knowledge
   (proposals, minutes, reports) are unsearchable beyond filename.

## 2. Vision

One portal where every staff member logs in and sees a role-scoped slice of the institute:
their own data, their division's data, or the whole institute — decided by the database,
not by the UI. Every institutional document that enters the system becomes queryable in
natural language, with citations, without the document ever leaving the premises.

## 3. Core differentiator

Three properties together, none of which is individually novel:

**(a) The database is the only access boundary.**
Row-Level Security is enforced on all 65 tables. Navigation and route guards exist for
usability, not security — an attacker who bypasses both still sees only their own rows.
Every state transition that matters (appraisal submission, proposal approval, ticket
routing) runs as a `SECURITY DEFINER` function with its own authorization block, so the
client cannot drive a workflow by patching a status column.

**(b) Grounded, on-premise document intelligence.**
Ask SURYA answers questions over institute documents using a hierarchical
[PageIndex](https://github.com/VectifyAI/PageIndex)-style tree rather than vector embeddings.
The model runs locally (Ollama) — institute text never leaves the network. The answer
path holds a **refusal invariant**: an answer either cites the document nodes it was built
from, or it is the literal string _"Not found in institute documents."_ There is no
ungrounded generation path. Crucially, the query API reads with the **caller's own JWT**,
so a scientist's question can never surface a document RLS would have hidden from them.

**(c) One identity model spanning operations and appraisal.**
The same `user_roles` composite-role record drives the HR dashboard, the PMS evaluation
queue, the proposal approval chain, and the helpdesk routing table. A person who is
simultaneously a Scientist and a Division Head holds both roles and switches active role;
they do not hold two accounts.

## 4. Users

Fourteen roles, held in composition (`user_roles` has PK `(user_id, role)`), with one
`active_role` in `user_profiles` driving the current dashboard.

| Role | Primary job in SURYA |
|---|---|
| `Director` | Institute-wide cockpit; empowered-committee chair; sees everything |
| `DivisionHead`, `HOD` | Division-scoped analytics, staff, projects, PhD, proposals |
| `Scientist` | Own PMS report, project proposals, progress reports, Ask SURYA |
| `Technician` | Division instruments and facilities |
| `HRAdmin` | Staff and division data, imports, recruitment, PMS cycle administration |
| `FinanceAdmin` | Project expenditure, budget variance, proposals |
| `SystemAdmin` | User/role administration, RAG ingestion monitor, IRINS sync, holidays |
| `MasterAdmin` | All of SystemAdmin plus runtime feature controls |
| `EmpoweredCommittee` | Final PMS scoring queue |
| `Student` | Own PhD milestone record |
| `ProjectStaff` | Own project-staff record |
| `Guest`, `DefaultUser` | Unverified identities; excluded from Ask SURYA and all institute knowledge until an admin approves a real role |

`Guest`/`DefaultUser` are a deliberate quarantine tier: `ACCESS_MAP` derives `VERIFIED` as
"all roles minus these two" and gates the AI layer on it (`src/constants/access.ts`).

## 5. Capability map

Thirty-three access-controlled feature paths, grouped. The authoritative list is
`ACCESS_MAP` in [src/constants/access.ts](../../src/constants/access.ts); it drives both the
sidebar and the route guards.

| Group | Capabilities |
|---|---|
| **Platform** | Login, composite roles + role switching, access requests, forced password change, command palette (`Ctrl+K`), theme/density, runtime feature kill-switches |
| **HR analytics** | Staff roster + detail + analytics, project staff roster + analytics, divisions + division analytics, PhD tracker + milestones + analytics, contract staff |
| **Research operations** | Projects + detail + analytics, project proposals (10-state workflow), project progress reports (5-state workflow), R&D monitor, partnerships (MoUs, tech transfers), instruments/facilities, recruitment drives |
| **Appraisal (PMS)** | Appraisal cycles, three report tracks (Standard Sci B–F, Annexure-I senior, Annexure-II Director), report wizard, evaluation committees (tiers I/II/III), evaluator queue, empowered committee queue, grievance/representation, deadline + cycle-lock enforcement, audit log, PDF export |
| **Institutional workflow** | Committees + meetings + agenda + action items + minutes, helpdesk tickets with category-based auto-routing, calendar + holidays |
| **Intelligence** | Ask SURYA (natural-language Q&A with citations), similar-work/duplication check, entity relationship graph, data-health digest, freshness ledger, succession-risk and budget-variance analytics |
| **Data operations** | Excel/CSV import with column-mapping confirmation, harvested-import review queue, unified document registry, RAG ingestion monitor, IRINS profile sync |

## 6. Key user flows

Sequence-level detail lives in [system_design.md](system_design.md). This is the narrative.

### 6.1 Scientist annual appraisal
Scientist opens `/pms/reports/new` during an `OPEN` cycle → the wizard branches by track
(resolved server-side from designation, not chosen by the user) → fills Part I basic
information, Appendix-A sections, and the Part V Annual Work Plan → uploads signature and
annexures → submits. Submission calls `pms_submit_report`, which validates deadline and
duty-days server-side; a scientist with fewer than 90 duty days becomes `NOT_ASSESSED`
instead. An admin assigns an evaluation committee; each member scores independently; when
the last evaluation completes a trigger advances the report to the empowered committee,
which records a final 0–100 score with a mandatory ≥50-character justification. Scores
≥90 or ≤75 require additional written reasons. Once finalized the scientist has 15 days
from `score_communicated_at` to file a representation, which routes to the cycle's
five-member grievance committee.

### 6.2 Project proposal to sanctioned project
Scientist drafts a proposal at `/proposals/new`, optionally running a **duplication check**
that queries the document corpus for prior or ongoing similar work → submits → admin moves
it through review, revision, recommendation, approval, and OM issuance → on issuance the
proposal is linked to a real project number, closing the loop with the projects module.

### 6.3 Ask a question about the institute
User types a question at `/ask` → the query service makes one LLM call to **route** it
(structured / document / hybrid) → structured questions execute one of 17 whitelisted
analytics functions against RLS-scoped tables; document questions descend the PageIndex
trees collection → document → section, fetch the picked pages' source text, and answer
from that context only → the answer streams back with clickable citations that open
signed Storage URLs. Every query is logged with route, latency, and citations; the user
can thumbs-up/down, and admins can label the correct route to feed few-shot examples back
into the router.

### 6.4 Institutional data arriving from divisions
Either a MasterAdmin uploads a spreadsheet at `/data`, or the optional capture worker
harvests it from a watched folder / mailbox. Unrecognized headers are proposed a mapping
by the model, **which a human must confirm** before anything writes; confirmed mappings
are remembered by header fingerprint. Non-spreadsheet files (PDFs, scans) enter the
`documents` registry with `ingest_status='pending'` and are picked up by the RAG worker.

## 7. Implementation phases

### Shipped
| Phase | Content |
|---|---|
| **T0–T3** | SPA foundation, Supabase wire-up, composite RBAC, role dashboards, HR analytics, PMS 2026 guidelines, committees, helpdesk, calendar, recruitment |
| **T4** | RAG ingestion worker — PDF parse, OCR fallback, PageIndex tree build, `doc_indexes` + `doc_pages` |
| **T5** | Ask SURYA `/query` — router, structured analytics catalog, document traversal, citations, query log |
| **T6** | Collection indexes, eval harness (`rag/eval`), router quality labels, feedback |
| **Phase A/B ingest** | Import events, field-mapping memory, harvested-import review queue, watched-folder and mail-in capture workers |
| **Security remediation (2026-07-25/26)** | Privilege-escalation fix, `SECURITY DEFINER` authorization audit + CI gate, baseline grants, RPC `EXECUTE` re-lock, RLS read scoping, `supabase/config.toml` versioning |
| **PMS senior track (2026-07-26)** | Annexure-I (Chief/Outstanding/Distinguished Scientist) and Annexure-II (Director) proformas, pen-picture appraisal, score-free finalization |
| **Streaming + follow-ups** | `/query/stream` SSE, conversation history, `/similar` duplication check, `/map-columns` mapping assistance |

> `docs/history/PMS-SENIOR-TRACK-PLAN.md` still carries a "PLANNED — not yet implemented" banner.
> That banner is stale; the track shipped. See §Gaps in the doc summary.

### Planned (not built)
- Multi-level PageIndex trees (current trees are one level deep) and the P1–P10 upgrade
  briefs in [IMPROVEMENT-PROPOSALS.md](../roadmap/sources/IMPROVEMENT-PROPOSALS.md).
- Watched-folder / mail-in capture **in production** — the workers exist and are tested, but
  the folder share and IT-provisioned mailbox are unprovisioned infrastructure.
- Mail-in acknowledge-after-land hardening ([TODOS.md](../../TODOS.md)).
- The intelligence roadmap in [AHEAD-INTELLIGENCE-MASTER.md](../roadmap/sources/AHEAD-INTELLIGENCE-MASTER.md)
  and [INTELLIGENCE-PHASES.md](../roadmap/sources/INTELLIGENCE-PHASES.md).

**Long-horizon target.** [VISION-ARCHITECTURE.md](../roadmap/VISION-ARCHITECTURE.md) is the standing
north-star document — the institute-memory-spine architecture SURYA is aimed at beyond the
pilot. Nothing in it is implemented; this specification describes the pilot as built.

### Known operational caveat
The RAG stack has been verified module-by-module and end-to-end on a developer laptop, but
its production host requires three preconditions that are environmental, not code:
migrations applied via `supabase db push`, native Python DLLs allowed past WDAC / Smart App
Control, and a GPU-backed Ollama host. On a CPU-only host, expect minutes per question —
measured figures are in [deploy/README.md](../../deploy/README.md#model-host-sizing-read-before-choosing-hardware).

## 8. Non-goals

Explicit, so nobody builds them by accident:

- **Not a payroll or finance system of record.** Project expenditure is reported and
  analysed; no money moves through SURYA.
- **No server-rendered pages.** The SPA is static files. `HashRouter` is deliberate so it
  can be served from any static host without rewrite rules.
- **No Node.js API tier.** Business rules live in PostgreSQL functions and in pure
  TypeScript modules under `src/lib/`. The only HTTP service is the Python AI layer.
- **No free-form SQL from the language model.** Structured questions may only invoke a
  function present in `analytics.CATALOG`; that membership check is the guarantee.
- **No ungrounded answers.** If retrieval produces nothing, the system refuses. It does not
  fall back on the model's own knowledge.
- **No anonymous or public access.** `anon` has been explicitly dropped from default ACLs.
- **No native mobile app.** The SPA is responsive (mobile/tablet/desktop breakpoints in
  `UIContext`); there is no separate mobile client.
- **Not a general document management system.** The `documents` table is a registry and
  RAG ingest queue, not a versioned DMS.

## 9. Glossary

| Term | Meaning |
|---|---|
| **PMS** | Performance Management System — the CSIR scientist appraisal workflow |
| **Cycle** | An appraisal period (`appraisal_cycles`), `OPEN` / `CLOSED` / `ARCHIVED` |
| **Track** | Which proforma a report uses: `STANDARD` (Sci B–F), `ANNEXURE_I` (senior), `ANNEXURE_II` (Director) |
| **Evaluation Committee** | Tiered panel (I → Sci B/C/D, II → E, III → F) that scores a report |
| **Empowered Committee** | Per-cycle body that records the final score |
| **Representation** | A scientist's formal objection to a finalized score, within 15 days |
| **PageIndex** | Hierarchical document tree (sections with summaries + page spans) used instead of embeddings |
| **Collection** | A rollup summary over all documents of one `entity_type`, used as the first retrieval stage |
| **Refusal invariant** | Every non-refusal answer carries citations; anything else becomes the refusal string |
| **Access tier** | Per-document read scope: `institute` / `division` / `owner` / `confidential` |
| **IRINS** | Indian Research Information Network System — external scientist profile source, keyed by `VidwanID` |
| **OM** | Office Memorandum — the sanction document that turns an approved proposal into a project |

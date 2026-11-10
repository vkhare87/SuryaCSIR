# Project Lifecycle — Implementation Plan

_Proposal, 2026-11-10. Item IDs `PL0`–`PL6`. Indexed from [`../ROADMAP.md`](../ROADMAP.md)._

**Goal.** One project file that lives from a scientist's first private draft to the
archive, managed end to end by a dedicated PME role, and read by management as the
institute's record of what was done and what was learned.

**Rule source.** _CSIR Guidelines on Implementation, Monitoring and Financial Governance
of Projects_, OM No. 33/GIM&FGP/2025-CPD dated 25 April 2025 (cited below as "§n").

**Decisions already taken (2026-11-10).**

1. In-house projects stay in scope, as their own track (named **ULIP** here, the scheme
   the institute runs them under today).
2. A dedicated **PME** role manages the whole lifecycle, conception to record keeping.
3. **PME enters funds received.** Expenditure is entered by PME as well (see §4.3).

**Supersedes / absorbs** these roadmap items, which describe slices of the same thing:
WP-18 "Project master file", WP-13 `C2` (milestones), `C3` (evaluation rubric, partly),
`C4` (output ↔ project linkage), and supplies the data WP-11 `C1` (health score) and
`A3` (S-curves) were blocked on.

---

## 1. What exists today (verified against the code, 2026-11-10)

| Area | State | Gap this plan closes |
|---|---|---|
| `proposals` + 9 RPCs | Private draft → submit → review → approve → OM → link. History table. Signed PDF required to submit | Every review step is "any admin". Budget is one number. Drafts are readable by Director / HOD / admins. No versions |
| `projects` | Excel-fed flat table. PK `"ProjectID"`; `"ProjectNo"` is neither unique nor indexed, yet everything joins on it | No history, no budget heads, no stage. Cost and date columns are `text` |
| Proposal → project | `proposal_link_project` needs the project row to exist already (uploaded separately) | Sanction should create the project |
| `project_reports` | Periodic report, reviewed by Director / division manager | Exists only if the PI starts one — a missing report is invisible. `milestones` is free text |
| Committees | `committees`, `meetings`, `agenda_items`, `action_items`, `meeting_documents` | Not linked to any proposal or project |
| Outputs | `scientific_outputs`, `ip_intelligence` have no project column. `mous` / `tech_transfers` have a free-text `linked_project_no` | No "what did this project produce" |
| Status vocabulary | Upload template says `Ongoing / Completed`; 22 code sites test `=== 'Active'` | Dashboards under-count. No constraint |
| `src/lib/intelligence/lifecycle.ts` | Derives a six-stage thread from proposals + projects + reports | Read-only inference; becomes a thin reader over the real `stage` |
| Roles | No PME role. `FinanceAdmin` exists | PME role, §3 |

---

## 2. Design in one page

### 2.1 One record, one stage strip

The proposal and the project are the same file at different stages. The user never
"links" anything: sanction creates the project and carries everything forward.

```
CONCEPT → VETTING → APPRAISAL → SANCTIONED → ACTIVE → CLOSING → CLOSED → ARCHIVED
 (private   (lab)     (RC / HQ)   (OM, funds)  (execute,  (PCR)
  draft)                                        monitor)
                                   side exits: REJECTED · ON_HOLD · FORECLOSED
```

Stages `CONCEPT`–`APPRAISAL` live on `proposals.status` (existing values kept, see §5.1).
Stages `SANCTIONED` onward live on a new `projects.stage` column with a `CHECK`.

### 2.2 Two tracks, one machine

`track` is set at concept and decides which steps are required. Nothing else forks.

| | **ULIP** (in-house) | **HQ scheme** (FIR, FBR, NCP, FTT, FTC, MMP, FCP, HCP, IST — §2.1) |
|---|---|---|
| Vetting chain | PME → Finance → Research Council → Director sanctions | PME → Finance → Director forwards (§4.1) |
| Appraisal | Research Council only (§1.1 excludes these from HQ review) | HQ Level 1 and Level 2 — **recorded, not performed, in SURYA** |
| Sanction document | Director's sanction order | Sanction OM with project number (§4.1.5) |
| Project code | Institute's own numbering | Validated against §2.2 pattern |
| Funds receipt needs | Order no. and date | OM no. and date **and IFD concurrence file no. and date** (§7.2) |
| Stage-gates | Off | On for FTT / FTC / MMP only (§4.2) |
| Review calendar | Research Council half-yearly | By category (§5) |
| Closure | PCR → Research Council | PCR → RC in-principle → Monitoring Committee → DG (§8) |

A third track for externally funded projects can be added later as one more column in
this table; nothing in the model assumes two.

### 2.3 Who does what

| Role | Can |
|---|---|
| Scientist (PI) | Draft and revise privately, add co-PIs, submit, respond to revision requests, file progress reports, raise change requests, draft the PCR |
| **PME** | Everything in §3 — vet, route, record decisions and OMs, create the project, enter funds and expenditure, run the review calendar, process changes, close and archive |
| FinanceAdmin | Finance vetting step; read every ledger |
| HOD / DivisionHead | Read their division's files (not private drafts); comment at vetting |
| Director | Forward / sanction step; call a review on any project; read everything |
| MasterAdmin | Everything PME can, as today's superuser convention |

---

## 3. The PME role

### 3.1 Powers

- Reads every proposal **from submission onward** and every project file.
- Performs or records every stage transition after submission (all through RPCs).
- Owns the `projects` domain: creates, edits, imports legacy rows. `HRAdmin` and
  `SystemAdmin` lose direct write on `projects`, `project_staff`, `mous`,
  `tech_transfers` once `PL0` ships; HRAdmin keeps `staff`.
- Enters fund receipts and expenditure; schedules reviews; places items on committee
  agendas; uploads OMs and minutes.

### 3.2 Guard rails (enforced in SQL, not the UI)

- **Drafts are private.** `proposals_can_read` changes so a `DRAFT` is visible only to
  its creator and named co-PIs. Today Director, division managers and all admins can
  read it.
- **No self-dealing.** A PME user who is PI or co-PI on a file cannot vet it, record its
  sanction, or enter its funds. Same class of bug as the appraisal self-evaluation
  finding — check `auth.uid()` against `pi_user_id` and `proposal_copis` in every RPC.
- **Money is append-only.** Receipts and expenditure are never updated or deleted by a
  client. A mistake is corrected by a reversal entry that names the entry it reverses.
- **PME is not an admin.** It is not added to `proposals_caller_is_admin()`; it gets its
  own `caller_is_pme()` so it gains no HR, appraisal or account-management reach.

### 3.3 Where a new role must be declared

Every one of these lists roles by hand; missing one produces a half-working role.

| File | Change |
|---|---|
| new migration | Widen `user_roles.role` `CHECK`; `admin_set_user_roles` `v_allowed`; add `caller_is_pme()` |
| `src/types/index.ts` | `Role` union |
| `src/constants/access.ts` | `ALL_ROLES`, `ACCESS_MAP` rows, `PRIMARY_NAV`, `ROLE_LABELS` |
| `src/constants/roleRoutes.ts` | `PME: '/pme'` |
| `src/App.tsx`, `src/pages/Dashboard.tsx` | Route and `PMEView` |
| `src/pages/dashboards/PMEView.tsx` | New — the PME desk, §6.3 |
| `src/components/admin/ManageUsersTab.tsx`, `src/lib/access/requestableRoles.ts` | Assignable; **not** self-requestable |
| `scripts/grant_role.py`, `scripts/access_matrix.mts` | `ROLES` list; regenerate `docs/engineering/access_matrix.md` |
| `supabase/tests/rls_negative.sql`, `rls_positive.sql` | PME cases |

---

## 4. Data model

All new tables: snake_case, RLS enabled with an explicit policy block, client access
`SELECT` only, every write through a `SECURITY DEFINER` RPC that opens with an
authorization block (`supabase/CLAUDE.md`). New tables key on `project_id` →
`projects("ProjectID")`, which is stable; `"ProjectNo"` becomes `UNIQUE` but stays
correctable.

### 4.1 Changes to existing tables

| Table | Change |
|---|---|
| `proposals` | `+ track`, `+ category_code`, `+ theme_code`, `+ project_id` (FK, set at sanction). `linked_project_no` kept for legacy rows |
| `projects` | `+ stage` (`CHECK`), `+ track`, `+ category_code`, `+ proposal_id`, `+ sanctioned_cost numeric`, `+ start_date date`, `+ end_date date` (typed twins of the text columns, backfilled with `try_parse_date`), `+ sanction_ref`, `+ closed_at`. `"ProjectNo"` → `UNIQUE` after a duplicate check that **fails loudly** rather than deduplicating |
| `project_reports` | `+ project_id`, `+ slot_id` (§4.2). `project_no` FK to `projects("ProjectNo")` |
| `scientific_outputs`, `ip_intelligence`, `equipment` | `+ project_id` (nullable FK) — roadmap `C4` |
| `mous`, `tech_transfers` | `linked_project_no` → FK |
| `agenda_items` | `+ subject_type`, `+ subject_id` (proposal, project, change request, PCR), `+ decision` |

`"ProjectStatus"` stays for the Excel importer but is derived from `stage` by trigger and
normalised on import (`Ongoing`/`Active` → `ACTIVE`). The 22 `=== 'Active'` sites move to
one helper in `src/lib/projects/`.

### 4.2 New tables

| Table | Holds | Written by |
|---|---|---|
| `proposal_versions` | Full snapshot of a draft each time the PI saves a named version or submits | PI |
| `proposal_budget_lines` | Year × head × amount. Copied to the project at sanction | PI (draft only) |
| `proposal_review_steps` | One row per required step of the track: `PME`, `FINANCE`, `RC`, `DIRECTOR`, `HQ_L1`, `HQ_L2`, `COMPETENT_AUTHORITY`; decision, date, notes, `meeting_id`, document | Step owner; PME records external ones |
| `project_budget_lines` | Sanctioned amount per financial year and head; revised only by an approved change request | RPC |
| `project_fund_receipts` | Date, financial year, amount, head (optional), source, order/OM no. and date, IFD file no. and date, document, `reverses_id` | **PME** |
| `project_expenditure` | Financial year, period, head, amount, signed-statement document, `reverses_id` | PME |
| `project_milestones` | Title, target date, sub-stage (6-month blocks, §4.2c of the manual), status, achieved date, evidence | PI proposes, PME confirms |
| `project_review_slots` | Expected reviews **and** expected progress reports, generated from track + category + dates; body, due date, `meeting_id`, outcome, gate decision | Generated; PME completes |
| `project_change_requests` | Type (`TIME_OVERRUN`, `RCE`, `REPHASING`, `REAPPROPRIATION`, `REALLOCATION`, `FORECLOSURE`), typed payload, status, resulting order no., IFD ref. | PI raises, PME processes |
| `project_completion_reports` | PCR sections, lessons (§4.4), approval chain status, financial statement snapshot | PI drafts, PME closes |
| `project_events` | Append-only timeline: every transition, receipt, review, change, document. One writer function called by every RPC | RPCs only |

Budget heads are a fixed list in one place (`src/lib/projects/heads.ts` + a `CHECK`):
Capital — Equipment, Works & Services; Revenue — Manpower, Consumables, TA (India),
TA (Abroad), Contingency, Outsourcing, Other. The head carries its class so the rules in
§4.5 can be enforced.

### 4.3 Funds: what PME enters and what the system computes

PME enters two things only: **money received** and **money spent**, each against a
financial year and (for expenditure) a head, each with its supporting document.

The project file then shows, per year and per head: _sanctioned · received · spent ·
balance_, and the same in total. Rules:

- A receipt on the HQ track is refused without the IFD file number and date (§7.2).
- Cumulative receipts cannot exceed the sanctioned total unless an approved `RCE` change
  request raised it.
- Expenditure above the year's sanction for a head is saved but flagged on the PME desk
  and the Director's view; it is the trigger for a re-appropriation request.
- Entries are append-only (§3.2). The audit trail is the ledger itself.

### 4.4 Lessons — the institutional-memory payload

The PCR carries structured fields, required before closure:

objectives met / partly / not met, with reason · what worked · what did not and why ·
reusable assets (equipment, methods, datasets, with where they are kept) · readiness
level reached vs targeted · recommendations to a future team · follow-on ideas.

A follow-on idea can be opened as a new `CONCEPT` draft with `parent_project_id` set, so
lineage is navigable in both directions (§8.4 of the manual).

### 4.5 Rules encoded from the manual

| Rule | Where enforced |
|---|---|
| Category ↔ duration ↔ TRL matrix (§2.1) | Draft validation; warning, not a block — PME may accept with a note |
| Project code pattern (§2.2) | Sanction RPC, HQ track |
| Equipment over ₹5 lakh needs a quotation at proposal stage and is listed in the sanction (§3.1) | Draft readiness check; sanction RPC copies the list |
| Works & Services only in MMP / FCP (§3.2) | Budget-line validation |
| Project-staff cumulative tenure 6 / 7 years (§3.3) | Existing tenure alert, extended across projects |
| Minutes within 2 days (LSG) / 1 week (Task Force) (§5) | Overdue flag on the PME desk |
| No rephasing of TA or Manpower; no Capital ↔ Revenue re-appropriation; no augmenting TA (§7.2) | Change-request RPC refuses |
| Cost overrun ≤ 20% vs > 20% routes differently (§6.4) | Change-request step list |
| Subsequent-year release needs the prior-year expenditure statement (§7.1) | Receipt RPC warns when missing |
| Conflict-of-interest declaration per committee member (§6.3) | Checkbox + document on the linked meeting |
| Checklist A / Checklist B (§9) | Shown as a readiness meter on submit and on change requests |

---

## 5. State machines

### 5.1 Proposal (existing statuses reused — no rename, no data migration)

| Status | Meaning now | Who moves it on |
|---|---|---|
| `DRAFT` | Private concept | PI submits |
| `SUBMITTED` | With PME for vetting | PME |
| `UNDER_REVIEW` | Working through `proposal_review_steps` | Each step owner; PME records external steps |
| `REVISION_REQUESTED` | Back with the PI, note required | PI resubmits (new version) |
| `RECOMMENDED` | All lab steps passed | Director (sanctions on ULIP, forwards on HQ) |
| `APPROVED` | Competent authority approved | PME records |
| `OM_ISSUED` → `LINKED` | Sanction recorded; **`project_sanction` creates the project and sets `LINKED` in the same transaction** | PME |
| `REJECTED`, `ARCHIVED` | Terminal | — |

`proposal_link_project` remains only for attaching a legacy uploaded project.

### 5.2 Project

`SANCTIONED` (created, no funds yet) → `ACTIVE` (first receipt recorded) → `CLOSING`
(end date reached or PCR started) → `CLOSED` (PCR approval chain complete) → `ARCHIVED`
(read-only; published to Ask SURYA). `ON_HOLD` ⇄ `ACTIVE` by gate or review decision.
`FORECLOSED` only through an approved foreclosure change request.

### 5.3 Change request and PCR

`DRAFT → SUBMITTED → (steps per type and track) → APPROVED | REJECTED`. On `APPROVED`
the RPC applies the effect atomically: new end date, revised budget lines, or stage
change, and writes the event.

---

## 6. Screens

### 6.1 Navigation

One **Projects** section replaces the separate Projects / Proposals / Progress Reports
entries: _My projects_ (PI), _Portfolio_ (management), _PME desk_ (PME).

### 6.2 The project file (`/projects/:id`, also serves proposals)

Stage strip on top, next required action beneath it, then tabs:

Overview · Proposal (versions, review steps) · Budget & funds · Team · Equipment ·
Milestones · Reviews · Changes · Outputs · Documents · Timeline · Closure.

Tabs appear as the stage reaches them. Authoring stays desktop-only; approvals and
reading work on a phone, as elsewhere in the app.

### 6.3 PME desk (`/pme`)

A work queue, not a dashboard: proposals awaiting vetting · sanctions awaiting project
creation · receipts to record · expenditure statements due · reviews due in 30 days ·
minutes overdue · progress reports missing · change requests open · PCRs pending ·
legacy projects not yet completed (§8).

### 6.4 Management view

Portfolio table, one row per project: stage, time elapsed vs money spent vs milestones
met, last review outcome, days since last report. A **Call for review** button on any
project sends the PI an update request (existing `contribution_request_create`) and
assembles a one-page brief from the file. This delivers roadmap `C1`.

### 6.5 Committees

An agenda item can point at a proposal, project, change request or PCR. Recording the
decision on the agenda item is what advances the step. Action items from the meeting
appear on the project file.

---

## 7. Phases

Effort scale as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL`
multi-week). Each phase ships on its own and leaves the app working.

| ID | Phase | Contents | Effort | Done when |
|---|---|---|---|---|
| `PL0` | Foundations | PME role (§3.3). `projects.stage` + status normalisation. `"ProjectNo"` unique. Typed cost/date columns. `track` on proposals and projects. Private drafts. FKs on existing project-number columns | L | A PME user can sign in to an empty desk; Director dashboard counts match a hand count on real data; a second user cannot read another's draft (DB test) |
| `PL1` | Concept to sanction | Versions, budget lines, readiness meter (Checklist A), `proposal_review_steps` per track, `project_sanction` auto-creating the project with budget and equipment list | XL | One ULIP and one HQ proposal walked draft → project with no Excel upload and no manual link |
| `PL2` | Funds and execution | Receipts, expenditure, milestones, project-file page with tabs and timeline, output/equipment links | XL | Sanctioned · received · spent · balance correct per head and year against a worked example; reversal entry tested |
| `PL3` | Monitoring | Review and report slots generated by track/category, committee linkage, minutes deadlines, missing-report flags, Call for review, portfolio view | L | A project with no report this period shows as overdue without anyone creating a record |
| `PL4` | Changes | Six change-request types with their prohibitions and routes; effects applied atomically | L | Each prohibition in §4.5 has a DB test that the RPC refuses it |
| `PL5` | Closure and memory | PCR with lessons, auto-compiled financial statement and annexure list, approval chain, archive, publish to Ask SURYA with report text indexed, follow-on lineage | L | A closed project's lessons are returned by Ask SURYA with a citation to the PCR |
| `PL6` | Legacy and rollout | §8 | M + elapsed time | Every active legacy project has a stage, budget lines and receipts to date |

**Order is fixed** `PL0 → PL1 → PL2`; `PL3` and `PL4` can swap; `PL5` needs `PL2`.

**Prerequisites from the 2026-11-10 codebase review**, which this plan assumes done:
account provisioning with `staff.user_id` linking (PIs must resolve to a person), and
restricting who may grant admin-tier roles (PME is a powerful new role to hand out).

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- A `scripts/db/projects.db.test.ts` suite on the PGlite harness: each RPC's happy path,
  each role's refusal, the self-dealing guard, append-only money.
- `docs/engineering/{database_design,api_spec,system_design,FEATURES}.md` updated in the
  same PR — those docs are authoritative.

---

## 8. Bringing existing projects in

Existing rows have no proposal, budget heads or receipts. They are not back-invented.

1. Migration sets `stage` from `"ProjectStatus"` and `track` from `"ProjectCategory"` /
   project-number prefix; anything ambiguous is left `NULL` and listed on the PME desk.
2. PME completes each active project through a short **legacy completion** form: track,
   category, typed dates, sanctioned cost by head, receipts and expenditure to date as
   opening-balance entries (marked as such), sanction document.
3. Completed legacy projects get `CLOSED` with an optional short lessons note; no PCR
   chain is demanded retroactively.
4. The Excel importer remains for project staff and for bulk legacy correction, PME-only
   for the project domains.

**Rollout.** Pilot `PL1`–`PL2` with one division and its new proposals for one cycle
while existing projects continue as they are; then run step 2 for the whole institute;
then switch the old Proposals / Progress Reports navigation off.

---

## 9. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Exact ULIP approval chain and project-number format | PME → Finance → Research Council → Director; free-format number |
| 2 | Are the four signatures (PI, Head PME, Finance, Director) to be captured in the app or on an uploaded signed scan? | Uploaded signed scan; the app records who and when |
| 3 | Who performs the Finance vetting step | Any `FinanceAdmin` |
| 4 | May a PME user also be a PI? | Yes, with the self-dealing guard in §3.2; a second PME or MasterAdmin handles that file |
| 5 | Should co-PIs edit a draft or only read it? | Read only; PI edits |

---

## 10. Out of scope

- Approving anything that is decided at CSIR HQ — those steps are recorded with their
  documents, never performed here.
- Procurement workflow, purchase orders, and project-staff recruitment process (§3.3
  selection committees) — only their outcomes attach to the file.
- Integration with PFMS or the accounts system (roadmap `A5`, deferred until an export
  exists). The ledger in §4.3 is shaped so an import can replace manual entry later.
- Research-misconduct handling (§6.3 SIB process).

# Project Lifecycle — Implementation Plan

_Proposal, 2026-11-10, revision 2. Item IDs `PL0`–`PL7`. Indexed from
[`../ROADMAP.md`](../ROADMAP.md)._

**Goal.** One project file that lives from a scientist's first private note to the
archive. A scientist logs in and starts working without having to think about process;
a dedicated PME role carries the file through every stage; management reads it as the
institute's record of what was done and what was learned.

**Rule source.** _CSIR Guidelines on Implementation, Monitoring and Financial Governance
of Projects_, OM No. 33/GIM&FGP/2025-CPD dated 25 April 2025 (cited below as "§n").

**Revision 2 changes.** Adds the scientist workspace (§3, new phase `PL1`) ahead of the
process work, and renumbers the later phases by one. Records the ULIP chain, scanned
signatures and read-only co-PIs as decided.

## Decisions taken (2026-11-10)

1. In-house projects stay in scope as their own track, **ULIP**.
2. **ULIP governance.** Head RPBD is the project leader of the ULIP scheme. A review
   committee recommends; the Director approves.
3. A dedicated **PME** role manages the whole lifecycle, conception to record keeping.
4. **PME enters funds received**, and expenditure (§5.3).
5. **Signatures are on scanned copies.** The signed scan is what completes a step; the
   app records who uploaded it and when. No in-app signing.
6. **Co-PIs read a draft; only the PI edits it.**
7. **Scientist first.** Starting an idea needs a title and nothing else. Notes, drafting,
   review and incorporation happen in one place.

**Supersedes / absorbs** these roadmap items: WP-18 "Project master file", WP-13 `C2`
(milestones), `C3` (review chain half), `C4` (output ↔ project linkage); supplies the
data WP-11 `C1` (health score) and `A3` (S-curves) were blocked on.

---

## 1. What exists today (verified against the code, 2026-11-10)

| Area | State | Gap this plan closes |
|---|---|---|
| Starting a proposal | "New Proposal" on the Proposals list opens one page of about 20 fields (`src/pages/proposals/ProposalForm.tsx`). The scientist's home page lists proposals but cannot start one | Start from home with a title only |
| Saving a draft | No autosave. An empty start date is sent as `''` to a `date NOT NULL` column (`ProposalsContext.tsx:95` only defaults when the value is undefined), so a title-only save is expected to fail — read from code, not run | Every field optional until submit |
| Notes | None. Only the four formal text sections | Private notes with "move into…" |
| Versions | None | Named versions, compare |
| Who may create | `proposals_insert` and the `/proposals/new` route both require the `Scientist` role | Any research role |
| Device | Authoring is desktop-only | Notes on a phone |
| Similar-work check | `SimilarWorkPanel` on the detail page only, after saving | While drafting |
| `proposals` + 9 RPCs | Draft → submit → review → approve → OM → link, with history. Signed PDF required to submit | Every review step is "any admin". Budget is one number. Drafts readable by Director / HOD / admins. Completeness is checked in the browser only (`submitSchema`) |
| Co-PIs | `proposal_copis` holds `staff_id` + name; co-PIs get no read access at all | Read access, keyed on staff identity |
| `projects` | Excel-fed flat table. PK `"ProjectID"`. `"ProjectNo"` is **deliberately not unique** — one umbrella number covers several work packages (live: `HCP0054` = 4 rows; uniqueness was tried and dropped in `20261102000006`) — yet reports, MoUs and tech transfers join on it. Cost and dates are `text` | Stage, history, budget heads, typed columns; joins moved to `project_id` |
| Proposal → project | `proposal_link_project` needs the project row uploaded first | Sanction creates the project |
| `project_reports` | Exists only if the PI starts one; `milestones` is free text | Expected slots; structured milestones |
| Committees | Meetings, agenda, action items, minutes | Not linked to any proposal or project |
| Outputs | Publications and patents have no project column; MoUs / tech transfers a free-text one | Real links |
| Status vocabulary | Template says `Ongoing / Completed`; 22 code sites test `=== 'Active'` | One enforced list |
| Roles | No PME role | §4 |

---

## 2. Design in one page

### 2.1 Principles

- **Nothing blocks writing.** Saving never fails for a missing field. Missing things are
  shown, and only submission checks them.
- **One place.** Notes, draft, comments, budget, documents and later the running project
  are tabs of the same file.
- **The next step is always stated**, in plain words, on the file and on the home page.
- **The process is the app's job.** The scientist never chooses a route, a committee or a
  form; the track decides.
- **Rules live in the database.** Anything that matters (privacy of drafts, who may
  approve, money) is enforced in SQL, not only in the screen.

### 2.2 One record, one stage strip

```
CONCEPT → VETTING → APPRAISAL → SANCTIONED → ACTIVE → CLOSING → CLOSED → ARCHIVED
 (private   (PME)    (committee   (approval,   (execute,  (completion
  notes +             / HQ)        funds)       monitor)   report)
  draft)                           side exits: REJECTED · ON_HOLD · FORECLOSED
```

`CONCEPT`–`APPRAISAL` live on `proposals.status` (existing values kept, §6.1).
`SANCTIONED` onward live on a new `projects.stage` with a `CHECK`. Sanction creates the
project and carries everything forward; nobody "links" anything.

### 2.3 Two tracks, one machine

`track` is chosen at concept (a two-option question, defaulting to ULIP) and decides
which steps are required. Nothing else forks.

| | **ULIP** (in-house) | **HQ scheme** (FIR, FBR, NCP, FTT, FTC, MMP, FCP, HCP, IST — §2.1) |
|---|---|---|
| Scheme leader | Head RPBD | — (Nodal Directorate at HQ) |
| Vetting chain | PME → ULIP review committee recommends → Director approves | PME → Finance → Director forwards (§4.1) |
| Appraisal | The review committee; nothing at HQ (§1.1 excludes these) | HQ Level 1 and Level 2 — **recorded, not performed, in SURYA** |
| Sanction document | Director's approval, signed scan | Sanction OM with project number (§4.1.5) |
| Project code | Institute's own numbering | Validated against §2.2 pattern |
| Funds receipt needs | Order no. and date | OM no. and date **and IFD concurrence file no. and date** (§7.2) |
| Stage-gates | Off | On for FTT / FTC / MMP only (§4.2) |
| Review calendar | ULIP review committee, half-yearly | By category (§5) |
| Closure | Completion report → review committee recommends → Director | PCR → RC in-principle → Monitoring Committee → DG (§8) |

**Head RPBD as scheme leader.** Held as a setting, not a role: `project_schemes`
(`code`, `name`, `leader_user_id`, `review_committee_id` → `committees`). The leader sees
every ULIP file from submission onward, convenes the review committee, and is named on
each file. The review committee is an ordinary committee in the existing Committees
module. A third track (externally funded) is one more column here later.

### 2.4 Who does what

| Role | Can |
|---|---|
| PI (Scientist, HOD, Division Head, Director) | Start an idea, keep notes, draft, version, add co-PIs, submit, answer revision requests, file progress reports, raise change requests, draft the completion report |
| Co-PI | Read the draft and the file. No edits, no notes |
| **PME** | Everything in §4 |
| Head RPBD | ULIP scheme leader (§2.3) |
| FinanceAdmin | Finance vetting on the HQ track; read every ledger |
| HOD / Division Head | Read their division's files from submission onward; comment at vetting |
| Director | Approve / forward; call a review on any project; read everything except private drafts |
| MasterAdmin | Everything PME can |

---

## 3. The scientist workspace

What a scientist sees and does, in the order they meet it.

### 3.1 Home: start and continue

- **"New idea"** on the home page of every research role. It asks for a title and
  creates a private draft at once.
- **"Continue"** list: the scientist's drafts and running projects, each with one next
  action in plain words — _Add objectives_, _Budget missing_, _Print for signature_,
  _Waiting for PME_, _Revision asked: 2 comments_, _Progress report due 15 Jan_.

### 3.2 The draft page

One page, three regions:

| Region | Content |
|---|---|
| Left — sections | Idea · Plan · Team · Budget · Documents. Each shows a tick, a dot (started) or nothing |
| Centre — the section being worked on | Fields for that section only. Typed text saves itself; "Saved 10:42" beside the title |
| Right — notes | Always visible, on every section |

Sections:

- **Idea** — title, short name, track, abstract, problem statement.
- **Plan** — objectives, expected outcomes, category, start, duration, readiness level.
- **Team** — co-PIs picked from the staff list; name, division and designation of the PI
  are prefilled.
- **Budget** — year × head table; total computed. Equipment lines are checked against
  the instrument register ("a similar instrument exists in Division X").
- **Documents** — quotations, supporting papers, and the signed scan.

### 3.3 Notes, and moving them into the proposal

- A note is free text with a date, optionally a pasted image or attached file.
- Notes are **private to the PI**. They are never shown to co-PIs, PME or reviewers and
  never travel with a submission.
- Each note has **Move into…** → pick a section field. The text is appended to that
  field, the note is marked _used in Objectives_, and stays in the list, greyed, so
  nothing is lost. **Copy into…** does the same without marking it.
- Notes can be filtered: all · not yet used.
- Notes can be added from a phone; the rest of authoring stays on desktop.

This is the write → review → incorporate loop: jot freely on the right, read them back,
push the good ones into the left.

### 3.4 Autosave and versions

- Changes save a moment after typing stops. A failed save keeps the text in the browser
  and retries; the page says so plainly.
- **Mark a version** stores a full snapshot with a label ("after discussion with HOD").
  A version is also stored automatically at every submit and resubmit.
- **Compare** shows two versions side by side, changed fields highlighted.
- **Restore** copies an old version back into the draft (and stores the current state as
  a version first).

### 3.5 Readiness, not blocking

A meter at the top lists what submission still needs: empty required fields, budget not
matching the requested total, a quotation missing for equipment above ₹5 lakh (§3.1),
duration outside the category's range (§2.1), the signed scan. Each line is a link to
the place to fix it. On the HQ track this is the manual's Checklist A (§9).

The same check runs in the submit RPC, so the browser and the database cannot disagree.

### 3.6 Similar work

The existing similar-work panel appears on the Idea section once there is a title and
abstract, so duplication is seen before effort is spent.

### 3.7 Print, sign, scan, submit

1. **Print for signature** produces the proposal as a PDF from the draft (the app
   already renders PDFs for appraisal reports and work plans). The footer carries the
   proposal code and version number.
2. The PI gets it signed on paper, scans it, uploads it.
3. **Submit** records which version was signed. The draft becomes read-only until a
   revision is asked.

### 3.8 Review comments where they belong

A reviewer's comment is attached to a section. When a revision is requested, the PI sees
each comment beside the field it concerns, with a _done_ tick; resubmitting stores a new
version and shows the reviewer what changed.

### 3.9 After sanction

The same page gains tabs (§8.2). The scientist's notes stay with the file, still private.

---

## 4. The PME role

### 4.1 Powers

- Reads every proposal **from submission onward** and every project file.
- Performs or records every stage transition after submission, through RPCs.
- Owns the `projects` domain: creates, edits, imports legacy rows. `PL0` adds PME's write
  access beside the existing one; `HRAdmin` and `SystemAdmin` lose direct write on
  `projects`, `project_staff`, `mous`, `tech_transfers` at rollout (`PL7`), once PME
  accounts exist — withdrawing it earlier would leave nobody able to edit a project.
  HRAdmin keeps `staff`.
- Enters fund receipts and expenditure; schedules reviews; places items on committee
  agendas; uploads orders, OMs and minutes.

### 4.2 Guard rails (enforced in SQL, not the UI)

- **Drafts are private.** `proposals_can_read` changes so a `DRAFT` is visible only to
  its creator and named co-PIs, and editable only by its creator (the existing
  `proposals_update_owner` policy already says this — keep it). Today Director, division
  managers and all admins can read it.
- **Notes are more private still** — creator only, at every stage.
- **No self-dealing.** A PME user who is PI or co-PI on a file cannot vet it, record its
  sanction, or enter its funds. Check `auth.uid()` against `pi_user_id` and
  `proposal_copis` in every RPC.
- **Money is append-only.** A mistake is corrected by a reversal entry naming the entry
  it reverses.
- **PME is not an admin.** It gets `caller_is_pme()`, not membership of
  `proposals_caller_is_admin()`, so it gains no HR, appraisal or account reach.

### 4.3 Where a new role must be declared

| File | Change |
|---|---|
| new migration | Widen `user_roles.role` `CHECK`; `admin_set_user_roles` `v_allowed`; add `caller_is_pme()` |
| `src/types/index.ts` | `Role` union |
| `src/constants/access.ts` | `ALL_ROLES`, `ACCESS_MAP` rows, `PRIMARY_NAV`, `ROLE_LABELS` |
| `src/constants/roleRoutes.ts` | `PME: '/pme'` |
| `src/App.tsx`, `src/pages/Dashboard.tsx` | Route and `PMEView` |
| `src/pages/dashboards/PMEView.tsx` | New — the PME desk, §8.3 |
| `src/components/admin/ManageUsersTab.tsx`, `src/lib/access/requestableRoles.ts` | Assignable; **not** self-requestable |
| `scripts/grant_role.py`, `scripts/access_matrix.mts` | `ROLES` list; regenerate `docs/engineering/access_matrix.md` |
| `supabase/tests/rls_negative.sql`, `rls_positive.sql` | PME cases |

---

## 5. Data model

All new tables: snake_case, RLS enabled with an explicit policy block, every state
change through a `SECURITY DEFINER` RPC that opens with an authorization block
(`supabase/CLAUDE.md`). New project-side tables key on `project_id` →
`projects("ProjectID")`, the only real key. `"ProjectNo"` stays non-unique: several
work-package rows may share one umbrella number, and the file page lists its siblings.

### 5.1 Changes to existing tables

| Table | Change |
|---|---|
| `proposals` | `DROP NOT NULL` on every column except `title`, `pi_user_id`, `pi_name`, `created_by`, `status` (completeness moves into `proposal_submit`). `+ track`, `+ category_code`, `+ theme_code`, `+ parent_project_id`, `+ project_id` (set at sanction), `+ submitted_version_id` |
| `proposal_copis` | Unchanged; read access for co-PIs is `staff_id = caller_staff_id()` |
| `proposal_documents` | Widen `doc_type`: `+ quotation`, `+ supporting`, `+ signed_step_scan` |
| `projects` | `+ stage` (`CHECK`), `+ track`, `+ category_code`, `+ proposal_id`, `+ sanctioned_cost numeric`, `+ start_date date`, `+ end_date date` (typed twins, backfilled with `try_parse_date`), `+ sanction_ref`, `+ closed_at`. Index (non-unique) on `"ProjectNo"`. `project_sanction` may create one row per work package under one number |
| `project_reports` | `+ project_id`, `+ slot_id`. `project_id` backfilled only where `project_no` resolves to exactly one row; the rest are listed on the PME desk |
| `scientific_outputs`, `ip_intelligence`, `equipment` | `+ project_id` (nullable FK) — roadmap `C4` |
| `mous`, `tech_transfers` | `+ project_id`, backfilled the same way; `linked_project_no` kept as entered |
| `agenda_items` | `+ subject_type`, `+ subject_id` (proposal, project, change request, completion report), `+ decision` |

`"ProjectStatus"` stays for the Excel importer but is derived from `stage` by trigger and
normalised on import (`Ongoing` / `Active` → `ACTIVE`). The 22 `=== 'Active'` sites move
to one helper in `src/lib/projects/`.

### 5.2 New tables

| Table | Holds | Written by |
|---|---|---|
| `project_schemes` | Track settings: code, name, leader, review committee | MasterAdmin |
| `proposal_notes` | Body, attachment, `used_in` (section field), `used_at`. RLS: author only, all commands | PI (direct, own rows) |
| `proposal_versions` | Full snapshot (`jsonb`) of fields, co-PIs and budget; label; number | PI; RPCs on submit |
| `proposal_budget_lines` | Year × head × amount. Copied to the project at sanction | PI, draft only |
| `proposal_review_steps` | One row per required step of the track: `PME`, `FINANCE`, `REVIEW_COMMITTEE`, `RC`, `DIRECTOR`, `HQ_L1`, `HQ_L2`, `COMPETENT_AUTHORITY`; decision, date, `meeting_id`, **signed scan (required to complete the step)** | Step owner; PME records external ones |
| `proposal_review_comments` | Step, section, text, `resolved_at` | Reviewer writes; PI resolves |
| `project_budget_lines` | Sanctioned amount per year and head; revised only by an approved change request | RPC |
| `project_fund_receipts` | Date, year, amount, head (optional), source, order / OM no. and date, IFD file no. and date, scan, `reverses_id` | **PME** |
| `project_expenditure` | Year, period, head, amount, signed statement, `reverses_id` | PME |
| `project_milestones` | Title, target date, 6-month sub-stage, status, achieved date, evidence | PI proposes, PME confirms |
| `project_review_slots` | Expected reviews **and** expected progress reports, generated from track + category + dates; body, due date, `meeting_id`, outcome, gate decision | Generated; PME completes |
| `project_change_requests` | Type (`TIME_OVERRUN`, `RCE`, `REPHASING`, `REAPPROPRIATION`, `REALLOCATION`, `FORECLOSURE`), payload, status, resulting order, scan | PI raises, PME processes |
| `project_completion_reports` | Sections, lessons (§5.4), chain status, financial statement snapshot | PI drafts, PME closes |
| `project_events` | Append-only timeline; one writer function called by every RPC | RPCs only |

Draft content (`proposals` while `DRAFT`, notes, budget lines) is written directly by its
owner under RLS — that is what makes autosave cheap. Everything from submission onward is
RPC-only.

Budget heads are one fixed list (`src/lib/projects/heads.ts` + a `CHECK`): Capital —
Equipment, Works & Services; Revenue — Manpower, Consumables, TA (India), TA (Abroad),
Contingency, Outsourcing, Other.

### 5.3 Funds: what PME enters and what the system computes

PME enters **money received** and **money spent**, each against a financial year (and a
head, for expenditure), each with its scan. The file shows, per year and head:
_sanctioned · received · spent · balance_.

- A receipt on the HQ track is refused without the IFD file number and date (§7.2).
- Cumulative receipts cannot exceed the sanctioned total unless an approved `RCE` raised
  it.
- Expenditure above the year's sanction for a head is saved but flagged on the PME desk
  and the Director's view.
- Entries are append-only (§4.2).

### 5.4 Lessons — the institutional-memory payload

The completion report requires: objectives met / partly / not met, with reason · what
worked · what did not and why · reusable assets and where they are kept · readiness level
reached vs targeted · recommendations to a future team · follow-on ideas.

A follow-on idea opens a new `CONCEPT` draft with `parent_project_id` set, so lineage is
navigable both ways (§8.4).

### 5.5 Rules encoded from the manual

| Rule | Where enforced |
|---|---|
| Category ↔ duration ↔ TRL matrix (§2.1) | Readiness meter; warning, PME may accept with a note |
| Project code pattern (§2.2) | Sanction RPC, HQ track |
| Equipment over ₹5 lakh needs a quotation and is listed in the sanction (§3.1) | Readiness meter; sanction RPC copies the list |
| Avoid duplicating available equipment (§3.1) | Budget section lookup against `equipment` |
| Works & Services only in MMP / FCP (§3.2) | Budget-line validation |
| Project-staff cumulative tenure 6 / 7 years (§3.3) | Existing tenure alert, extended across projects |
| Minutes within 2 days (LSG) / 1 week (Task Force) (§5) | Overdue flag on the PME desk |
| No rephasing of TA or Manpower; no Capital ↔ Revenue re-appropriation; no augmenting TA (§7.2) | Change-request RPC refuses |
| Cost overrun ≤ 20% vs > 20% (§6.4) | Change-request step list |
| Subsequent-year release needs the prior-year expenditure statement (§7.1) | Receipt RPC warns |
| Conflict-of-interest declaration (§6.3) | Scan on the linked meeting |
| Checklist A / B (§9) | Readiness meter on submit and on change requests |

---

## 6. State machines

### 6.1 Proposal (existing statuses reused — no rename, no data migration)

| Status | Meaning | Who moves it on |
|---|---|---|
| `DRAFT` | Private concept: notes, versions, autosave | PI submits (readiness passes, signed scan present) |
| `SUBMITTED` | With PME | PME |
| `UNDER_REVIEW` | Working through `proposal_review_steps` | Each step owner; PME records external steps |
| `REVISION_REQUESTED` | Back with the PI; comments attached to sections | PI resubmits (new version) |
| `RECOMMENDED` | Lab steps passed (ULIP: review committee has recommended) | Director (approves on ULIP, forwards on HQ) |
| `APPROVED` | Competent authority approved | PME records |
| `OM_ISSUED` → `LINKED` | Sanction recorded; **`project_sanction` creates the project and sets `LINKED` in one transaction** | PME |
| `REJECTED`, `ARCHIVED` | Terminal | — |

`proposal_link_project` remains only for attaching a legacy uploaded project.

### 6.2 Project

`SANCTIONED` → `ACTIVE` (first receipt recorded) → `CLOSING` (end date reached or
completion report started) → `CLOSED` (approval chain complete) → `ARCHIVED` (read-only;
published to Ask SURYA). `ON_HOLD` ⇄ `ACTIVE` by review decision. `FORECLOSED` only
through an approved foreclosure request.

### 6.3 Change request and completion report

`DRAFT → SUBMITTED → (steps per type and track) → APPROVED | REJECTED`. On `APPROVED` the
RPC applies the effect atomically — new end date, revised budget lines or stage change —
and writes the event.

---

## 7. Interlinks — how the separate sections become one

| From | To | Link |
|---|---|---|
| Home page | Draft | "New idea", "Continue" with next action |
| Note | Proposal field | Move into… |
| Proposal | Project | Created at sanction; same page |
| Parent project | New idea | Follow-on from the completion report |
| Review step | Committee meeting | Agenda item points at the file; decision on the item completes the step |
| Meeting action item | Project file | Shown on the Reviews tab |
| Budget line (equipment) | Instrument register | Lookup at draft; `equipment.project_id` after purchase |
| Project | Staff engaged, publications, patents, MoUs, tech transfers | `project_id` on each |
| Review slot | Progress report | A due report exists before anyone writes it |
| Director | PI | "Call for review" → existing request mechanism |
| Closed file | Ask SURYA | Report text and lessons indexed, institute-wide |

---

## 8. Screens

### 8.1 Navigation

One **Projects** section replaces the separate Projects / Proposals / Progress Reports
entries: _My projects_ (PI), _Portfolio_ (management), _PME desk_ (PME).

### 8.2 The file (`/projects/:id`; a draft is the same page at an earlier stage)

Stage strip on top, next action beneath it, notes on the right, then tabs that appear as
the stage reaches them:

Draft sections (Idea · Plan · Team · Budget · Documents) → Review → Budget & funds ·
Team · Equipment · Milestones · Reviews · Changes · Outputs · Documents · Timeline ·
Closure.

### 8.3 PME desk (`/pme`)

A work queue: proposals awaiting vetting · sanctions awaiting project creation ·
receipts to record · expenditure statements due · reviews due in 30 days · minutes
overdue · progress reports missing · change requests open · completion reports pending ·
legacy projects not yet completed (§10).

### 8.4 Management view

Portfolio table, one row per project: stage, time elapsed vs money spent vs milestones
met, last review outcome, days since last report. **Call for review** on any project
sends the PI an update request (`contribution_request_create`) and assembles a one-page
brief from the file. Delivers roadmap `C1`.

### 8.5 Committees

An agenda item can point at a proposal, project, change request or completion report.
Recording the decision there advances the step; action items appear on the file.

---

## 9. Phases

Effort scale as in the roadmap (`S` half a day · `M` 1–2 days · `L` 3+ days · `XL`
multi-week). Each phase ships on its own and leaves the app working.

| ID | Phase | Contents | Effort | Done when |
|---|---|---|---|---|
| `PL0` ✅ | Foundations (shipped 2026-11-10, migrations `20261110000001`–`2`) | PME role (§4.3). `projects.stage` + status normalisation. Typed cost / date columns. `track` and `project_schemes`. Private drafts. `project_id` beside every existing project-number column | L | A PME user signs in to an empty desk; Director dashboard counts match a hand count; a second user cannot read another's draft (DB test) |
| `PL1` | **Scientist workspace** | §3.1–3.6: title-only start from home, optional fields, autosave, notes with Move into…, versions and compare, sectioned page, readiness meter, similar-work while drafting, wider create permission, notes on phone | L–XL | A new scientist account goes from login to a saved idea in one click and one field; a note moved into Objectives appears there and is marked used; killing the browser mid-typing loses nothing |
| `PL2` | Concept to sanction | Budget lines, co-PI read access, print for signature (§3.7), `proposal_review_steps` per track, section comments (§3.8), `project_sanction` creating the project with budget and equipment list | XL | One ULIP and one HQ proposal walked draft → project with no Excel upload and no manual link |
| `PL3` | Funds and execution | Receipts, expenditure, milestones, post-sanction tabs and timeline, output / equipment links | XL | Sanctioned · received · spent · balance correct per head and year against a worked example; reversal entry tested |
| `PL4` | Monitoring | Review and report slots by track / category, committee linkage, minutes deadlines, missing-report flags, Call for review, portfolio view | L | A project with no report this period shows as overdue without anyone creating a record |
| `PL5` | Changes | Six change-request types with their prohibitions and routes; effects applied atomically | L | Each prohibition in §5.5 has a DB test that the RPC refuses it |
| `PL6` | Closure and memory | Completion report with lessons, auto-compiled financial statement and annexure list, approval chain, archive, publish to Ask SURYA with report text indexed, follow-on lineage | L | A closed project's lessons are returned by Ask SURYA with a citation |
| `PL7` | Legacy and rollout | §10 | M + elapsed time | Every active legacy project has a stage, budget lines and receipts to date |

**Order.** `PL0 → PL1 → PL2 → PL3` is fixed. `PL1` needs nothing from PME and can be
released to scientists on its own — drafts simply wait at "ready to submit" until `PL2`.
`PL4` and `PL5` can swap; `PL6` needs `PL3`.

**Prerequisites from the 2026-11-10 codebase review**, assumed done:

- Account provisioning with `staff.user_id` linking — a PI must resolve to a person, and
  co-PI read access and the staff picker depend on it.
- A minimal staff directory readable by verified users (ID, name, designation,
  division) — today a scientist sees only their own staff row, so a co-PI picker would be
  empty.
- Restricting who may grant admin-tier roles — PME is a powerful role to hand out.

None of the three is done as of `PL0`; `PL0` itself does not depend on them.

### Verification, every phase

- `npm run build`, `npm run lint`, `npm test`, `python scripts/check_security_definer.py`.
- `scripts/db/projects.db.test.ts` on the PGlite harness: each RPC's happy path, each
  role's refusal, draft and note privacy, the self-dealing guard, append-only money.
- `PL1` additionally: the readiness function has one unit-test table shared by the UI
  and compared against `proposal_submit`'s refusals.
- `docs/engineering/{database_design,api_spec,system_design,FEATURES}.md` updated in the
  same PR.
- UI follows `DESIGN.md`; semantic tokens only.

---

## 10. Bringing existing work in

**Existing proposals.** Untouched: statuses are reused, new columns are nullable, a
version 1 snapshot is taken by the migration.

**Existing projects** have no proposal, budget heads or receipts. They are not
back-invented.

1. Migration sets `stage` from `"ProjectStatus"` and `track` from `"ProjectCategory"` /
   project-number prefix; anything ambiguous stays `NULL` and is listed on the PME desk.
2. PME completes each active project through a short **legacy completion** form: track,
   category, typed dates, sanctioned cost by head, receipts and expenditure to date as
   opening-balance entries (marked as such), sanction scan.
3. Completed legacy projects get `CLOSED` with an optional lessons note; no approval
   chain is demanded retroactively.
4. The Excel importer remains for project staff and bulk legacy correction, PME-only for
   the project domains.

**Rollout.** Release `PL1` to all scientists as soon as it is ready. Pilot `PL2`–`PL3`
with one division's new ULIP proposals for one cycle. Then run step 2 institute-wide and
switch the old Proposals / Progress Reports navigation off.

---

## 11. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Who may start a proposal? | Scientist, HOD, Division Head, Director |
| 2 | ULIP project-number format | Free-format; work packages may share a number |
| 3 | Is there a Finance check on ULIP proposals before the review committee? | No |
| 4 | Does Head RPBD also hold the PME role? | Independent: leader is a setting, PME is a role; one person may hold both |
| 5 | Who performs Finance vetting on the HQ track | Any `FinanceAdmin` |
| 6 | May a PME user also be a PI? | Yes, with the guard in §4.2; another PME or MasterAdmin handles that file |
| 7 | Are a PI's notes ever shared? | Never; private to the PI at every stage |

---

## 12. Out of scope

- Approving anything decided at CSIR HQ — recorded with its documents, never performed
  here.
- In-app or digital signatures (decision 5).
- Several people editing one draft (decision 6).
- Procurement, purchase orders and the project-staff recruitment process — only their
  outcomes attach to the file.
- Integration with PFMS or the accounts system (roadmap `A5`). The ledger in §5.3 is
  shaped so an import can replace manual entry later.
- Research-misconduct handling (§6.3 SIB process).

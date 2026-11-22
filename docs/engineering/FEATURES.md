# SURYA — Feature & Functionality Guide

_Current as of 2026-11-21._

SURYA is the institutional management, research lifecycle, appraisal, and AI intelligence portal for **CSIR-AMPRI, Bhopal**. It brings together HR records, workforce planning, the full R&D project lifecycle (from idea to closure and archive), performance appraisal (PMS & Annual Work Plans), governance workflows (committees, helpdesk, calendar), and **Ask SURYA** — an on-premise AI query assistant grounded in institute data and documents.

This file is the **single, human-readable guide to every working capability in SURYA**, written so you can easily review what the app does today and keep it current as new features are added.

> **Related engineering docs:**
> - Role-by-page permissions table: [access_matrix.md](access_matrix.md) (generated from code) & [role_features.md](role_features.md)
> - Product vision & non-goals: [app.md](app.md)
> - System architecture & state machines: [architecture_addendum.md](architecture_addendum.md) · [system_design.md](system_design.md)
> - Database schema & API reference: [database_design.md](database_design.md) · [api_spec.md](api_spec.md)
> - Setup & operations: [RAG-SETUP-TUTORIAL.md](../operations/RAG-SETUP-TUTORIAL.md) · [deploy/README.md](../../deploy/README.md) · [ROADMAP.md](../roadmap/ROADMAP.md)

---

## How to Use & Update This Document

Each feature below follows the same simple structure:
- **What it does:** plain-English summary of the user-facing purpose.
- **Who uses it:** primary roles (for exact per-route permissions, [access_matrix.md](access_matrix.md) is always the authoritative table).
- **Where to find it:** route path(s) or UI location.
- **How it works:** step-by-step flow, business rules, PDFs/OCR, notifications, and automations.

### Template for adding a new feature in the future

When you ship a new feature or modify an existing one, copy this block into the matching domain section below (and update the `Current as of` date at the top):

```markdown
### <Feature Name>
- **What it does:** <1–2 sentences explaining why the feature exists for users.>
- **Who uses it:** <Roles that author / review / administer / view it.>
- **Where to find it:** `<Route path or UI location>`
- **How it works:**
  - <Step 1: how a user starts or creates a record>
  - <Step 2: approvals, rules, validations, PDF exports, or notifications>
  - <Step 3: where the finished data goes (dashboards, Ask SURYA, archive)>
```

> **Quick reminder when updating:** If a new feature also adds a route or role, update `src/constants/access.ts` and regenerate [access_matrix.md](access_matrix.md) + [role_features.md](role_features.md) (`npx vitest run src/lib/access/roleFeatures.test.ts -u`) rather than duplicating full role tables here.

---

## Table of Contents

1. [Platform, Access & Navigation](#1-platform-access--navigation)
2. [Role Dashboards, My Work & Notifications](#2-role-dashboards-my-work--notifications)
3. [Unified Human Resource & Workforce](#3-unified-human-resource--workforce)
4. [Research Operations & Project Lifecycle](#4-research-operations--project-lifecycle)
5. [Governance (PMS, AWP, Committees, Helpdesk, Calendar, Audit)](#5-governance)
6. [Intelligence, Connected Analytics & Ask SURYA](#6-intelligence-connected-analytics--ask-surya)
7. [Admin, Data Operations, Capture & RAG](#7-admin-data-operations-capture--rag)
8. [Developer & Operations Commands](#8-developer--operations-commands)
9. [Quick Update Checklist](#9-quick-update-checklist)

---

## 1. Platform, Access & Navigation

### Login, Onboarding & Password Security
- **What it does:** Authenticates institute staff and routes unprovisioned or new accounts safely before granting access to institutional data.
- **Who uses it:** Everyone.
- **Where to find it:** `/login`, `/setup`, `/change-password`
- **How it works:**
  - Users sign in via Supabase Auth (email + password, with OTP fallback if configured; local-only dev shortcut available when `VITE_DEV_LOGIN` is enabled).
  - Public self-signup is disabled; newly created users automatically receive `DefaultUser` and land on a pending-access screen until approved.
  - Admin-created accounts flagged with `must_change_password` are forced through `/change-password` (minimum 12 characters with mixed character classes) before opening any other route.
  - If Supabase env variables are missing on first run, `/setup` provides a dev credential setup wizard.

### Composite Multi-Role Identity & Role Switching
- **What it does:** Allows one person to hold multiple institutional capacities (for example, `Scientist` + `HOD` + `EmpoweredCommittee`) under a single login and switch perspectives cleanly.
- **Who uses it:** All 15 roles: `Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `PME`, `EmpoweredCommittee`, `Student`, `ProjectStaff`, `Guest`, `DefaultUser`.
- **Where to find it:** Topbar role switcher in the main layout.
- **How it works:**
  - A user's assigned roles live in `user_roles`; one `active_role` in `user_profiles` drives the current dashboard and sidebar.
  - Switching roles updates `active_role` and reloads the scoped dashboard view.
  - Navigation and route guards (`ACCESS_MAP`) handle UI visibility, while PostgreSQL Row-Level Security (RLS) enforces every data read and write at the database layer.
  - `Guest` and `DefaultUser` form a quarantine tier kept out of Ask SURYA and institute knowledge until an admin assigns a verified role.

### Access Requests & Feature Controls
- **What it does:** Gives administrators a controlled way to onboard users, grant exceptions to individual users, or toggle features at runtime.
- **Who uses it:** `DefaultUser`/`Guest` (submit request); `SystemAdmin`, `MasterAdmin` (access requests); `MasterAdmin` (feature controls).
- **Where to find it:** `/admin/access-requests`, `/admin/features`
- **How it works:**
  - Pending users submit a role request from their landing view; admins review and approve/reject it on `/admin/access-requests`, which writes `user_roles`.
  - On `/admin/features`, `MasterAdmin` can:
    1. Flip global or per-role feature kill-switches (`feature_controls`).
    2. Grant an individual user extra access to specific pages (`feature_grants`) without changing their role (data reads still follow RLS).
    3. Manage user accounts and role assignments.

### Navigation, Command Palette, Theme & Accessibility
- **What it does:** Keeps daily navigation fast across desktop and mobile while enforcing institute accessibility and layout standards.
- **Who uses it:** All authenticated users.
- **Where to find it:** Sidebar, TopBar, `Ctrl+K` / `Cmd+K` Command Palette, Settings modal, Mobile bottom bar.
- **How it works:**
  - **Sidebar:** Shows up to 6 role-personalized **"For you"** links first, with remaining permitted pages grouped under a collapsible **"More"** drawer (Overview, Unified Human Resource, Research Ops, Governance, Admin).
  - **Command Palette (`Ctrl+K` / `Cmd+K`):**
    - Navigates to any permitted page by name.
    - Searches staff, projects, PhDs, publications, IP, equipment, and divisions by name or stable ID (client-side over the caller's already-loaded RLS-scoped records).
    - Searches indexed **document titles** (via RLS-scoped lookup) and opens either the parent record (proposal, progress report, PMS report, meeting) or the document itself.
    - Hands deeper inside-document questions directly to Ask SURYA (`/ask?q=...`, prefilled without auto-sending).
  - **Theme & Density:** Light/dark theme and UI density toggles live in settings and persist per user.
  - **Mobile vs. Desktop Guard:** Review/approval pages and proposal notes work on phones (plus a mobile bottom quick-nav bar for Home, Ask, Calendar, Menu), while dense authoring/admin pages (`desktopOnly`) show a clean prompt to open on a computer.
  - **Accessibility & Bundle Baseline:** Visible `:focus-visible` keyboard outlines, `MotionConfig reducedMotion="user"`, accessible modal management (`useDialog` Escape/focus return), consistent `<EmptyState variant="error">` load-failure states across data views, and lazy-loaded heavy routes/panels (`SetupWizard`, `ChangePassword`, `DataManagement` tabs, plus shared schema/table metadata isolated in `src/utils/fileTypes.ts` so `xlsx`/`papaparse`/`zod` stay out of non-admin chunks).

---

## 2. Role Dashboards, My Work & Notifications

### Role-Scoped Dashboards & My Actions
- **What it does:** Gives every role a tailored home cockpit plus a unified inbox of everything waiting on their action.
- **Who uses it:** All 15 roles.
- **Where to find it:** `/` and role aliases (`/director`, `/division-head`, `/hod`, `/scientist`, `/technician`, `/hr-admin`, `/finance-admin`, `/system-admin`, `/master-admin`, `/pme`, `/student`, `/project-staff`, `/guest`, `/pending`; `EmpoweredCommittee` routes to `/pms`).
- **How it works:**
  - All 13 operational roles share the two-half **Common Desk** shell (`HomeShell` + `CommonDesk` right column via on-demand `HomeContext`): **My day** (`my_day()` RPC + calendar/holidays/report-due/contract-end feed), **My requests** (`my_requests()` RPC + norms/late flags), **Notices**, and **People** stay anchored on the right (collapsible per user), alongside conditional **Waiting on me** and **My committees** blocks that omit items already shown in the left role half (`One item, one place`), plus **One Door** request catalogue on `/helpdesk/new?key=...`. `Guest` and `DefaultUser` remain quarantined without the Common Desk.
  - Admin/PME/EmpoweredCommittee roles see **My Actions** above their dashboard — consolidating pending PMS reports/evaluations, proposal steps/revisions, progress report & review due slots, project change/closure approvals, committee action items, open helpdesk tickets, contribution requests, and upcoming retirements/contract ends — each deep-linking to the owning screen.
  - **All 6 operational role homes redesigned (`SH1`–`SH2`, `HH1`, `DH1`, `ST1`, `PJ1`, `TS1`):**
    - **Scientist:** Today ring, Fraunces greeting, Ask SURYA + quick starts, ranked **Do this next**, **Quick wins**, **Report timers** (`my_report_timers()` countdown + negative overdue days), committees, milestone tracks, and team summary.
    - **Director:** Fraunces greeting, `division_rollup()` divisions by exception, decision queue, My week, and 4 drillable institute numbers (active projects, sanctioned outlay and % used read from the metric registry, so they match the packs and Ask SURYA).
    - **Division Head / HOD:** `caller_division_codes()` (incl. `acting_assignments`), `Division` | `My own work` mode toggle, exception-first `needsAttention()` division projects, people, instruments, and committees.
    - **Student / ProjectStaff / Technician:** Thesis milestone road + private grievance link (`StudentView`), two contract/CSIR-cap clocks via `my_engagement()` (`ProjectStaffView`), and `equipment_in_charge` + phone-first quick entry (`TechnicianView`).
    - **Finance Admin:** Project utilization, burn-rate outliers (underspend/overrun), sanctioned vs. utilized breakdown.
    - **HR Admin:** Workforce strength, retirements, recruitment funnel, PMS cycle health.
    - **System Admin / Master Admin:** Platform health, access requests, RAG ingestion status, IRINS sync, and governance shortcuts.
    - **Technician:** Division lab/instrument inventory and usage log status.

### PME Desk
- **What it does:** Serves as the central work queue for the Project Monitoring & Evaluation (`PME`) office across the entire project lifecycle, without granting unrelated HR or system-admin privileges.
- **Who uses it:** `PME` (and `MasterAdmin`).
- **Where to find it:** `/pme`
- **How it works:**
  - Displays live counts of items waiting on PME (hiding zero-count rows):
    - Submitted proposals awaiting vetting; proposals missing a track; approved/OM-issued proposals ready to sanction.
    - Sanctioned projects awaiting first funds receipt; milestones proposed/done awaiting confirmation.
    - Overdue reviews & progress reports; overdue signed minutes; change requests & completion reports awaiting PME action; closed projects ready to archive.
    - Legacy pre-SURYA projects needing opening balances; projects with unrecognized status or missing scheme track.
    - Compliance flags: committee meetings missing COI declarations, technology transfers missing Stage VI papers, and major project instruments with no usage logbook entry in 30 days.
  - Includes the **Half-Yearly Report to CPD** builder (for 31 March / 30 September periods), generating a downloadable PDF across HQ projects.

### My Work & Contribution Requests
- **What it does:** Turns "someone needs to confirm or update this record" into an owned, trackable workflow instead of ad-hoc emails, while letting domain data stewards maintain freshness.
- **Who uses it:** Any verified role opens `/work`; `Director`, `DivisionHead`, `HOD`, `HRAdmin`, `SystemAdmin`, `MasterAdmin` can raise requests; data stewards and admins can claim unowned requests.
- **Where to find it:** `/work` (and **Request update** buttons on Project and Instrument detail pages).
- **How it works:**
  - **Raising a request:** Opens a prefilled form from the target record (title, reason, due date, optional assignee). Without an assignee, it auto-routes to the domain's steward (division steward first), or lands in the **Unowned** queue.
  - **Assignee actions (`/work` → To do):** Edit prefilled fields and **Submit update**, or choose **Still correct**, **Ask for clarification**, **Delegate** (a delegate's draft returns as *Prepared* for confirmation), **Not mine**, or **Cannot provide**.
  - **Reviewer actions (`/work` → To review):** Inspect a field-by-field diff and **Accept** (commits via normal RLS-gated update and closes the request) or **Return** with a note. Requesters/reviewers can also **Withdraw**.
  - **Automated staleness sweep:** A daily scheduled sweep (07:15 IST) automatically opens a *Refresh `<domain>` data* request when a stewarded domain exceeds its configured refresh cadence (at most one live request per scope).
  - Every step is logged in an audited timeline (`contribution_request_events`) and pushes bell notifications with deep links (`/work?r=<id>`).

### My Profile & Staff Self-Service
- **What it does:** Provides each verified staff member a linked personal research profile with controlled self-service editing and PDF exports.
- **Who uses it:** Verified staff (`Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `EmpoweredCommittee`, `PME`); Division Heads can view profiles within their division.
- **Where to find it:** `/me` (redirects to the caller's `/staff/:id` dossier).
- **How it works:**
  - **Record tab:** Lists projects, papers, patents, PhD students, and committees tied to the person; clicking any item opens that record.
  - **Self-service fields:** The person can directly edit 5 fields (`Expertise`, `CoreArea`, `Ext`, `orcid`, `VidwanID`); core HR fields remain HR-controlled, and edits appear on the **Timeline** tab.
  - **To confirm (IRINS matching):** Shows IRINS publications or name matches that may belong to the person; clicking **"This is me"** links a paper immediately, while discrepancies route to HR (also surfaced weekly in My Work).
  - **Exports:** Generates a 1-page **CV** PDF and a **Nomination Brief** PDF directly from verified, linked records.
  - **PMS record card:** Displays the person's PMS scores, grade, and lab average strictly to the person, the Director, Empowered Committee, and their current Reporting/Reviewing Officer.

### Notification Bell, Automated Sweeps & AI Suggestions
- **What it does:** Keeps staff informed of deadlines, workflow handoffs, weekly metric digests, and one-click AI record suggestions without requiring constant polling.
- **Who uses it:** All authenticated users.
- **Where to find it:** Notification bell in the TopBar.
- **How it works:**
  - Combines PMS notifications and unified app notifications in one dropdown.
  - Receives nightly deadline reminders, weekly Monday role metric digests, contribution request handoffs, and review calls.
  - Surfaces interactive **AI suggestions** (such as *"Is this paper yours?"* or *"Confirm expertise: ..."*) with one-click Accept/Dismiss buttons; accepting runs the single allowed action under the user's own identity and logs the outcome.

---

## 3. Unified Human Resource & Workforce

### Human Capital (Staff Directory & Analytics)
- **What it does:** Maintains the institute's permanent staff directory, individual dossiers, and demographic/cadre analytics.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `HRAdmin`, `MasterAdmin` (roster & analytics); any verified role can open a linked `/staff/:id` detail page as permitted by RLS.
- **Where to find it:** `/staff`, `/staff/analytics`, `/staff/:id`
- **How it works:**
  - Searchable, filterable staff roster with CRUD modal (`StaffFormModal`) for authorized HR/admins and CSV/table export.
  - Staff detail dossier (`/staff/:id`) displays career timeline, linked research record, expertise tab, PMS record (strictly scoped), documents, and PDF exports.
  - `/staff/analytics` presents interactive ReCharts breakdowns (division, group/cadre, gender, age & tenure distribution, retirement horizon) using the connected chart-to-list filter pattern.

### Divisions & Scorecards
- **What it does:** Organizes divisions, division heads, strength vs. sanctioned posts, and monthly snapshot scorecards for Research Council / Annual Report packs.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `MasterAdmin`.
- **Where to find it:** `/divisions` (Detail & Analytics tabs).
- **How it works:**
  - Division registry with division CRUD (HR/admins), Markdown dossier export, and freshness indicators.
  - **Division Scorecard (Analytics tab):** Displays the 12 standardized institutional metrics per division with deltas since the last monthly snapshot.
  - **Pack PDF ("as on" date):** Renders an official Research Council / Annual Report metric pack frozen to a chosen snapshot date so figures stay identical regardless of when printed.

### Sanctioned Posts & Career Events
- **What it does:** Tracks every sanctioned post individually as the authoritative source for division strength, plus official career events.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `HRAdmin`, `MasterAdmin` (HR edits; managers view scoped division).
- **Where to find it:** `/staff/posts` (`desktopOnly`)
- **How it works:**
  - One row per sanctioned post (`FILLED`, `VACANT`, `ADVERTISED`, `ABEYANCE`, `ABOLISHED`) with sanction references.
  - HR records fills, vacations, advertisements, abeyance, or abolition with order references and effective dates.
  - Supports importing career events (appointments, promotions, transfers) from Excel/CSV sheets.

### Workforce Planning
- **What it does:** Forecasts retirements and vacancies alongside individual project workload to expose succession and capacity risks early.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `HRAdmin`, `MasterAdmin`.
- **Where to find it:** `/staff/planning`
- **How it works:**
  - **Leaving soon — handover (6 / 12 / 24 months):** `leaving_staff()` lists people retiring (DOB + 60) or with a dated transfer/deputation, with a count of what each holds; opening a row runs `staff_handover()` — instruments owned or in charge of, running projects as PI, PhD students, open action items, committee seats, open proposals, assigned helpdesk tickets and data-steward duties, each linked. Both are invoker functions, so RLS decides what the caller sees.
  - **Retirements & Vacancies Outlook (3 / 5 / 10 years):** Groups upcoming retirements and vacant posts by year and flags when a retiring scientist is the sole holder of a core area.
  - **Workload View:** Summarizes active projects and workload per scientist, highlighting overloaded and idle capacity.

### Project Staff & Rule-Checked Engagements
- **What it does:** Manages temporary/project-funded staff (JRFs, SRFs, Project Associates, etc.), their leave, and CSIR §3.3 engagement compliance.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `HRAdmin`, `PME`, `MasterAdmin`.
- **Where to find it:** `/staff/project` (Roster, Engagements, Analytics).
- **How it works:**
  - Tracks contract tenure, project attachments, leave balances, and analytics.
  - **Engagements:** Before recording a project-staff engagement, validates CSIR §3.3 rules (age limit with category relaxation, 6-year maximum tenure minus PhD period, selection committee quorum, NCS posting, waitlist validity, direct engagement rules, and antecedents).
  - Automatically links historical project-staff rows where names are unique, routing ambiguous matches to PME.

### PhD Scholar Tracker
- **What it does:** Tracks AcSIR/PhD scholars from registration through coursework, synopsis, and thesis defence with overdue milestone detection.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `Scientist` (supervisees), `MasterAdmin` (plus `Student` sees their own status on their dashboard).
- **Where to find it:** `/phd` (Roster + Analytics tab).
- **How it works:**
  - **Fellowship end date** (`phd_students.fellowship_end`, form field and import column): the supervisor, co-supervisor and division head are told 180 days before it while the thesis is not yet submitted (`renewal_watch_sweep`, daily 07:25 IST).
  - Lists scholars, supervisors, specializations, and status; supports milestone tracking (`PhDMilestonePanel`) with due dates, completion states, and overdue flags.
  - Analytics tab provides interactive stage, division, and supervisor breakdowns.

### Recruitment Drives
- **What it does:** Manages vacancy advertisements, posts, and applicant progression through a strictly ordered hiring funnel.
- **Who uses it:** `HRAdmin`, `MasterAdmin`.
- **Where to find it:** `/recruitment` (Drives + Analytics tab).
- **How it works:**
  - Tracks vacancy ads, sanctioned/project posts, and applications.
  - Enforces sequential stage progression (`Advertised → Screening → Interview → Offer → Joined`), preventing stage skipping and logging every transition.

### Expertise Finder
- **What it does:** Answers *"Who in the institute can work on X?"* for team assembly, proposal staffing, and committee nominations.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `HRAdmin`, `PME`, `MasterAdmin` (HR/MasterAdmin curate vocabulary; staff confirm/add tags on their own profile).
- **Where to find it:** `/expertise` (plus Expertise tab on `/staff/:id`).
- **How it works:**
  - Search by free text and/or controlled vocabulary terms (`expertise_terms`).
  - Ranks people with confirmed expertise tags first, followed by people whose projects, publications, patents, or notes mention the topic — showing clickable proof links, active project load, overload warnings, and retirement dates.
  - Generates a 1-page **Shortlist PDF**.
  - `HRAdmin` / `MasterAdmin` manage the controlled vocabulary (add and merge terms).

### Acting Charges
- **What it does:** Grants temporary acting authority (`HOD`, `DivisionHead`, or `Director`) over exact calendar dates without manual role cleanups afterward.
- **Who uses it:** `Director`, `HRAdmin`, `MasterAdmin`.
- **Where to find it:** `/admin/acting`
- **How it works:**
  - Record an acting assignment (*"Person X acts as HoD of Division Y from date A to date B"* with order reference) or end one early.
  - During the active window, the acting officer holds the role and its approvals; once the end date passes, authority stops automatically while preserving the historical record on their career timeline.

---

## 4. Research Operations & Project Lifecycle

SURYA models the complete R&D project lifecycle (`PL0–PL7` + `P3`/`P9`) across four schemes: **In-house (`ULIP`)**, **CSIR HQ (`HQ`)**, **Externally Funded (`EFP`)**, and **Lab Seed / Own (`OLP`)**.

### Proposals & Review Chains
- **What it does:** Provides a private drafting workspace, duplication check, multi-step institutional review chain, and sanctioning workflow that turns an approved proposal directly into an active project record.
- **Who uses it:** `Scientist`, `HOD`, `DivisionHead`, `Director` (draft & submit); `PME`, `FinanceAdmin`, `HRAdmin`, `Director`, review committee/scheme leaders (review/sanction).
- **Where to find it:** `/proposals`, `/proposals/new`, `/proposals/:id/edit`, `/proposals/:id`
- **How it works:**
  - **Drafting Workspace (`/proposals/new`, `/proposals/:id/edit`):**
    - Private to the PI and named Co-PIs until submitted.
    - Organized into 5 sections (**Idea · Plan · Team · Budget · Documents**) with automatic background save plus browser crash recovery. On mobile phones, focuses on Title + Private Notes so ideas can be captured anywhere.
    - Side-by-side **Private Notes** can be promoted straight into Abstract, Problem Statement, Objectives, or Expected Outcomes.
    - **Versions:** Save named checkpoints, compare differences, and restore prior versions.
    - **Non-blocking Readiness Meter:** Lists missing items (e.g., quotation required when equipment ≥ ₹5 lakh per CSIR Rules, signed PDF scan before submit) without blocking draft saves.
    - **Year × Head Budget Editor** auto-calculates requested totals; **Print PDF** stamps the version number on every page for wet/digital signature.
    - **Duplication & Comparable Checks:** Queries `/similar` against indexed documents for prior similar work with page citations, and ranks comparable completed projects on record.
  - **Review & Sanction (`/proposals/:id`):**
    - Track-specific sequential steps (e.g., `ULIP`/`OLP`: PME Vetting → Review Committee → Director Approval; `HQ`: PME Vetting → Finance → Director Forward → HQ Screening → HQ Expert → Competent Authority; `EFP`: PME Vetting → Finance → Director Forward → Competent Authority).
    - Reviewers record Approve / Return / Reject (with signed scan uploads) and leave section comments; on resubmission, reviewers see a diff of what changed.
    - Recording the **Sanction Order** automatically creates the linked `projects` record with sanctioned budget lines, dates, and PI.

### Projects & the Modular Project File
- **What it does:** Serves as the live operational dossier for every sanctioned, ongoing, legacy, or closed R&D project.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `Scientist`, `FinanceAdmin`, `PME`, `MasterAdmin` (on `/projects`), plus any verified role following a link to `/projects/:id` as permitted by RLS. PME (and MasterAdmin) perform official office updates; PIs submit milestones, changes, and completion reports.
- **Where to find it:** `/projects` (Registry + Analytics tab with Theme × TRL matrix), `/projects/:id`
- **How it works:** The Project File (`/projects/:id`) organizes 8 integrated tabs:
  1. **Overview:** Metadata, status/stage badge, expiry warnings, PI/team, Theme & TRL lens, **Ask about this** shortcut, **Request update** button.
  2. **Monitoring:** Live review brief (elapsed time, spend %, milestones met, overdue items) and auto-scheduled review/progress-report slots (`REVIEW_COMMITTEE`, `RESEARCH_COUNCIL`, `TASK_FORCE`, `MONITORING_COMMITTEE`, `STAGE_GATE`, `PROGRESS_REPORT`). PME schedules reviews onto committee meetings, records outcomes (`Continue`, `With changes`, `Hold`, `Recommend foreclosure`, or Stage-Gate `Go` / `Conditional Go` / `Hold` / `Kill` / `Recycle`), and files minutes (flagged if late). Director/PME can **Call for review** ad-hoc. HQ `FTT`/`FTC`/`MMP` projects include the dedicated **Stage-Gate Panel**.
  3. **Funds:** Financial-year and budget-head ledger (`Sanctioned · Received · Spent · Balance`, flagging overspends). PME records receipts (the first receipt transitions a `SANCTIONED` project to `ACTIVE`) and expenditures against signed statements; entries are immutable and corrected via reversals. Includes:
     - **Release Order Reader:** Attaching a release order PDF runs browser text/OCR extraction to pre-fill order number, date, IFD reference, and head-wise amounts for verification.
     - **HQ Paper Packs:** Generates ready-to-submit HQ release packs directly from the file.
     - **Multi-lab Projects:** Tracks nodal vs. participating labs, per-lab money splits, and flags running multi-lab projects lacking a signed IP agreement.
     - **Legacy Rollout:** One-time opening-balance wizard for pre-SURYA projects so historical periods aren't falsely flagged overdue.
  4. **Milestones:** Six-month sub-stage deliverables proposed and reported complete by the PI with evidence; confirmed, returned, or dropped by PME.
  5. **Changes:** PI raises guideline-compliant requests (time overrun, revised cost estimate / RCE, carry forward, rephasing, re-appropriation, inter-lab reallocation, or early foreclosure). Enforces CSIR rules (disallowing forbidden head swaps like Capital ↔ Revenue or extra travel), displays Checklist B & IFD concurrence requirements, generates HQ change packs, and updates budgets/dates automatically upon final approval.
  6. **Closure:** PI writes the completion report (objectives met, what worked/didn't, reusable assets & location, TRL, advice to future teams, follow-on ideas), auto-compiles the financial statement & annexures, and submits through the approval chain. PME then **Publishes & Archives** the final PDF into Ask SURYA and locks the file read-only (pre-SURYA closed projects accept a short lessons note directly). Follow-on ideas launch new linked proposal drafts.
  7. **Outputs:** Linked publications, patents, equipment, MoUs, and technology transfers.
  8. **Timeline:** Unified chronological audit trail of receipts, expenditures, reversals, milestones, stage changes, and filed documents.

### Project Portfolio
- **What it does:** Gives leadership, finance, and PME a single executive triage table across every active project.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `FinanceAdmin`, `PME`, `MasterAdmin`.
- **Where to find it:** `/portfolio`
- **How it works:**
  - Displays elapsed time vs. spend % and milestones met, overdue counts, next due date, last review decision, and an automatic **Behind / Watch / On track** health rating (sorted Behind first).
  - Filterable by scheme track (`ULIP`, `HQ`, `Unclassified`) or attention-only.

### Lessons Learned
- **What it does:** Captures institutional memory from completed projects so future teams avoid repeating mistakes and reuse existing assets.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `FinanceAdmin`, `PME`, `MasterAdmin`.
- **Where to find it:** `/lessons`
- **How it works:** Searchable, outcome-filterable archive of approved completion-report lessons (what worked, what didn't and why, reusable assets, advice) readable institute-wide even for closed projects outside a reader's own division.

### Project Progress Reports
- **What it does:** Manages structured periodic project progress reports tied to monitoring slots.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `Scientist` (create/submit); `PME`, `HRAdmin` (review/read).
- **Where to find it:** `/reports`, `/reports/new`, `/reports/:id`, `/reports/:id/edit` (`desktopOnly` authoring).
- **How it works:** Reports move through `DRAFT → SUBMITTED → REVIEWED`, link to project monitoring slots, and archive submitted PDFs into the unified document registry for Ask SURYA indexing.

### Publication Files (Manuscript Clearance)
- **What it does:** Enforces CSIR publication clearance — plagiarism/ethics checks, HoD clearance & communication numbers, and mandatory co-author consent — before journal submission.
- **Who uses it:** `Scientist`, `Technician`, `HOD`, `DivisionHead`, `Director`, `MasterAdmin`.
- **Where to find it:** `/publication-files`
- **How it works:**
  - Author opens a publication file with the author list → runs ethics & similarity % check → HoD/Director clears the paper and a communication number is issued → every in-house co-author records consent before submission (`SUBMITTED`) → on `PUBLISHED`, the paper automatically joins `scientific_outputs` with all authors linked.

### Facilities, Instruments & Usage Logbooks
- **What it does:** Tracks laboratory equipment, AMC maintenance contracts, and mandatory usage logbooks on major project instruments.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `Technician`, `MasterAdmin` (plus any verified role opening a linked `/facilities/:uInsID` page via RLS).
- **Where to find it:** `/facilities` (Registry + Analytics tab), `/facilities/:uInsID`
- **How it works:**
  - Instrument registry with status tracking, AMC expiry alerts (due/overdue), and related staff/projects rail.
  - **Usage Logbook:** Major instruments above the CSIR equipment threshold maintain operational usage logs; instruments idle for 30+ days surface on the PME desk.

### Partnerships (MoUs & Technology Transfers)
- **What it does:** Centralizes external MoUs and technology commercialization agreements with expiry tracking.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `FinanceAdmin`, `PME`, `MasterAdmin`.
- **Where to find it:** `/partnerships`
- **How it works:**
  - **MoUs tab:** Partner, purpose, validity dates, status, and 90-day expiry warnings.
  - **Tech Transfers tab:** Licensee, agreement type, value (₹ lakhs), status, and evidence attachments — feeding institute commercialization analytics.

### R&D Lifecycle Monitor
- **What it does:** Provides a single end-to-end thread view tracking ideas from proposal stage through sanction, execution, and progress reporting.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `FinanceAdmin`, `PME`, `MasterAdmin`.
- **Where to find it:** `/rnd-monitor`
- **How it works:** Visualizes the stage pipeline across proposals and linked projects so bottlenecks from submission to closure are immediately visible.

---

## 5. Governance

### PMS — Performance Management System (2026 CSIR Guidelines)
- **What it does:** Digitizes the complete CSIR annual scientist appraisal across all three tracks, enforcing guidelines, deadlines, panel scoring, and grievances in Postgres.
- **Who uses it:** `Scientist`, `HOD`, `DivisionHead`, `Director` (appraisees & evaluators/RO/RvO), `EmpoweredCommittee` (final panel), `HRAdmin`, `MasterAdmin` (cycle & committee administration).
- **Where to find it:** `/pms` (hub), `/pms/cycles`, `/pms/evaluation-committees` (`/pms/collegiums` redirects here), `/pms/reports`, `/pms/reports/new`, `/pms/reports/:id`, `/pms/reports/:id/edit`, `/pms/assign`, `/pms/evaluate`, `/pms/evaluate/:evaluationId`, `/pms/committee`, `/pms/grievance`, `/pms/audit`
- **How it works:**
  - **State Machine (RPC-driven):** `DRAFT → SUBMITTED → UNDER_EVALUATION_COMMITTEE_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`, plus terminal `NOT_ASSESSED` (duty days < 90) and `FINALIZED ⇄ UNDER_GRIEVANCE_REVIEW` (representation within 15 days; otherwise recorded as deemed accepted). Absolute cycle lock after November 30.
  - **Three Tracks (resolved server-side by designation):**
    - `STANDARD` (Scientists B–F): 2026 Annexure-A form (13 steps, or 14 steps with **Questionnaire B** for Pay Level 13+ / Sci-E & F; legacy standard form uses 11 steps). Includes **Part I** (Establishment pre-filled from HR records, scientist confirms or reports discrepancies for Establishment verification), **"Fill from my records"** (pulls linked projects, papers, patents, students, and committees of the reporting year; committees see only confirmed lines), Questionnaire A & B, Appendix-A Sections I–V with guideline word limits (I.4 150 words, I.5 100 words, Sections III & IV 300 words total each), and links to **Part V Annual Work Plan**.
    - `ANNEXURE_I` (Chief / Outstanding / Distinguished Scientists): 16-step senior proforma with categorical pen-picture appraisal (no numeric self-score).
    - `ANNEXURE_II` (Director): 19-step Director proforma.
  - **Evaluation & Empowered Committees:** Tiered Evaluation Committees (Tiers I/II/III by scientist grade) record a single panel score (integer 0–100), quorum, 15 behavioural pen-picture items (no marks), critical assessment, and Appendix-B integrity entry. Empowered Committee concurs, upgrades, or downgrades with reasons & quorum (additional reasons required for scores ≥90 or ≤75).
  - **Annexure-B Timeline & PDF Exports:** Tracks the 9-step cycle timeline, overdue counts, generates scientist Report PDFs, and builds the **DG Delay Report PDF**.

### Annual Work Plan (Part V AWP & Browser OCR Import)
- **What it does:** Manages scientists' yearly Annual Work Plans independently and in advance of appraisal, including offline OCR import of legacy/scanned AWP PDFs.
- **Who uses it:** `Scientist`, `HOD`, `DivisionHead`, `Director` (author & review), `HRAdmin`, `MasterAdmin` (import & register).
- **Where to find it:** `/pms/awp`, `/pms/awp/inbox`, `/pms/awp/import` (`desktopOnly`), `/pms/awp/register`
- **How it works:**
  - Scientists author and submit one Part V AWP per reporting year (due May 15) and download its PDF; approved AWPs appear alongside Standard-track PMS reports during committee evaluation.
  - **Approval Inbox (`/pms/awp/inbox`):** Flows Reporting Officer (HoD) → Reviewing Officer → Director (collapsed to a single Director action when the Director serves as RO/RvO). Revisions allowed until September 30 with Director approval.
  - **Offline Browser OCR Import (`/pms/awp/import`):** HR admins drop batch AWP PDFs into the browser; `pdfjs-dist` extracts embedded text or runs offline `tesseract.js` WASM OCR locally (no external network call), pre-fills Part V fields for human verification, and saves into `pms_awps`.
  - **Register (`/pms/awp/register`):** Tracks institute-wide submission and approval completion status.

### Committees, Meetings & Conflict of Interest (COI)
- **What it does:** Runs formal institute committees, meeting agendas, lockable minutes, action items, and mandatory Conflict of Interest declarations.
- **Who uses it:** Approved institute staff (`Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `EmpoweredCommittee`, `PME`).
- **Where to find it:** `/committees`, `/committees/:id`, `/committees/:id/meetings`, `/committees/:id/actions`, `/committees/:id/meetings/:meetId`, `/rooms`
- **How it works:**
  - Manage committee terms, seat memberships (including external members and acting chairs via `acting_assignments`), confidentiality (`institute` \| `members` \| `confidential` enforced by RLS via `committee_can_read`), schedule meetings (`stage` lifecycle synchronized with `status`), book rooms/vehicles/guest houses (`/rooms` with advisory-lock clash protection) and request meeting refreshments (`hospitality_requests`), edit agendas, upload meeting documents, and track action items on a Kanban board (assigned items linked via `assigned_staff_id` surface in assignees' home/actions views).
  - **Rule-driven minutes locking:** Finalized minutes lock per CSIR rules.
  - **COI Declarations:** Every meeting includes Format 1 / Format 2 COI declarations per member (private to the member, chair, and convener); the chair records continue/recuse decisions and prints **Annexure 3** PDF. Missing declarations are flagged on the PME desk without blocking meetings.

### Helpdesk
- **What it does:** Provides internal issue tracking with automatic category routing to the responsible administrative team.
- **Who uses it:** All 15 roles (including `Guest` and `DefaultUser`).
- **Where to find it:** `/helpdesk`, `/helpdesk/new`, `/helpdesk/:id`
- **How it works:** Any user opens a ticket → `helpdesk_routing` routes it to the owning division/team → staff exchange threaded responses and update status through an audited timeline → admins view ticket metrics and analytics.

### Institute Calendar & Holidays
- **What it does:** Combines official institute holidays, manually scheduled events, and automatically derived operational deadlines in one calendar.
- **Who uses it:** All verified roles (`/calendar`); `SystemAdmin` / `MasterAdmin` manage holidays (`/admin/holidays`).
- **Where to find it:** `/calendar`, `/admin/holidays`
- **How it works:** Automatically aggregates committee meetings, PMS deadlines, PhD milestones, project review slots, MoU expiries, and admin-managed gazetted/restricted holidays.

### Audit Log
- **What it does:** Exposes an append-only audit trail across PMS actions and institutional data updates.
- **Who uses it:** `HRAdmin`, `MasterAdmin`.
- **Where to find it:** `/pms/audit` (alias `/audit`)
- **How it works:** Displays PMS state/evaluation logs alongside a merged **"All"** timeline combining HR data changes and PMS events with source badges.

---

## 6. Intelligence, Connected Analytics & Ask SURYA

### Research Intelligence
- **What it does:** Connects publications, intellectual property, and sponsored projects to highlight commercialization potential, patent velocity, cross-division themes, and co-authorship networks.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `MasterAdmin`.
- **Where to find it:** `/intelligence`
- **How it works:**
  - **Commercialisation strip:** Granted patents (licensable assets), filed patents, and external/sponsored project count & value.
  - **Patent pipeline funnel:** Filed → Published → Granted counts with median time-to-grant.
  - **Patent renewal alerts:** for a granted patent, the renewal fee for year k+1 falls due on the k-th anniversary of filing (2nd to 19th). Linked inventors and the division head are told 60 days ahead (`renewal_watch_sweep`). Assumes an Indian filing date.
  - **Emerging themes:** Detects keywords rising across recent project titles in ≥2 divisions.
  - **Collaboration analysis:** Identifies co-authorship pairs and cross-division collaboration strength.

### Explore Graph
- **What it does:** Lets leadership visually traverse relationships across staff, projects, and divisions.
- **Who uses it:** `Director`, `DivisionHead`, `HOD`, `MasterAdmin`.
- **Where to find it:** `/explore` (`desktopOnly`)
- **How it works:** Interactive 2D force-directed relationship network built with `react-force-graph-2d` over RLS-scoped records.

### Metric Registry & Connected Analytics Pattern
- **What it does:** Ensures every official number quoted on dashboards, PDF packs, and Ask SURYA agrees, and makes every analytics chart drillable down to the underlying records.
- **Who uses it:** All analytics-enabled views (`/staff/analytics`, `/divisions`, `/projects`, `/staff/project`, `/phd`, `/recruitment`, `/facilities`).
- **Where to find it:** Standardized metric registry (`metrics` / `metric_value` / `metric_snapshots`) + URL-driven analytics tabs.
- **How it works:**
  - **12 Unified Metrics:** `staff_headcount`, `posts_sanctioned`, `posts_filled`, `posts_vacant`, `projects_active`, `projects_sanctioned_value`, `projects_utilisation_pct`, `reports_overdue`, `reviews_overdue`, `outputs_per_year`, `patents`, and `students_in_progress` — shared identically by Division Scorecards, Research Council Pack PDFs, weekly digests, and Ask SURYA.
  - **Connected Chart-to-List Drilldown:** Clicking any chart segment writes `?filter=<dim>:<value>` into the URL (`useChartFilter`), filters sibling widgets, shows a clearable `FilterChip`, and links directly (`Show N matching ...`) to the identically bucketed entity list whose CSV export matches the filtered view.

### Ask SURYA (Grounded On-Premise AI Assistant)
- **What it does:** Answers natural-language questions across structured institute metrics and indexed institute PDFs — with page-level citations, strict RLS scoping, and zero external data leakage.
- **Who uses it:** All verified roles (excluded for `Guest` and `DefaultUser`).
- **Where to find it:** `/ask`, plus the round **Ask SURYA** button at the bottom-right of every page (and `⌘J` / the top-bar button), which opens a small chat window scoped to the record on screen. **"Ask about this"** on Project, Staff and Instrument pages opens the same window.
- **How it works:**
  - **Three Grounded Answer Modes (logged & badged on every reply):**
    1. **`structured`:** Routes numerical/roster questions to one of **18 whitelisted Python analytics functions** running strictly through the caller's own RLS-scoped JWT (no free-form LLM SQL):
       - *Counts & summaries:* `count_documents_by_status`, `count_projects_by_division`, `count_projects_by_status`, `project_expenditure_summary`, `patent_pipeline_counts`, `count_publications_by_division`, `count_staff_by_division`, `overdue_phd_milestones`, `mou_status_summary`, `tech_transfer_summary`, `metric` (all 12 metric registry definitions).
       - *Entity & covenant intelligence:* `expertise_search` ("who has worked on X"), `project_budget_variance` (burn-rate/overrun early warning), `expertise_succession_risk` (retiring sole experts), `staff_profile` ("who is X"), `projects_for_staff` ("what is X working on"), `division_summary`, `project_team` ("who works on project X").
    2. **`document`:** Traverses hierarchical **PageIndex** JSON trees (`collection_indexes` → `doc_indexes` → `doc_pages`) using local Ollama models and answers strictly from retrieved page text.
    3. **`hybrid`:** Combines structured database counts with cited document evidence.
  - **Strict Refusal Invariant & Clickable Citations:** Every non-refusal document answer carries clickable citations that open the source PDF in a side viewer at the exact `#page=N` via a short-lived signed URL; when evidence is absent, Ask SURYA replies *"Not found in institute documents."*
  - **Entity-Scoped Q&A (`context_entity`):** Opening Ask SURYA from a project, staff, division, or instrument page scopes retrieval to that record's documents and context first.
  - **Follow-ups, Feedback & Scheduled Briefs:** Supports multi-turn conversation history (up to 3 turns in UI / 6 turns API), 👍/👎 ratings logged to `query_log`, and **Scheduled Briefs** (`scheduled_queries`) answered offline by the RAG worker (`--briefs`) and delivered to the user's Notification Bell.

---

## 7. Admin, Data Operations, Capture & RAG

### Data Management & Import Pipeline
- **What it does:** Serves as the central data ingestion, cleaning, stewardship, and record-management backbone for tabular institutional datasets.
- **Who uses it:** `HRAdmin`, `SystemAdmin`, `MasterAdmin`.
- **Where to find it:** `/data` (`desktopOnly`; `/db-wizard` redirects here).
- **How it works:**
  - **Excel / CSV Import Wizard:** Upload spreadsheets → auto-detect or AI-assist unrecognized column mappings (`/map-columns`, human-confirmed before saving and remembered by header fingerprint) → inspect and clean flagged validation rows → import into Supabase.
  - **Freshness Ledger & Data Stewards:** Shows when each domain was last updated (including per-division fan-out attribution via `import_events.division_code` computed from `resolveImportDivisions()`) and lets admins assign domain/division stewards with target refresh cadences (in days).
  - **Harvested Imports Queue:** Reviews spreadsheets automatically captured by the background `ingest/` worker before committing rows to live tables (lazy-loaded on tab activation alongside `DatabaseBuilderPanel` and `EntityRecordsPanel`).
  - **Manage Records & Database Builder:** Inline CRUD and schema inspection tools.

### People / Identity Links
- **What it does:** Resolves free-text names in legacy records (paper authors, patent inventors, project PIs, PhD supervisors/co-supervisors, project staff, unlinked staff logins) to canonical `staff` IDs without risky guesswork; RLS policies key strictly off resolved staff IDs rather than display-name fallbacks.
- **Who uses it:** `Director`, `HRAdmin`, `SystemAdmin`, `MasterAdmin`.
- **Where to find it:** `/data/links` (`desktopOnly`)
- **How it works:** Lists unlinked name occurrences alongside candidate staff matches (`output_authors`, `ip_inventors`, `projects.PrincipalInvestigator`, `phd_students.SupervisorName`, `phd_students.CoSupervisorName`, `project_staff.StaffName`); admins link ambiguous names via dropdowns in `/data/links` (`identity_set_link`) or trigger the safe automatic linker (`identity_link_authors`, which also auto-links unique-email `staff.user_id` pairs and unambiguous keys).

### CSIR Rules Engine
- **What it does:** Centralizes statutory CSIR thresholds and policy constants with effective dates so rule updates never rewrite historical decisions.
- **Who uses it:** `MasterAdmin` (editable); read automatically by proposals, project changes, compliance, project-staff engagements, and committees.
- **Where to find it:** `/admin/rules` (`desktopOnly`)
- **How it works:** Stores each rule as versioned effective-dated rows (e.g., ₹5 lakh major equipment limit, cost overrun DG limit %, project-staff tenure/age limits, CPD half-yearly dates) with Office Memorandum references and verification badges; past files continue using the value active on their date.

### IRINS / Vidwan Sync
- **What it does:** Mirrors research output, patent, and citation metadata from CSIR-AMPRI's IRINS/Vidwan research profiles.
- **Who uses it:** `SystemAdmin`, `MasterAdmin` (monitor); CLI `npm run sync:irins`.
- **Where to find it:** `/irins-sync` (`desktopOnly`)
- **How it works:** Scrapes IRINS profile and publication metadata for staff with a `VidwanID`, updates `irins_profiles`, logs sync runs (`irins_sync_log`), and surfaces unmatched papers on scientists' profiles under *"To confirm"*.

### Unified Document Registry & RAG Monitor Console
- **What it does:** Registers every uploaded PDF/artifact across all SURYA modules in one RLS-protected queue and gives operators full observability over indexing and AI routing quality.
- **Who uses it:** `SystemAdmin`, `MasterAdmin` (monitor console); all modules write documents transparently on workflow upload/submission.
- **Where to find it:** `/admin/rag` (`desktopOnly`)
- **How it works:**
  - Every module stores uploaded artifacts in Supabase Storage (`documents`, `annexures`, `proposal-documents`, `committee-docs`, `project-documents`, `awp-pdfs`, `signatures`) and registers a row in `documents` tagged with one of four RLS-enforced access tiers: `institute`, `division`, `owner`, or `confidential`.
  - The background Python `rag/` worker polls `ingest_status = 'pending'`, extracts text via PyMuPDF (with per-page Tesseract or Ollama Vision OCR fallback), builds PageIndex trees into `doc_indexes`, and marks records `indexed` (or `failed` with a diagnostic message if empty/unreadable).
  - `/admin/rag` lets admins inspect queue status, requeue failed documents, adjust access tiers, monitor latency percentiles and **M3 citation traceability %**, review downvoted queries, label routes for router tuning, and export `query_log` CSVs.

### Zero-Behavior-Change Capture Worker (`ingest/`)
- **What it does:** Harvests spreadsheets and PDFs automatically from existing division shared folders and an intake mailbox so staff don't have to upload manually.
- **Who uses it:** Background infrastructure service (`ingest/`).
- **Where to find it:** Standalone Python worker (`deploy/` NSSM Windows service).
- **How it works:**
  - Polls watched folder trees (`WATCH_ROOT/<DIV_CODE>/...`) and an IMAP mailbox (`BODY.PEEK[]` — marks `\Seen` only after every attachment lands cleanly in Storage/DB; `ingest_sender_map` resolves sender → division), deduplicates by SHA-256 hash, routes `.xlsx`/`.xls`/`.csv` files to `harvested_imports` (for admin review on `/data`), and queues unstructured PDFs into `documents` (`pending`) for automatic `rag/` indexing.

---

## 8. Developer & Operations Commands

| Command | Where | Purpose |
|---|---|---|
| `npm run dev` | Root | Copies offline OCR assets (`predev`) and starts Vite dev server |
| `npm run build` | Root | Copies OCR assets (`prebuild`), runs `tsc -b` type-check, and builds SPA (`dist/`) |
| `npm test` | Root | Runs all Vitest suites (SPA unit/component + PGlite in-process Postgres DB/RLS tests + IRINS tests) |
| `npm run lint` | Root | Runs ESLint across `src/`, `scripts/`, and config files (incl. design-token rules) |
| `node scripts/update-design-debt.mjs` | Root | Verifies `eslint.design-debt.json` has not grown |
| `node --experimental-strip-types scripts/access_matrix.mts` | Root | Generates the raw RBAC Markdown table from `ACCESS_MAP` |
| `npx vitest run src/lib/access/roleFeatures.test.ts -u` | Root | Regenerates `docs/engineering/role_features.md` after `ACCESS_MAP` changes |
| `npm run sync:irins` | Root | Syncs Vidwan/IRINS researcher profiles and publications |
| `python -m pytest` | `rag/` or `ingest/` | Runs Python test suites for RAG API/worker or Capture worker |
| `python preflight.py --worker\|--api` | `rag/` | Checks host readiness (env vars, native DLLs, Ollama, DB schema) |
| `python eval/run_eval.py --corpus-from-db --report` | `rag/` | Evaluates M1–M6 RAG indicators against the DB corpus |
| `python eval/validate_gold.py` | `rag/` | Validates evaluation gold files against corpus documents |
| `python scripts/check_security_definer.py` | Root | Audits every `SECURITY DEFINER` Postgres function for auth guards & `search_path` |

  - **Stage 3 Follow-up Engines, Priorities, Notices & Live Meetings:**
    - **Do-first priorities (`work_priorities`):** Seniors pin up to 3 `OPEN` priorities with a 10+ char reason and target date; assignees mark Seen, Push back (with proposed date), or Done across all six role homes (`DoFirstStrip`); HoDs manage "Priorities I asked" (`HoDView`).
    - **Unified decision queue (`my_decisions()` & `decision_questions`):** Consolidates pending approvals across proposals, progress reports, project changes, closures, room bookings, and hospitality requests into `HoDView` and Common Desk `WaitingOnMeBlock` with `Ask` clarification threads and `my_answer_time()` median tracking.
    - **Automated nudges (`SH4`):** `report_nudge_sweep()` and `reportEscalationLine()` enforce the 30d/7d/2d/0d/-7d-HoD escalation ladder, backed by `home_snooze_tomorrow()` and `my_on_time_record()`.
    - **Notices & Office Orders (`CD4`):** `notices` and `notice_reads` support audience scoping (`ALL`, `PUBLIC`, `DIVISIONS`, `ROLES`, `USERS`), superseding links, and `must_ack` read/acknowledgement receipts in `NoticesBlock`.
    - **Agenda circulation & live attendance (`CM2`–`CM3`):** `MeetingLivePanel` on `/committees/meetings/:id` supports versioned agenda circulation with member receipts, live attendance recording, quorum gating (`meeting_mark_held`), and adjournment with agenda carryover (`meeting_adjourn`).
  - **Stage 4 Signatures, Director Delegation Dial & Pre-Checks:**
    - **Minutes & Shared Signatures (`CM4`–`CM5`):** `MinutesWorkflowPanel` drafts, circulates, approves, and attests committee minutes with a hash-chained `signatures` record and public `/verify/:code` (`VerifySignature`) verification route.
    - **Director Delegation Dial (`DH2`–`DH4`):** `DelegationDialCard` on `DirectorView` configures `SELF` / `HEAD_TELL` / `HEAD_FLAGS` and amount caps while preserving CSIR non-delegable floors; `decision_authority()` / `decision_record()` enforce bounds and `director_flags` support `HOLD` / `AUDIT_SAMPLE` / `CALLBACK`.
    - **HoD Pre-checks (`HH3`) & General Meetings (`CD10`):** Deterministic `runDecisionPrecheck()` rules render pass/finding/not-connected status on HoD decision rows; `general_meeting_schedule()` supports institute-wide assemblies.
  - **Stage 5 Operations Desk, Leave, Letters, Upward Reports & Watch List:**
    - **Operations Desk (`/desk`):** Unified self-service workspace (`OperationsDesk.tsx`) for Forms Shelf (`CD9`), print-friendly views (`CD14`), instrument slot booking with advisory-lock clash detection (`TS2`), project staff leave requests (`PJ2`), attested official letters/certificates (`PJ3`), Inward/Outward Dak register with CSIR HQ filter (`CD8` / `DH5`), and lab safety incidents (`CD16`).
    - **Division Upward Reports (`HH4`) & Director Watch (`DH13`, `CM6`):** `DivisionUpwardReportCard` assembles & sends division drafts from live project/output counts; `DirectorWatchCard` surfaces tagged Director watch items; `action_item_verify()` records committee closure verification.
  - **Stage 6 Role Depth, Quick-Win Polishes, Navigation & Accessibility:**
    - **Role Depth Hub (`/depth`):** Surfaces Technologies/TRL progression (`HH5`), outside collaboration threads with 21d idle flags (`HH6`), equipment fault logs (`TS3`), No-Dues clearances (`CD12`), private grievance submission (`ST4`), portfolio health score (`C1`), division expertise counts (`B1`), and CSV export (`F5`).
    - **Navigation & WCAG (`WP-4` / `WP-6`):** Shared `Breadcrumbs`, `useDialog` Escape/focus-restore hook, and `prefers-reduced-motion` CSS support.
  - **Stage 7 RAG UX, Helpdesk FAQ & Security Hardening:**
    - **Ask SURYA (`E2`, `E3`) & Helpdesk FAQ (`D4b`):** `extractChartData()` renders inline bar breakdowns for structured numeric answers; users can pin/reuse queries in `user_profiles.preferences`; `ResolvedFaqPanel` surfaces matching resolved tickets on `/helpdesk/new`.
    - **Resilience & 2FA (`Q`, `F6`, `WP-8`):** `OfflineServiceBanner` alerts on offline/disconnected state, `MfaEnrollmentCard` supports TOTP 2FA enrollment, and `infra/nginx.surya.conf` provides production TLS/CSP/rate-limit hardening.

---

## 9. Quick Update Checklist

Use this quick map whenever you change SURYA in the future so documentation stays accurate without guesswork:

| Change you made in code | Update in `FEATURES.md` | Also update |
|---|---|---|
| **Added or updated a user feature / page** | Add/edit its block under the right domain section (§1–§7) | [app.md](app.md) if high-level capability changed |
| **Added a route or changed role permissions** | Update **Who uses it** / **Where to find it** in the matching section | `src/constants/access.ts` → run `roleFeatures.test.ts -u` & `access_matrix.mts` |
| **Changed a workflow / status transition** | Update **How it works** in `FEATURES.md` | [system_design.md](system_design.md) state machine diagram |
| **Added/changed a database table, view, or RPC** | Mention new capability only if user-facing | [database_design.md](database_design.md) and/or [api_spec.md](api_spec.md) |
| **Added an Ask SURYA analytics function or metric** | Add function name under §6 Ask SURYA / Metrics | [api_spec.md](api_spec.md) §C.6 & [coding_standards.md](coding_standards.md) |
| **Added an npm/Python package or test suite** | Add new CLI command to §8 if applicable | [STACK.md](STACK.md) & [development_guide.md](development_guide.md) |

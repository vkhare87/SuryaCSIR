# Data Model
_Last updated: 2026-04-30_

All tables live in the `public` schema unless noted. Apply via the 8-file baseline in `supabase/migrations/` (see `supabase/ops/README.md` for the stage table and apply order).

---

## Auth / RBAC

### `auth.users` (Supabase managed)
Supabase Auth built-in table. `id uuid` is the user's UID referenced by all other tables.

### `user_roles`
Multi-role table. Composite PK `(user_id, role)` — one user can have multiple roles.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid` | FK → `auth.users.id` |
| `role` | `text` | CHECK: `Director`, `DivisionHead`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `DefaultUser`, `HOD`, `Student`, `ProjectStaff`, `Guest` |
| `division_code` | `text NULL` | NULL for cross-division roles |
| `must_change_password` | `boolean` | default `true` |

**RLS**: user reads own rows; MasterAdmin/SystemAdmin read all; MasterAdmin manages all.

### `user_profiles`
Per-user settings and active role selection.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid PK` | FK → `auth.users.id` |
| `email` | `text NULL` | copied from `auth.users.email` |
| `must_change_password` | `boolean` | default `true` |
| `active_role` | `text NULL` | current active role (drives dashboard) |
| `last_seen_at` | `timestamptz NULL` | updated on sign-in |

**Trigger**: `on_auth_user_created` auto-inserts `DefaultUser` + profile on every new `auth.users` row.

---

## HR Analytics

> Column names are quoted CamelCase — mirrors Excel source headers. Do not rename without a coordinated migration + code change.

### `divisions`
| Column | Type |
|--------|------|
| `"divCode"` | `text PK` |
| `"divName"`, `"divDescription"`, `"divResearchAreas"` | `text` |
| `"divHoD"`, `"divHoDID"` | `text` (divHoDID → `staff.ID`) |
| `"divSanctionedstrength"`, `"divCurrentStrength"` | `integer` |
| `"divStatus"` | `text` |

### `staff`
| Column | Type |
|--------|------|
| `"ID"` | `text PK` |
| `"LabCode"`, `"EmployeeType"`, `"Name"`, `"Designation"`, `"Group"` | `text` |
| `"Division"` | `text` (→ `divisions.divCode`) |
| `"DoAPP"`, `"DOJ"`, `"DOB"` | `text` (date strings `DD.MM.YYYY` / `DD/MM/YYYY` / `YYYY-MM-DD`) |
| `"Cat"`, `"AppointmentType"`, `"Level"`, `"CoreArea"`, `"Expertise"` | `text` |
| `"Email"`, `"Ext"`, `"VidwanID"`, `"ReportingID"` | `text` (ReportingID → `staff.ID`) |
| `"HighestQualification"`, `"Gender"` | `text` |

**Write RLS**: HRAdmin + SystemAdmin.

### `projects`
| Column | Type |
|--------|------|
| `"ProjectID"` | `text PK` |
| `"ProjectNo"`, `"ProjectName"`, `"FundType"` | `text` |
| `"SponsorerType"`, `"SponsorerName"`, `"ProjectCategory"`, `"ProjectStatus"` | `text` |
| `"StartDate"`, `"CompletioDate"` | `text` (note: `CompletioDate` is a typo — baked in schema) |
| `"SanctionedCost"`, `"UtilizedAmount"` | `text` |
| `"PrincipalInvestigator"` | `text` (name string — not FK; fuzzy-matched in code) |
| `"DivisionCode"` | `text` (→ `divisions.divCode`) |
| `"Extension"`, `"ApprovalAuthority"` | `text` |

### `project_staff`
| Column | Type |
|--------|------|
| `"id"` | `text PK` |
| `"StaffName"`, `"Designation"`, `"RecruitmentCycle"` | `text` |
| `"DateOfJoining"`, `"DateOfProjectDuration"` | `text` |
| `"ProjectNo"` | `text` (→ `projects.ProjectNo`) |
| `"PIName"`, `"DivisionCode"` | `text` |

### `phd_students`
| Column | Type |
|--------|------|
| `"EnrollmentNo"` | `text PK` |
| `"StudentName"`, `"Specialization"` | `text` |
| `"SupervisorName"`, `"CoSupervisorName"` | `text` (name strings — not FK) |
| `"FellowshipDetails"`, `"CurrentStatus"`, `"ThesisTitle"` | `text` |
| `"ProjectNo"` | `text` (→ `projects.ProjectNo`) |
| `"DivisionCode"` | `text` (→ `divisions.divCode`) |

### `equipment`
| Column | Type |
|--------|------|
| `"UInsID"` | `text PK` |
| `"Name"`, `"EndUse"` | `text` |
| `"Division"` | `text` (→ `divisions.divCode`) |
| `"IndenterName"`, `"OperatorName"`, `"Location"` | `text` |
| `"WorkingStatus"`, `"Movable"`, `"RequirementInstallation"` | `text` |
| `"Justification"`, `"Remark"` | `text` |

### `contract_staff`
| Column | Type |
|--------|------|
| `"id"` | `text PK` |
| `"Name"`, `"Designation"`, `"Division"` | `text` |
| `"DateOfJoining"`, `"ContractEndDate"`, `"LabCode"`, `"DateOfBirth"` | `text` |
| `"AttachedToStaffID"` | `text` (→ `staff.ID`) |

### `scientific_outputs`
| Column | Type |
|--------|------|
| `id` | `text PK` |
| `title` | `text NOT NULL` |
| `authors` | `text[]` |
| `journal` | `text` |
| `year` | `integer` |
| `doi` | `text NULL` |
| `impact_factor` | `float NULL` |
| `citation_count` | `integer NULL` |
| `division_code` | `text` (→ `divisions.divCode`) |

### `ip_intelligence`
| Column | Type |
|--------|------|
| `id` | `text PK` |
| `title` | `text` |
| `type` | `text` CHECK: `Patent`, `Copyright`, `Design`, `Trademark` |
| `status` | `text` CHECK: `Filed`, `Published`, `Granted` |
| `filing_date`, `grant_date` | `text` |
| `inventors` | `text[]` |
| `division_code` | `text` |

---

## PMS (Performance Management System)

> All PMS tables use snake_case columns and UUID PKs.

### `appraisal_cycles`
| Column | Type |
|--------|------|
| `id` | `uuid PK` |
| `name` | `text NOT NULL` |
| `start_date`, `end_date` | `date` |
| `status` | `text` CHECK: `OPEN`, `CLOSED`, `ARCHIVED` |

### `pms_reports`
| Column | Type |
|--------|------|
| `id` | `uuid PK` |
| `cycle_id` | `uuid → appraisal_cycles` |
| `scientist_id` | `uuid → auth.users` |
| `status` | `text` — state machine (see flow below) |
| `period_from`, `period_to` | `date` |
| `self_score` | `integer` [0–100] (2026 scale) |
| `submitted_at` | `timestamptz` |
| `signature_url` | `text` |
| `previous_pms_submitted_on_time` | `boolean` (Part I) |
| `previous_pms_submission_date` | `date` (Part I) |
| `duty_days` | `integer` — admin-entered; < 90 blocks appraisal |
| `system_remark` | `text` — auto-populated on NOT_ASSESSED / non-submission |
| `score_communicated_at` | `timestamptz` — anchors 15-day representation window |
| `non_submission_certificate_path` | `text` |

**Status machine (2026)**: `DRAFT → SUBMITTED → UNDER_EVALUATION_COMMITTEE_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`, plus `NOT_ASSESSED` (terminal) and `FINALIZED ⇄ UNDER_GRIEVANCE_REVIEW`.

Transitions via SECURITY DEFINER RPCs: `pms_submit_report`, `pms_assign_evaluators`, `pms_finalize_report`, `pms_set_duty_days`, `pms_mark_not_assessed`, `pms_record_non_submission`, `pms_submit_representation`, `pms_resolve_representation`. Deadlines derived by `pms_deadline(cycle_id, kind)` (May 15 / Jun 30 / Jul 31 / Nov 30 of the cycle end year); after Nov 30 all report-scoped writes are blocked by trigger.

### `pms_report_sections`
JSONB-per-section store. One row per `(report_id, section_key)`. Includes `section_v_shortfall` (Appendix-A Shortfall Tracking).

### `pms_annexures`
File attachments (file_path = Supabase Storage path).

### `pms_evaluation_committees`
Named committee per cycle with `tier IN ('I','II','III')` — I evaluates Sci B/C/D, II → E, III → F.

### `pms_evaluation_committee_members`
`(committee_id, user_id, role)` where `role IN ('REPORTING_OFFICER','REVIEWING_OFFICER','EC_MEMBER')`. Valid panel = odd count with all three roles (`pms_committee_panel_valid`).

### `pms_empowered_committee_members`
`(cycle_id, user_id, is_chairman)`. Valid = 3/5/7 ordinary members + exactly one Chairman (Director/DG).

### `pms_grievance_members`
`(cycle_id, user_id)` — 5-member independent Grievance Redressal Committee per cycle.

### `pms_evaluations`
One row per `(report_id, evaluator_id)`. `scores` JSONB worksheet + `total_score integer [0–100]` + conditional reason columns (`reasons_for_outstanding`, `reasons_below_threshold`, `suggestions_for_improvement`). `status`: `PENDING → IN_PROGRESS → COMPLETED`.

Auto-advance trigger: when all evaluations for a report hit `COMPLETED`, report moves to `EMPOWERED_COMMITTEE_REVIEW`.

### `pms_committee_decisions`
One per report. `final_score integer [0–100]` + `justification` (min 50 chars) + same three conditional reason columns. Score ≥ 90 requires `reasons_for_outstanding`; ≤ 75 requires `reasons_below_threshold` + `suggestions_for_improvement`.

### `pms_awp_activities`
Part V Annual Work Plan. `(report_id, nature_of_activity, role, time_committed_percentage numeric, milestones jsonb)`.

### `pms_representations`
One per report. `(report_id, scientist_id, grounds, status PENDING/RESOLVED, resolution, resolved_by, resolved_at)` — written only via RPCs.

### `pms_audit_logs`
Append-only log. `(user_id, action, entity_type, entity_id, details jsonb)`.

### `pms_notifications`
`(user_id, type, title, body, report_id, read)`. INSERT only via RPCs (SECURITY DEFINER).

---

## RLS Summary

| Table set | Read | Write |
|-----------|------|-------|
| HR tables (divisions/staff/projects/…) | All authenticated | HRAdmin + SystemAdmin |
| `user_roles` | Own rows + admins | MasterAdmin + SystemAdmin |
| `user_profiles` | Own row + admins | Own row + admins |
| `pms_reports` | Owner + admins + evaluators + committee | Owner (DRAFT only) via RPC |
| `pms_awp_activities` | Same as parent report | Owner (DRAFT only) |
| `pms_representations` | Owner + admins + grievance members | RPCs only |
| `pms_empowered_committee_members` / `pms_grievance_members` | All authenticated | Admins |
| `pms_evaluations` | Evaluator (own) + admins | Evaluator (own) via RPC |
| `pms_audit_logs` | Admins only | RPCs only |
| `pms_notifications` | Owner + admins | RPCs only |

---

## Helper Functions

| Function | Notes |
|----------|-------|
| `user_has_role(role text)` | SECURITY DEFINER — used in RLS policies to avoid recursion |
| `pms_is_admin()` | True if user has HRAdmin/SystemAdmin/MasterAdmin role |
| `pms_is_evaluation_committee_member(cycle_id)` | True if user is in any Evaluation Committee for that cycle |
| `pms_is_grievance_member(cycle_id)` | True if user is in the cycle's Grievance Committee |
| `pms_committee_panel_valid(committee_id)` | Odd member count + all three panel roles present |
| `pms_empowered_committee_valid(cycle_id)` | 3/5/7 members + exactly one Chairman |
| `pms_deadline(cycle_id, kind)` | May 15 / Jun 30 / Jul 31 / Nov 30 of cycle end year |
| `pms_cycle_locked(cycle_id)` | True after Nov 30 — write triggers reject all changes |
| `pms_set_updated_at()` | Trigger function — maintains `updated_at` on update |
| `handle_new_auth_user()` | Trigger — auto-creates `DefaultUser` + profile on signup |

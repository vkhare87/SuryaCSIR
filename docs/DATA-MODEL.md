# Data Model
_Last updated: 2026-04-30_

All tables live in the `public` schema unless noted. Apply via `supabase/migrations/00000000000000_init.sql`.

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
| `self_score` | `numeric(3,2)` [0.5–1.1] |
| `submitted_at` | `timestamptz` |
| `signature_url` | `text` |

**Status machine**: `DRAFT → SUBMITTED → UNDER_COLLEGIUM_REVIEW → CHAIRMAN_REVIEW → EMPOWERED_COMMITTEE_REVIEW → FINALIZED`

Transitions via SECURITY DEFINER RPCs: `pms_submit_report`, `pms_assign_evaluators`, `pms_save_chairman_review`, `pms_finalize_report`.

### `pms_report_sections`
JSONB-per-section store. One row per `(report_id, section_key)`.

### `pms_annexures`
File attachments (file_path = Supabase Storage path).

### `pms_collegiums`
Named group per cycle. Can have multiple CHAIRMAN + MEMBER entries.

### `pms_collegium_members`
`(collegium_id, user_id, role)` where `role IN ('CHAIRMAN', 'MEMBER')`.

### `pms_evaluations`
One row per `(report_id, evaluator_id)`. `scores` is JSONB. `status`: `PENDING → IN_PROGRESS → COMPLETED`.

Auto-advance trigger: when all evaluations for a report hit `COMPLETED`, report moves to `CHAIRMAN_REVIEW`.

### `pms_chairman_reviews`
One per report. `recommended_min` / `recommended_max` range.

### `pms_committee_decisions`
One per report. `final_score` + `justification` (min 50 chars).

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
| `pms_reports` | Owner + admins + evaluators + collegium | Owner (DRAFT only) via RPC |
| `pms_evaluations` | Evaluator (own) + admins | Evaluator (own) via RPC |
| `pms_audit_logs` | Admins only | RPCs only |
| `pms_notifications` | Owner + admins | RPCs only |

---

## Helper Functions

| Function | Notes |
|----------|-------|
| `user_has_role(role text)` | SECURITY DEFINER — used in RLS policies to avoid recursion |
| `pms_is_admin()` | True if user has HRAdmin/SystemAdmin/MasterAdmin role |
| `pms_is_collegium_member(cycle_id)` | True if user is in any collegium for that cycle |
| `pms_set_updated_at()` | Trigger function — maintains `updated_at` on update |
| `handle_new_auth_user()` | Trigger — auto-creates `DefaultUser` + profile on signup |

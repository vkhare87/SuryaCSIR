# SURYA — API Specification

_Complete interface reference. Current as of 2026-11-21 (8-file consolidated DB baseline `20261121000001`–`20261121000008`)._

SURYA exposes **three API surfaces**. There is no bespoke Node/REST tier — that is deliberate ([app.md §8](app.md#8-non-goals)).

| # | Surface | Base | Consumer | Auth |
|---|---|---|---|---|
| **A** | Supabase **PostgREST** — table & view reads/writes | `${VITE_SUPABASE_URL}/rest/v1` | SPA (via `@supabase/supabase-js`) | Anon key + user JWT; **RLS + column/table ACLs are the gate** |
| **B** | Supabase **RPC** — the mutation/workflow API | `${VITE_SUPABASE_URL}/rest/v1/rpc/<fn>` | SPA / `rag` worker | Same JWT (or `service_role` for internal/cron RPCs); each function authorizes itself |
| **C** | **Ask SURYA HTTP API** — the AI service | `${VITE_RAG_URL}` (prod: `/rag`, proxied by nginx) | SPA (`src/lib/ask/client.ts`) | `Authorization: Bearer <user JWT>` |

---

# Part 0 — Conventions

## 0.1 Authentication

Every surface authenticates with the **same Supabase-issued user JWT**. There is no API key, no service account, and no second identity system for end users.

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <session.access_token>
```

Obtained via `supabase.auth.signInWithPassword()`; refreshed by the client library. The SPA reads it with `supabase.auth.getSession()` — never from `localStorage`.

Surface C forwards the same token. `rag-api` verifies it (`auth.verify_token`), builds a client whose PostgREST calls carry it (`auth.scoped_client`), and enforces the database gate function (`can_use_ask_surya()` for Ask SURYA endpoints, `caller_is_admin()` for `/map-columns`). **The AI service can never read anything the asking user could not read directly.**

## 0.2 Authorization

Authorization is not expressed in the API shape. It is expressed in:

- **RLS policies** — a read you are not entitled to returns `[]`, not `403`. A write you are not entitled to returns a policy violation (`403` / Postgres `42501`).
- **Least-privilege table & column ACLs** — workflow/audit tables revoke direct `INSERT`/`UPDATE`/`DELETE` from `authenticated`, and `user_profiles`, `notifications`, and `proposal_review_comments` narrow `UPDATE` to whitelisted columns.
- **RPC authorization blocks** — every `SECURITY DEFINER` function opens with an explicit check and pins `search_path`; failure raises a Postgres exception surfaced as `400` with the message.
- **Actor assertions** — any parameter named `p_actor_id` / `p_author_id` / `p_submitted_by` must equal `auth.uid()`. Client-supplied identity is never trusted.

## 0.3 Versioning

**Unversioned, by design.** The SPA and the schema deploy together; there is no third-party consumer to hold compatible. Compatibility is preserved by convention instead:

- Migrations are append-only; the shipped 8-file 2026-11-21 baseline (`20261121000001`–`20261121000008`) is never edited once applied.
- RPC signatures are extended with `DEFAULT`-valued trailing parameters, never reordered. Replacing a signature ships as a new timestamped migration.
- Answers from surface C are stamped with `catalog_version` so a logged answer traces to the code that produced it.

If an external consumer ever appears, version surface C by path prefix (`/v1/query`); do not version B — the client is in-repo.

## 0.4 Pagination

**Surface A/B.** PostgREST caps responses at `max_rows = 1000`, declared in `supabase/config.toml`. The SPA pages with `fetchAll` (`src/lib/data/fetchAll.ts`) at `PAGE_SIZE = 1000`.

> The two numbers must stay equal. A page size **above** the cap makes a capped response indistinguishable from a final short one, so paging stops early and truncates silently. If you raise `max_rows`, raise `PAGE_SIZE` with it — never past it.

```ts
supabase.from('staff').select('*').order('ID').range(offset, offset + 999)
```

**Surface C** does not paginate: `/query` returns one answer, `/similar` returns at most `MAX_SIMILAR_MATCHES = 6`. Internally, `read_docs` pages `doc_indexes` at 200 rows, so corpus size is not capped.

## 0.5 Errors

**Surface A/B** — PostgREST error envelope:

```json
{ "code": "42501", "details": null, "hint": null,
  "message": "new row violates row-level security policy for table \"pms_reports\"" }
```

| HTTP | Cause |
|---|---|
| `400` | Constraint violation, or a `RAISE EXCEPTION` from an RPC authorization block |
| `401` | Missing/expired JWT |
| `403` | RLS policy or grant violation on write |
| `404` | Unknown table or function |
| `409` | Unique constraint conflict (e.g. a second report for the same cycle+scientist) |

A read blocked by RLS is **not** an error — it is an empty array. Do not treat `[]` as "no data"; it may mean "not yours".

**Surface C** — FastAPI `{"detail": "..."}`:

| HTTP | `detail` | Cause |
|---|---|---|
| `400` | `empty question` / `empty text` | Blank body field |
| `400` | `raw_headers and target_fields required` | `/map-columns` missing input |
| `400` | `too many headers/fields (max 400)` | `/map-columns` over the cap |
| `400` | `header too long (max 256 chars)` | `/map-columns` header over limit |
| `401` | `missing bearer token` | No/malformed `Authorization` header |
| `401` | `invalid token` | JWT rejected by GoTrue |
| `403` | `forbidden` | Caller blocked by `can_use_ask_surya` feature gate (or not `caller_is_admin` on `/map-columns`) |
| `404` | `record not found` | Supplied `context_entity` does not exist or is unreadable under caller's RLS |
| `504` | `model timeout` | LLM host exceeded `RAG_*_TIMEOUT_S` |

On `/query/stream` a mid-stream failure arrives as an SSE frame, not an HTTP status: `data: {"error": "model timeout"}`.

## 0.6 Idempotency and side effects

- All `pms_*`, `proposal_*`, `project_report_*`, `project_change_*`, `project_completion_*`, and `publication_*` transition RPCs assert the current state before writing, so a duplicate call raises rather than double-applying.
- `helpdesk_create_ticket` is **not** idempotent — it mints a new token per call.
- `contribution_request_create` is **not** idempotent; `contribution_request_act` asserts the current status, and `contribution_requests_sweep` / `notifications_sweep` / `metric_snapshot_run` dedupe by key (`dedupe_key` or primary key `ON CONFLICT DO NOTHING`).
- `project_reverse_entry` inserts a negating compensating row; each entry can be reversed once (`reverses_id UNIQUE`).
- Imports upsert on primary key, so re-importing the same file is safe.
- Document capture dedupes on SHA-256 `content_hash`.

---

# Part A — Data API (PostgREST)

Accessed exclusively through `@supabase/supabase-js`. Raw HTTP is documented only so the shape is legible.

## A.1 Reading

```ts
const { data, error } = await supabase
  .from('projects')
  .select('*')
  .eq('DivisionCode', 'CMPD')
  .order('ProjectID');
```

```http
GET /rest/v1/projects?DivisionCode=eq.CMPD&order=ProjectID&select=*
```

Embedded reads use PostgREST's resource embedding, with `!inner` to make the join filtering:

```ts
supabase.from('doc_indexes')
  .select('document_id, tree, documents!inner(id, title, storage_path, entity_type)')
  .in('documents.entity_type', ['proposal', 'meeting']);
```

## A.2 Entity endpoints

Full column-level definitions are in [database_design.md](database_design.md). Read scope is enforced by RLS policies and least-privilege grants, not query parameters.

| Table / View Group | Read scope | Direct client write |
|---|---|---|
| `divisions` | All authenticated (`SELECT true`) | HRAdmin · SystemAdmin · MasterAdmin |
| `staff`, `project_staff`, `contract_staff`, `phd_students`, `phd_milestones`, `scientific_outputs`, `ip_intelligence`, `mous`, `tech_transfers`, `labs` | Role- & division-scoped (`caller_sees_all_personnel()` / division / self / supervisor) | HRAdmin · SystemAdmin · MasterAdmin (data admins) |
| `equipment` | Division/all-personnel + Technician in division + `owner_user_id` | HRAdmin · SystemAdmin · MasterAdmin |
| `projects` | All-personnel · Finance · PME · division managers · PI (`pi_staff_id`) · team · proposal co-PIs/PI (`projects_select_parties`) | **MasterAdmin + PME only** (`projects_write_master`, `projects_write_pme`); frozen once `stage = 'ARCHIVED'` |
| `vacancy_advertisements`, `vacancy_posts` | All authenticated | Data admins (`drive_stage` trigger-locked; advance via `recruitment_advance`) |
| `committees`, `committee_members`, `meetings`, `agenda_items`, `action_items`, `meeting_documents` | All authenticated | Chair/secretary + admins; minutes lock after finalization (`unlock_meeting_minutes` to reopen) |
| `tickets`, `ticket_responses`, `ticket_events`, `coi_declarations` | Submitter/member + assignee/chair/convener + admins | **RPC only** (`SELECT` grant only) |
| `calendar_events`, `holidays` | By `visibility` (`OrgWide` / `Division` / `Personal`) | Creator + admins |
| `proposals`, `proposal_copis`, `proposal_documents`, `proposal_budget_lines`, `proposal_notes`, `proposal_review_comments`, `proposal_review_steps`, `proposal_versions`, `proposal_status_history` | `proposals_can_read` (`DRAFT`: PI, creator, named co-PIs; submitted: division managers, Director, admins, PME, scheme leader). `proposal_notes` strictly creator-only | Author direct UPDATE on `proposals` / `proposal_budget_lines` in editable statuses; `proposal_notes` owner CRUD; `proposal_review_comments.resolved_at` column-narrowed to PI; review steps & versions **RPC only** |
| `project_reports`, `project_report_history` | `project_reports_can_read` | Editable statuses only; transitions via RPC |
| `project_labs`, `project_budget_lines`, `project_fund_receipts`, `project_expenditure`, `project_milestones`, `project_review_slots`, `project_change_requests`, `project_change_steps`, `project_completion_reports`, `project_completion_steps`, `project_documents`, `project_events`, `project_ip_agreements`, `project_stage_items`, `project_stage_deliverables` | Follows parent `projects` RLS (`project_stage_items` open to verified users) | **RPC only** (`SELECT` only), except `project_documents` INSERT (`arm`) by office/PI per `doc_type` |
| `sanctioned_posts`, `sanctioned_post_events`, `staff_career_events`, `staff_profile_changes`, `output_authors`, `ip_inventors`, `project_staff_persons`, `project_selections`, `project_engagements`, `project_staff_leave`, `publication_files`, `publication_author_consents`, `recruitment_events` | Verified / role- / division- / author-scoped RLS | **RPC / trigger only** (`SELECT` grant only; `staff_expertise` allows owner insert/update/delete + curator suggestion insert) |
| `pms_reports`, `pms_report_sections`, `pms_annexures`, `pms_evaluations`, `pms_panel_scores`, `pms_part1`, `pms_report_items`, `pms_committee_decisions`, `pms_representations`, `pms_condonations`, `pms_awps`, `pms_awp_revisions`, `pms_pen_picture_items` | Owner + admins + assigned evaluators/panel + Empowered/Grievance committees (`pms_awp_can_read` for AWPs) | Owner in `DRAFT` on report/sections/annexures; panel scores, decisions, representations, Part I, items & AWPs **RPC only** |
| `documents`, `doc_indexes`, `doc_pages`, `collection_indexes` | `documents_can_read` — four-tier ladder (`institute`, `division`, `owner`, `confidential`) | `documents` INSERT by owner (`owner`/`confidential`, or any tier for admin/Director); UPDATE by SystemAdmin/MasterAdmin; indexes/pages worker (`service_role`) only |
| `query_log`, `scheduled_queries`, `route_labels` | `query_log`/`scheduled_queries`: own rows (+ admin reads on `query_log`); `route_labels`: admins | `query_log`: caller INSERT + owner `feedback` UPDATE; `scheduled_queries`: owner INSERT/DELETE (`ard`); `route_labels`: admins |
| `user_roles`, `user_profiles`, `acting_assignments`, `access_requests` | Own rows + admins (`acting_assignments` verified users) | **Column-narrowed grants** (`user_profiles`: `active_role`, `last_seen_at` only); `user_roles` & `acting_assignments` **RPC only** |
| `feature_controls`, `feature_grants`, `notifications`, `ai_action_log`, `csir_rules`, `metrics`, `metric_snapshots` | Verified/all authenticated (`feature_grants` & `notifications` & `ai_action_log` own/admin) | `feature_controls` & `feature_grants`: MasterAdmin; `notifications`: column `UPDATE (status, updated_at)` by owner; rest **RPC / cron / trigger only** |
| `data_stewards`, `contribution_requests`, `contribution_request_events` | Operational / reviewer / requester / assignee / delegate | **RPC only** (`SELECT` only) |
| `harvested_imports`, `ingest_sender_map`, `import_events`, `import_field_mappings` | Data admins | Data admins |
| `audit_log`, `pms_audit_logs` | Admins | Triggers / RPCs only |
| **Views (8):** `division_strength`, `entity_timeline`, `project_portfolio`, `staff_link_gaps`, `staff_project_links`, `staff_research_summary`, `unique_staff_names`, `project_lessons` | First 7 run `security_invoker` (inherit underlying RLS); `project_lessons` runs definer-style explicitly gated to `status = 'APPROVED' AND caller_is_verified()` | Read-only |

## A.3 Storage

**Seven private buckets** (`public = false`, 18 `storage.objects` policies):

| Bucket | Module / Consumer | Read & Write Policy Summary |
|---|---|---|
| **`documents`** | Central registry, harvested captures, publication similarity reports, recruitment orders | Upload under `{auth.uid()}/%`; readable only when an owning `documents` row passes `documents_can_read()` — stray uploads leak nothing; delete by owner or SystemAdmin/MasterAdmin |
| **`annexures`** | PMS self-appraisal attachments | Read via `pms_can_read_report_path(name)`; upload by report owner or PMS admin; delete blocked once `finalized_*` |
| **`signatures`** | PMS digital/scanned signatures | Read via `pms_can_read_report_path(name)`; insert/update by report owner or PMS admin |
| **`proposal-documents`** | Proposals & review scans (`{proposal_id}/{doc_type}/...`) | Read via `proposals_can_read`; upload gated by role & proposal status (`signed_proposal`/`quotation` by creator in editable state; `step_scan`/`sanction_order` by active reviewers; `om_document` by admin) |
| **`project-documents`** | Execution receipts, expenditure statements, milestone evidence, minutes, change/closure scans, stage deliverables | Read iff caller can see the owning `projects` row; upload gated by `project_caller_may_file(project_id, doc_type)` |
| **`committee-docs`** | Committee & meeting documents/minutes | Read iff referenced in `meeting_documents`; upload by Director, SystemAdmin, or MasterAdmin |
| **`awp-pdfs`** | Imported / scanned Annual Work Plan PDFs | Admin upload/delete; read by PMS admin or when linked from `pms_awps.source_pdf_path` |

```ts
await supabase.storage.from('documents').upload(path, file);
const { data } = await supabase.storage.from('documents').createSignedUrl(path, 60);
```

Citation deep-links are built by `citationHref` (`src/lib/ask/citations.ts`) from the `storage_path` returned in each citation.

---

# Part B — RPC API

Called as `supabase.rpc('<name>', { ...params })`. Every `SECURITY DEFINER` function runs as the owner, bypasses RLS, pins `search_path`, and opens with an explicit authorization check (statically verified by `scripts/check_security_definer.py`).

## B.1 Authentication, Users & RBAC

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `approve_access_request` | `p_request_id uuid, p_roles text[], p_division text` | `void` | SystemAdmin / MasterAdmin. Writes `user_roles`, marks request `APPROVED` |
| `reject_access_request` | `p_request_id uuid, p_note text` | `void` | SystemAdmin / MasterAdmin |
| `admin_set_user_roles` | `p_user_id uuid, p_roles text[], p_active_role text, p_division text` | `void` | MasterAdmin. Only path that changes a user's assigned roles |
| `admin_list_users` | — | `TABLE(user_id, email, active_role, roles, division_code, must_change_password, last_seen_at)` | Admins. Joins `auth.users` with roles and profiles |
| `admin_force_password_reset` | `p_user_id uuid` | `void` | Admins. Sets `must_change_password = true` |
| `admin_staff_link_gaps` | — | `TABLE(table_name, row_key, name_column, unresolved_name)` | Admins. Unlinked staff/user rows (data-quality report) |
| `clear_must_change_password` | — | `void` | Self. Refuses unless the password hash actually changed (`password_fingerprint`) |
| `user_directory` | — | `TABLE(user_id uuid, email text, roles text[])` | `caller_sees_directory()`. Powers user pickers without exposing `auth.users` |
| `merge_user_preferences` | `p_patch jsonb` | `void` | Self. Shallow-merges into own `user_profiles.preferences` |
| `acting_assign` | `p_role text, p_division text, p_principal uuid, p_acting uuid, p_from date, p_to date, p_order_ref text` | `uuid` | Director (HoD charges), HRAdmin, MasterAdmin. Refuses self-assignment; honoured by `caller_has_role()` and `caller_in_division()` |
| `acting_end` | `p_id uuid, p_last_day date` | `void` | Director (HoD), HRAdmin, MasterAdmin |
| `acting_capacity` | `p_user uuid, p_on date` | `text` | Returns acting capacity label for `entity_timeline` |
| `caller_staff_id` | — | `text` | Resolves signed-in user's `staff."ID"` |
| `list_combined_audit_logs` | `p_source text = 'all', p_limit integer = 25, p_offset integer = 0` | `TABLE(...)` | Admins. Paged unified audit feed across `pms_audit_logs` and `audit_log` |

```ts
const { error } = await supabase.rpc('admin_set_user_roles', {
  p_user_id: userId,
  p_roles: ['Scientist', 'DivisionHead'],
  p_active_role: 'DivisionHead',
  p_division: 'CMPD',
});
```

## B.2 PMS & Annual Work Plans (AWP)

### Legacy & core PMS actions (`src/contexts/PMSContext.tsx`)

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `pms_submit_report` | `p_report_id uuid` | `void` | Owner, status `DRAFT`, cycle unlocked, before `SELF_APPRAISAL` (or condoned date). → `SUBMITTED`, sets `submitted_at` |
| `pms_assign_evaluators` | `p_report_id uuid, p_committee_id uuid` | `void` | PMS admin. Panel must satisfy `pms_committee_panel_valid` and 2026 tier check (`proforma_version = '2026'`). Creates `pms_evaluations` rows on legacy track → `UNDER_EVALUATION_COMMITTEE_REVIEW` |
| `pms_finalize_report` | `p_report_id uuid, p_final_score integer, p_justification text, p_reasons_outstanding text = NULL, p_reasons_below text = NULL, p_suggestions text = NULL` | `void` | Empowered committee member. Standard legacy track → `FINALIZED`, sets `score_communicated_at` |
| `pms_finalize_senior_report` | `p_report_id uuid, p_remarks text` | `void` | Empowered committee. Annexure-I/II pen picture, no numeric score |
| `pms_set_duty_days` | `p_report_id uuid, p_duty_days integer` | `void` | PMS admin |
| `pms_mark_not_assessed` | `p_report_id uuid, p_remark text = NULL` | `void` | PMS admin. Terminal state for `duty_days < 90` |
| `pms_record_non_submission` | `p_report_id uuid, p_cert_path text` | `void` | PMS admin. Records non-submission certificate |
| `pms_submit_representation` | `p_report_id uuid, p_grounds text` | `void` | Owner, report `FINALIZED`, within 15 days of `score_communicated_at`, `grounds` ≥ 20 chars → `UNDER_GRIEVANCE_REVIEW` |
| `pms_resolve_representation` | `p_report_id uuid, p_resolution text, p_revised_score integer = NULL, p_reasons_outstanding text = NULL, p_reasons_below text = NULL, p_suggestions text = NULL` | `void` | Grievance committee member for that cycle → `FINALIZED` |
| `pms_condone_delay` | `p_report_id uuid, p_condoned_until date, p_reason text` | `void` | Director or admin. `DRAFT` only, date ≤ June 30, reason ≥ 20 chars |
| `pms_save_awp_activities` | `p_report_id uuid, p_activities jsonb` | `void` | Owner (`DRAFT`). Replaces legacy `pms_awp_activities` rows |

### PMS 2026 Assessment (`src/lib/pms/assessment2026Api.ts`)

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `pms_timeline_status` | `p_cycle_id uuid` | `TABLE(step, label, due, done, pending, overdue)` | PMS admins, Director. Annexure-B 9-step schedule counts |
| `pms_delay_report` | `p_cycle_id uuid` | `TABLE(report_id, scientist, status, step, due, days_late)` | PMS admins, Director. Late reports across steps |
| `pms_timeline_sweep` | — | `integer` | Cron (`service_role`) only. Deemed acceptance after 15 days + overdue reminders |
| `pms_part1_prefill` | `p_cycle_id uuid` | `integer` | PMS admins. Populates unverified Part I snapshots from `staff` |
| `pms_part1_report_discrepancy` | `p_report_id uuid, p_text text` | `void` | Owner. Records Part I discrepancy and clears verification |
| `pms_part1_verify` | `p_report_id uuid, p_data jsonb = NULL` | `void` | PMS admins. Verifies Part I, optionally applying corrections |
| `pms_prefill_from_profile` | `p_report_id uuid` | `integer` | Owner (`DRAFT`). Pulls `staff_profile_facts` lines; never overwrites touched rows |
| `pms_report_item_set` | `p_item_id uuid, p_state text, p_text text = NULL` | `void` | Owner (`DRAFT`). Confirm / edit / remove an item |
| `pms_report_item_add` | `p_report_id uuid, p_section text, p_text text` | `uuid` | Owner (`DRAFT`). Adds a manual `ADDED` line item |
| `pms_record_panel_score` | `p_report_id uuid, p_score integer, p_reasons_outstanding text, p_reasons_below text, p_suggestions text, p_pen_picture jsonb, p_integrity text, p_adverse_remarks text, p_critical_assessment text, p_remarks text, p_quorum_present integer, p_signed_scan_path text = NULL` | `void` | Reporting Officer or PMS admin. Records 2026 panel score + all 15 `pms_pen_picture_items` ratings (quorum ≥ half panel) → `EMPOWERED_COMMITTEE_REVIEW` |
| `pms_finalize_report_2026` | `p_report_id uuid, p_action text, p_final_score integer, p_reasons text, p_suggestions text, p_general_comments text, p_critical_assessment text, p_quorum_present integer` | `void` | Empowered Committee member or PMS admin. `CONCUR \| UPGRADE \| DOWNGRADE` (quorum = chair + half ordinary members) → `FINALIZED` |
| `pms_score_history` | `p_staff_id text` | `TABLE(cycle_id, cycle, score, grade, lab_average, normalised, remarks)` | Person, Director, open-cycle Empowered Committee, current RO/RvO |

### Annual Work Plan (`pms_awps` / `pms_awp_revisions`)

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `pms_awp_save_draft` | `p_staff_id text, p_year text, p_payload jsonb` | `uuid` | Owner (`staff.user_id = auth.uid()`), status `DRAFT` / `RETURNED` |
| `pms_awp_submit` | `p_awp_id uuid` | `void` | Owner, by May 15 IST of year 1; split must total 100%; RO required → `WITH_RO` (or `WITH_DIRECTOR` if RO is Director) |
| `pms_awp_ro_review` | `p_awp_id uuid, p_verdict text, p_reasons text, p_payload jsonb = NULL` | `void` | Reporting Officer. `NOT_REASONABLE` requires reasons ≥ 20 chars; `p_payload` allowed only for `BLANK_FORWARDED` → `WITH_RVO` / `WITH_DIRECTOR` |
| `pms_awp_rvo_review` | `p_awp_id uuid, p_remarks text` | `void` | Reviewing Officer → `WITH_DIRECTOR` |
| `pms_awp_director_decide` | `p_awp_id uuid, p_decision text, p_remarks text, p_payload jsonb = NULL` | `void` | Director only (§5.E.a.iv). `ACCEPTED` or `MODIFIED` (total 100%, remarks ≥ 20 chars) → `APPROVED`, sets `communicated_at` |
| `pms_awp_return` | `p_awp_id uuid, p_reasons text` | `void` | Current reviewer or admin (except Director stage) → `RETURNED` |
| `pms_awp_forward_blank` | `p_staff_id text, p_year text` | `uuid` | Admin. §5.E.a.iii — forwards missing/late AWP to RO (`source = 'BLANK_FORWARDED'`) |
| `pms_awp_import` | `p_staff_id text, p_year text, p_payload jsonb, p_status text, p_pdf_path text, p_ro_verdict text, p_ro_date date, p_approved_date date` | `uuid` | Admin. Imports `APPROVED` / `WITH_DIRECTOR` / `WITH_RO` AWP (split = 100%) |
| `pms_awp_request_revision` | `p_awp_id uuid, p_reasons text, p_after jsonb` | `uuid` | Owner, RO, RvO, Director, or admin. `APPROVED` only, until Sep 30 IST of year 1 (total 100%) |
| `pms_awp_decide_revision` | `p_revision_id uuid, p_approve boolean, p_remarks text` | `void` | Director only. Approved revision replaces AWP content |
| `pms_awp_set_reviewing_officer` | `p_awp_id uuid, p_staff_id text` | `void` | Admin. Allowed while `DRAFT` / `RETURNED` / `WITH_RO` |
| `pms_awp_for_report` | `p_report_id uuid` | `SETOF pms_awps` | Any authorized report reader; redacts confidential projects server-side via `pms_awp_redact_projects` |

**Read-only PMS helpers:** `pms_is_admin()`, `pms_is_evaluation_committee_member(p_cycle_id)`, `pms_is_grievance_member(p_cycle_id)`, `pms_committee_panel_valid(p_committee_id)`, `pms_empowered_committee_valid(p_cycle_id)`, `pms_deadline(p_cycle_id, p_kind)`, `pms_cycle_locked(p_cycle_id)`, `pms_caller_track()`, `pms_grade(p_score)`, `pms_annexure_b_due(p_cycle_id, p_step)`.

## B.3 Proposals & Sanction Chain

### Submission & workspace (`src/lib/proposals/workspaceApi.ts`, `ProposalsContext.tsx`)

| Function / Call | Parameters | Authorization + effect |
|---|---|---|
| `proposal_submit(p_id uuid)` | `p_id uuid` | Creator/PI only, `DRAFT` \| `REVISION_REQUESTED`. Validates `proposal_readiness(p_id)`, requires a `signed_proposal` doc, snapshots a `submitted` version into `submitted_version_id`, opens a round of `proposal_review_steps`, transitions → `SUBMITTED` |
| `proposal_save_copis(p_proposal_id uuid, p_copis jsonb)` | `p_proposal_id, p_copis` | Creator in editable status. Replaces `proposal_copis` rows |
| `proposal_save_version(p_id uuid, p_label text) → uuid` | `p_id, p_label` | Creator while `DRAFT` \| `REVISION_REQUESTED`. Saves a `manual` `proposal_versions` snapshot |
| `proposal_restore_version(p_version_id uuid)` | `p_version_id` | Creator while `DRAFT` \| `REVISION_REQUESTED`. Snapshots current state, then restores content + co-PIs |
| `proposal_missing_fields(p proposals) → text[]` | row | Read-only check matching `src/lib/proposals/readiness.ts` field-for-field |
| `proposal_readiness(p_id uuid) → text[]` | `p_id uuid` | Full submission gate: `proposal_missing_fields` + `equipment_quotation` (≥ ₹5L per `csir_rule`) + `works_not_allowed` (HQ non-MMP/FCP) |
| Direct RLS writes | `proposals` / `proposal_budget_lines` / `proposal_notes` / `proposal_review_comments` | Creator autosave, author-private notes, and reviewer comments / PI `resolved_at` |

### Review chain & sanction (`src/lib/proposals/api.ts`)

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `proposal_record_step` | `p_step_id uuid, p_decision text, p_notes text, p_document_id uuid, p_meeting_id uuid = NULL` | `void` | `proposal_caller_may_act(p, step.kind)` — never PI/author/co-PI. `APPROVE` needs `step_scan` → `proposal_status_after(kind)`; `RETURN` needs note or open comment → `REVISION_REQUESTED`; `REJECT` needs reason → `REJECTED` |
| `proposal_set_track` | `p_id uuid, p_track text` | `void` | PME on a proposal in review; accepts any `project_schemes` code and opens/reconciles review steps |
| `proposal_sanction` | `p_id uuid, p_project_no text, p_sanction_ref text, p_sanction_date date, p_amount numeric, p_document_id uuid, p_project_id text = NULL` | `text` (`ProjectID`) | PME (not a party), from `APPROVED` \| `OM_ISSUED`, requires `sanction_order` document; validates HQ project code format; creates `projects` row (`SANCTIONED`), copies `project_budget_lines`, transitions proposal → `LINKED` |
| `proposal_link_project` | `p_id uuid, p_project_no text` | `void` | Admin / PME (`OM_ISSUED` → `LINKED`) |
| `proposal_archive` | `p_id uuid` | `void` | Admin / PME (`OM_ISSUED` → `ARCHIVED`) |

> **Retired (`EXECUTE` revoked from `authenticated`):** `proposal_set_under_review(uuid, text, date)`, `proposal_request_revision(uuid, text)`, `proposal_reject(uuid, text)`, `proposal_recommend(uuid)`, `proposal_approve(uuid, numeric, date)`, `proposal_issue_om(uuid, text, date, uuid)`. All transitions after submission go through `proposal_record_step` and `proposal_sanction`.

## B.4 Project Execution, Progress Reports, Compliance & Multi-Lab

"The office" is `project_caller_is_office(p_project_id)`: PME or MasterAdmin, and never a party to the project (`project_caller_is_party(p_project_id)`). Read-only role predicates `project_caller_is_pi(p_project_id)`, `project_caller_is_party(p_project_id)`, and `project_caller_is_office(p_project_id)` are also client-callable for UI action gating.

### Execution & financial ledger (`src/lib/projects/projectFileApi.ts`)

| Function | Parameters | Returns | Who & effect |
|---|---|---|---|
| `project_record_receipt` | `p_project_id text, p_received_on date, p_amount numeric, p_head text, p_source text, p_order_no text, p_order_date date, p_ifd_file_no text, p_ifd_date date, p_document_id uuid, p_notes text = NULL` | `uuid` | Office. Needs `receipt_order`; HQ track requires IFD no./date; sanctioned project cannot exceed `sanctioned_cost`; first receipt moves `SANCTIONED → ACTIVE` |
| `project_record_expenditure` | `p_project_id text, p_fiscal_year text, p_period text, p_head text, p_amount numeric, p_document_id uuid, p_notes text = NULL` | `uuid` | Office. Needs `expenditure_statement`; running projects only; updates `"UtilizedAmount"` on sanctioned projects |
| `project_reverse_entry` | `p_kind text, p_entry_id uuid, p_reason text` | `uuid` | Office. Inserts opposite-sign entry referencing `reverses_id`; once per entry (`receipt \| expenditure`) |
| `project_milestone_add` | `p_project_id text, p_title text, p_target_date date` | `uuid` | Office (`→ PLANNED`) or PI (`→ PROPOSED`) |
| `project_milestone_report` | `p_id uuid, p_achieved_on date, p_note text, p_document_id uuid` | `void` | PI or co-PI. `PLANNED → REPORTED`, requires `milestone_evidence` |
| `project_milestone_decide` | `p_id uuid, p_decision text, p_note text` | `void` | Office. `ACCEPT` (`→ PLANNED`), `CONFIRM` (`→ ACHIEVED`), `RETURN` (`→ PLANNED`), `DROP` |
| `project_link_output` | `p_kind text, p_output_id text, p_project_id text` | `void` | PME, MasterAdmin, or PI. Links/unlinks `publication` (`scientific_outputs`), `patent` (`ip_intelligence`), or `instrument` (`equipment`) |
| `project_set_lens` | `p_project_id text, p_theme_code text, p_trl_target integer, p_trl_reached integer` | `void` | PME, MasterAdmin, or PI. Updates domain theme (`01`–`09`) & TRL (`1`–`9`) |

### Progress reports (`src/contexts/ProjectReportsContext.tsx`)

| Function | Parameters | Effect |
|---|---|---|
| `project_report_submit(p_id uuid)` | `p_id` | `DRAFT` \| `REVISION_REQUESTED` → `SUBMITTED`; trigger binds/closes matching review slot |
| `project_report_review(p_id uuid, p_decision text, p_notes text)` | `p_id, p_decision, p_notes` | Authorized by `project_reports_can_review`. → `UNDER_REVIEW` \| `REVISION_REQUESTED` \| `REVIEWED` |

### Monitoring (`src/lib/projects/projectFileApi.ts`)

| RPC / View | Parameters | Returns | Effect |
|---|---|---|---|
| `project_slot_schedule` | `p_slot_id uuid, p_meeting_id uuid` | `void` | Office. Links pending non-report review slot onto meeting agenda (`subject_type = 'project_review'`) |
| `project_slot_record` | `p_slot_id uuid, p_held_on date, p_decision text, p_outcome text, p_minutes_document_id uuid` | `void` | Office. Marks review `DONE`. `HOLD` moves project → `ON_HOLD`; go-ahead returns `ON_HOLD → ACTIVE`; sets `minutes_due` if minutes omitted |
| `project_slot_add_minutes` | `p_slot_id uuid, p_document_id uuid` | `void` | Office. Attaches `minutes` doc and clears `minutes_due` |
| `project_call_review` | `p_project_id text, p_due_date date, p_reason text` | `uuid` | Director, PME, MasterAdmin (non-party). Creates `CALLED_REVIEW` slot & notifies PI |
| `my_due_project_slots` | — | `TABLE(slot_id, project_id, project_no, kind, body, period_label, due_date)` | Pending progress reports & called reviews due within 30 days for caller's projects |
| `project_portfolio` *(view)* | — | Portfolio health columns | `security_invoker` view over running projects |

### Change requests (`src/lib/projects/projectFileApi.ts`)

| RPC | Parameters | Returns | Effect |
|---|---|---|---|
| `project_change_save` | `p_id uuid, p_project_id text, p_kind text, p_justification text, p_payload jsonb` | `uuid` | PI or office (then author only). Saves `DRAFT` / `RETURNED` change on a running project |
| `project_change_submit` | `p_id uuid, p_document_id uuid` | `void` | Author. Requires `change_request` doc, checks all prohibitions (`project_change_deltas`), opens approval route (`csir_rules` RCE threshold) |
| `project_change_withdraw` | `p_id uuid` | `void` | Author, before any review step is recorded |
| `project_change_record_step` | `p_step_id uuid, p_decision text, p_notes text, p_document_id uuid, p_meeting_id uuid = NULL, p_order_no text = NULL, p_order_date date = NULL, p_ifd_file_no text = NULL, p_ifd_date date = NULL` | `void` | Step owner (`project_change_caller_may_act`: PME, FinanceAdmin, Director/PME, scheme leader), never a party. Final `APPROVE` re-runs checks & applies effect |
| `my_change_steps` | — | `TABLE(step_id, change_id, project_id, project_no, change_kind, step_kind, submitted_at)` | Pending steps awaiting the caller |
| `project_change_deltas` / `project_head_position` | `(p_project_id, p_kind, p_payload)` / `(p_project_id)` | `TABLE(...)` | Read-only validation & per-year, per-head financial position |

### Project closure & legacy rollout

| RPC / View | Parameters | Returns | Effect |
|---|---|---|---|
| `project_completion_save` | `p_project_id text, p_fields jsonb` | `uuid` | PI. Creates/updates report (`DRAFT`/`RETURNED`); first save moves project → `CLOSING` |
| `project_completion_submit` | `p_project_id text, p_document_id uuid` | `void` | PI. Validates §5.4 fields (`project_completion_missing`), snapshots `project_financial_statement` & `project_completion_annexures`, opens route |
| `project_completion_record_step` | `p_step_id uuid, p_decision text, p_notes text, p_document_id uuid` | `void` | Step owner (non-party). `APPROVE` (with `closure_order`) or `RETURN` (note); final approval closes project |
| `project_archive` | `p_project_id text, p_document_id uuid` | `void` | PME / MasterAdmin (non-party). Archives `CLOSED`/`FORECLOSED` project → `ARCHIVED` (read-only trigger), promotes report to `institute` tier |
| `my_closure_items` | — | `TABLE(item, project_id, project_no, step_id, step_kind, end_date)` | Pending closure steps (`step`) and due reports (`due`) |
| `project_financial_statement` / `project_completion_annexures` | `p_project_id text` | `jsonb` | Read-only compiled closure pack previews |
| `project_lessons` *(view)* | — | Approved lessons rows | Signed-in verified users (`caller_is_verified()`) |
| `project_legacy_complete` | `p_project_id text, p_track text, p_category text, p_start date, p_end date, p_sanction_ref text, p_sanction_date date, p_document_id uuid, p_lines jsonb, p_received jsonb, p_spent jsonb, p_as_of date` | `void` | PME / MasterAdmin (non-party). Once-only onboarding for pre-SURYA running projects with opening balances |
| `project_legacy_lessons` | `p_project_id text, p_fields jsonb` | `uuid` | PI or PME. Records approved lessons on pre-SURYA closed projects |
| `project_legacy_pending` | — | `TABLE(project_id, project_no, project_name, stage, track)` | Running legacy projects not yet brought into ledger |

### Compliance, packs, multi-lab & IP (`src/lib/compliance/api.ts`, `src/lib/projects/labs.ts`)

| RPC | Parameters | Returns | Effect |
|---|---|---|---|
| `project_pack` | `p_project_id text, p_kind text, p_change_request_id uuid = NULL` | `jsonb` | Project readers. Builds `FIRST_RELEASE` · `NEXT_YEAR_RELEASE` · `REPHASING` · `REAPPROPRIATION` pack + Checklist B |
| `project_checklist_b` | `p_change_request_id uuid` | `TABLE(item, ok, detail)` | Non-throwing Checklist B verification items |
| `project_cpd_halfyearly` | `p_period_end date` | `TABLE(...)` | Half-yearly CPD monitoring metrics across HQ projects |
| `project_stage_deliverable_record` | `p_project_id text, p_item_key text, p_document_id uuid` | `void` | PI or PME. Records stage I–VI deliverable (`FTT`/`FTC`/`MMP`) & logs `stage_gate` event |
| `project_transfer_gaps` | — | `TABLE(project_id, project_no, transfer_title, missing)` | FTT/FTC/MMP transfers lacking Stage VI deliverables |
| `equipment_log_usage` | `p_equipment_id text, p_used_on date, p_hours numeric, p_user_staff_id text, p_purpose text` | `uuid` | Equipment owner, project PI, or PME. Appends `equipment_usage_log` |
| `equipment_logbook_required` | `p_equipment_id text` | `boolean` | True when linked to a project and cost ≥ `project.major_equipment_threshold_inr` |
| `pme_compliance_counts` | — | `TABLE(declarations_missing, transfers_missing_docs, logbooks_idle)` | PME, admins, Director |
| `project_lab_set` | `p_project_id text, p_lab_code text, p_role text, p_rc_document_id uuid` | `void` | Office. Sets nodal/participating lab (`NODAL \| PARTICIPATING`) |
| `project_entry_set_lab` | `p_kind text, p_id uuid, p_lab_code text` | `void` | Office. Assigns `receipt \| expenditure \| budget` entry (and reversal) to a lab |
| `project_ip_agreement_add` | `p_project_id text, p_document_id uuid, p_signed_on date` | `uuid` | Office. Records multi-lab CSIR §6.2 IP sharing agreement |
| `project_lab_money` | `p_project_id text` | `TABLE(lab_code, role, sanctioned, received, spent, balance)` | Read-only lab-wise budget/balance summary |
| `project_ip_agreement_missing` | `p_project_id text` | `boolean` | True for multi-lab projects missing an IP agreement |

## B.5 Posts, People & Recruitment

Client wrappers in `src/lib/people/api.ts` and `src/lib/recruitment/drives.ts`:

| RPC / View | Parameters | Returns | Who & effect |
|---|---|---|---|
| `post_create` | `p_post_code, p_group, p_level, p_designation, p_discipline, p_division, p_category, p_sanction_ref` | `uuid` | HRAdmin, MasterAdmin. Adds `VACANT` sanctioned post |
| `post_fill` / `post_vacate` / `post_set_state` | `p_post_id, p_staff_id/p_state, p_on, p_reason, p_order_ref` | `void` | HRAdmin, MasterAdmin. Moves post state & writes `sanctioned_post_events` |
| `staff_workload` | `p_staff_id text = NULL` | `TABLE(staff_id, name, division, active_projects, as_pi, sanctioned_value, awp_year, awp_time_pct, overload)` | Invoker. Highlights overload (`> 4` running projects) |
| `workforce_outlook` | `p_years integer = 5` | `TABLE(kind, year, discipline, division, ref, label, single_holder)` | Invoker. Retirements + vacancies forecast |
| `career_events_import` | `p_rows jsonb` | `integer` | HRAdmin, MasterAdmin. Upserts `staff_career_events`; rejects unknown staff IDs |
| `project_staff_person_save` | `p_id uuid, p jsonb` | `uuid` | PME, HRAdmin, MasterAdmin |
| `project_selection_create` | `p_project_id, p_position_code, p_mode, p_advert_ncs_ref, p_advert_on, p_committee, p_exigency_note, p_waitlist_valid_until, p_minutes_document_id` | `uuid` | PME, HRAdmin, MasterAdmin |
| `project_engage` | `p_selection_id uuid, p_person_id uuid, p_from date, p_to date, p_emoluments numeric = NULL` | `uuid` | PME, HRAdmin, MasterAdmin. Enforces every CSIR §3.3 rule (`project_engagement_check`) |
| `project_engagement_check` | `p_person_id uuid, p_project_id text, p_position_code text, p_from date, p_to date, p_selection_id uuid = NULL` | `TABLE(rule, ok, detail)` | Evaluates age, tenure cap, selection quorum, NCS/waitlist/direct path, antecedents (`ok` NULL = missing catalogue) |
| `project_staff_tenure_days` | `p_person_id uuid, p_on date, p_extra_from date = NULL, p_extra_to date = NULL` | `integer` | Counts deduplicated days excluding PhD research window |
| `project_staff_leave_add` | `p_engagement_id uuid, p_kind text, p_from date, p_to date` | `uuid` | PME, HRAdmin, MasterAdmin |
| `project_staff_backfill` / `_legacy_pending` / `_link_legacy` | `(none)` / `(p_legacy_ids text[], p_person_id uuid = NULL)` | `integer` / `TABLE(...)` / `uuid` | PME, HRAdmin, MasterAdmin. Links legacy `project_staff` rows cleanly into engagements |
| `recruitment_advance` | `p_advt_id text, p_stage text, p_document_id uuid = NULL, p_note text = NULL` | `void` | HRAdmin, MasterAdmin. Advances `drive_stage` (one step or `Closed`) + appends `recruitment_events` |
| `staff_project_links` · `staff_research_summary` *(views)* | — | Project-role & summary counts | `security_invoker` views powering workload & profile screens |

## B.6 Research Profile, Publications, Identity Links & Expertise

| RPC / View | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `staff_profile_facts` | `p_staff_id text, p_from date = NULL, p_to date = NULL` | `TABLE(section, record_type, record_id, title, role, date_from, date_to, amount, link)` | Invoker (respects `staff` RLS). Unified key-linked profile across projects, outputs, IP, transfers, students, committees, AWP, lessons, and equipment |
| `update_own_profile` | `p_fields jsonb` | `void` | Staff owner (`user_id = auth.uid()`). Whitelisted strictly to `Expertise`, `CoreArea`, `Ext`, `orcid`, `VidwanID`; writes `staff_profile_changes` |
| `profile_consistency_issues` | `p_staff_id text = NULL` | `TABLE(staff_id, kind, record_ref, detail)` | Invoker. Detects IRINS/output/PI/supervisor/AWP discrepancies |
| `profile_consistency_sweep` | — | `integer` | Cron (`service_role`) only. Raises Monday consistency `contribution_requests` rows |
| `publication_file_create` | `p_title text, p_division text, p_authors jsonb` | `uuid` | Staff author. Opens manuscript clearance dossier (`DRAFT`) |
| `publication_consent` | `p_file_id uuid, p_contribution text` | `void` | Listed in-house author while `DRAFT` |
| `publication_move` | `p_file_id uuid, p_to text, p_details jsonb = '{}'` | `text` | Corresponding author (`DRAFT → ETHICS_CHECK → SUBMITTED → ACCEPTED → PUBLISHED`) or HoD / DivisionHead / Director / MasterAdmin (`ETHICS_CHECK → CLEARED / DRAFT`, non-author). Mints `communication_no` at clearance; creates `scientific_outputs` at `PUBLISHED` |
| `identity_link_authors` | — | `integer` | HRAdmin / SystemAdmin / MasterAdmin. Re-runs unambiguous auto-linking on `output_authors`, `ip_inventors`, `projects.pi_staff_id`, `phd_students.{supervisor,cosupervisor}_staff_id`, `project_staff.staff_id`, and unique-email `staff.user_id` |
| `identity_link_gaps` | — | `TABLE(kind, record_id, name, candidates, pos)` | Admins, Director. Ambiguous unlinked names |
| `identity_set_link` | `p_kind text, p_record_id text, p_position integer, p_staff_id text` | `void` | Admins (for `OUTPUT`, `IP`, `projects.PrincipalInvestigator`, `phd_students.SupervisorName`, `phd_students.CoSupervisorName`, `project_staff.StaffName`) or staff claiming/releasing self on `OUTPUT`/`IP`. Locks `link_source = 'manual'` on author/inventor rows |
| `expertise_suggest` | `p_staff_id text` | `TABLE(term_id, label, kind, evidence_count)` | Suggests active taxonomy terms found as whole words in the person's titles |
| `expertise_find` | `p_term_ids uuid[] = NULL, p_text text = NULL` | `TABLE(staff_id, name, division, designation, confirmed_terms, evidence, evidence_count, active_projects, overload, retires_on)` | Ranked capability search (called by UI & Ask SURYA `expertise_search`) |
| `expertise_merge` | `p_from uuid, p_into uuid` | `void` | `caller_is_expertise_curator()`. Marks `p_from` as `MERGED` and transfers tags |
| `entity_timeline` *(view)* | — | Chronological event feed | Unifies 7 audit/event sources with acting capacity |

## B.7 Rules & Metrics

| RPC | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `csir_rule` | `p_key text, p_on date = ist_today()` | `jsonb` | Verified users (`INVOKER`). Returns effective rule JSONB; raises if unconfigured |
| `csir_rule_set` | `p_key text, p_value jsonb, p_unit text, p_effective_from date, p_source_ref text, p_verified boolean` | `uuid` | MasterAdmin. Appends a newer effective-dated rule and closes the prior row |
| `metric_value` | `p_key text, p_scope jsonb = '{}'` | `numeric` | Invoker. Dispatches strictly via `metrics.fn` registry (called by scorecard & Ask SURYA `metric`) |
| `metric_table` | — | `TABLE(metric_key, division, value)` | Invoker. Returns all 12 metrics institute-wide (`division NULL`) and per division |
| `metric_snapshot_run` | `p_as_on date = NULL` | `integer` | Cron (`service_role`) or MasterAdmin. Freezes daily `metric_snapshots` with `ON CONFLICT DO NOTHING` |
| `metric_digest_run` | — | `integer` | Cron (`service_role`) / authorized caller. Sends weekly `metric-digest` notifications |

## B.8 Helpdesk

| Function | Parameters | Returns | Notes |
|---|---|---|---|
| `helpdesk_create_ticket` | `p_subject text, p_category text, p_urgency text, p_description text, p_submitted_by uuid` | `uuid` | `p_submitted_by` must equal `auth.uid()`. Mints a token, calls `route_ticket`, writes `Created` event |
| `helpdesk_assign_ticket` | `p_ticket_id uuid, p_new_handler_id uuid, p_actor_id uuid` | `void` | Assignee or admin; `p_actor_id` must equal `auth.uid()` |
| `helpdesk_update_status` | `p_ticket_id uuid, p_new_status text, p_actor_id uuid` | `void` | Sets `resolved_at` on `Resolved` |
| `helpdesk_add_response` | `p_ticket_id uuid, p_author_id uuid, p_message text` | `uuid` | Submitter, assignee, or admin |
| `route_ticket` | `p_category text, p_submitter_id uuid` | `uuid` | Internal (`service_role` only). `helpdesk_routing` override → submitter's DivisionHead → HRAdmin → SystemAdmin |

`category` ∈ `Infrastructure \| EquipmentIT \| Administrative \| HRGrievance \| Finance \| LabResearch \| Library \| Transport`.
`urgency` ∈ `Low \| Medium \| High \| Critical`. `status` ∈ `Open \| InProgress \| Resolved \| Closed`.
Client-side validation (`missingTicketFields`) requires non-empty `category`, `subject`, and `description`.

> **Nullable guard pattern:** `helpdesk_add_response` guards `IF NOT COALESCE(submitter OR assigned_to = auth.uid() OR admin, false)` because an unassigned ticket makes `assigned_to = auth.uid()` evaluate to `NULL`, collapsing an unwrapped `OR` chain. Apply `COALESCE(..., false)` in all plpgsql guards touching nullable columns.

## B.9 Committees, COI & Calendar

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `unlock_meeting_minutes` | `p_meeting_id uuid` | `void` | Chair/secretary/admin. Reopens finalized minutes for editing |
| `coi_declare` | `p_meeting_id uuid, p_format text, p_note text` | `uuid` | Committee member, chair, or convener. Records `F1` or `F2` (note required on `F2`) until chair decides |
| `coi_chair_decide` | `p_id uuid, p_decision text` | `void` | Committee chair (not on own declaration). Decides `F2`: `CONTINUE` \| `RECUSE` |
| `committee_seat` / `committee_can_read` / `committee_can_run` | `p_committee_id uuid` | `text` / `boolean` | RLS & permission helpers (`20261121000010_committee_foundations.sql`). Resolves caller seat from active `committee_memberships`, `external_members`, and active `acting_assignments`; enforces `confidentiality` (`institute \| members \| confidential`) |
| `room_book` / `room_booking_decide` / `meeting_schedule` / `meeting_postpone` / `hospitality_request_create` / `hospitality_request_decide` | `(room/meeting/hospitality args)` | `uuid` / `void` | Stage 2 `CM1` RPCs (`20261121000011_stage2_homes_desk_rooms.sql`). Advisory-lock clash protection on `room_bookings`, booking move on meeting postpone, hospitality desk approvals |
| `my_day` / `my_requests` / `my_report_timers` / `my_engagement` / `division_rollup` / `caller_division_codes` / `calendar_token_rotate` | `(optional date window)` | `TABLE(...)` / `text[]` / `text` | Stage 2 `SH2`, `HH1`, `DH1`, `PJ1`, `CD1–CD3` invoker feeds & helpers honoring RLS and active `acting_assignments` |

## B.10 Data Operations — Contribution Requests & AI Notifications

Client wrappers in `src/lib/contributions/api.ts` and `src/lib/notifications/notifications.ts`. Both `contribution_requests` and `data_stewards` are `SELECT`-only to clients.

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `contribution_request_create` | `p_domain text, p_record_ref text, p_division text, p_title text, p_reason text, p_link text, p_due date, p_prefill jsonb, p_assignee uuid` | `uuid` | Admin, Director, division manager (`p_division`), or covering steward. Resolves assignee → steward → NULL (unowned); logs `created` event & notifies assignee |
| `contribution_request_act` | `p_id uuid, p_action text, p_note text, p_target uuid, p_response jsonb` | `text` (new status) | Assignee, delegate, or reviewer (`contribution_is_reviewer`); row-locked `FOR UPDATE`; validates state transition ([system_design.md §4.8](system_design.md#48-contribution-request--contribution_requestsstatus)) |
| `data_steward_set` | `p_domain text, p_division text, p_user uuid, p_kind text, p_cadence integer` | `uuid` | Admin. Upserts `(domain, division_code, user_id)` (`p_kind` defaults `steward`, `p_cadence` 90) |
| `data_steward_remove` | `p_id uuid` | `void` | Admin |
| `notification_accept` | `p_id uuid` | `text` (link) | Notification owner. Marks `accepted`, executes whitelisted action (`identity_link` → `identity_set_link`, `expertise_confirm` → `staff_expertise`, `open`), logs to `ai_action_log` |
| `ai_suggest_sweep` | — | `integer` | Cron (`service_role`) or MasterAdmin. Emits daily identity-link and expertise confirmation suggestions (`notifications`) |

Internal helpers (`EXECUTE` revoked from `authenticated`, `service_role` only): `contribution_steward_for(p_domain, p_division)`, `contribution_requests_sweep()` (evaluates division-scoped `import_events`), `notifications_sweep()`, `resolve_unique_staff_id(p_name)`. Client-callable `INVOKER` predicate: `contribution_is_reviewer(r)`.

**Contribution request error codes** (`RAISE EXCEPTION` → HTTP `400`): `not_authorized` · `invalid_domain: <d>` · `title_required` · `invalid_link` · `invalid_prefill` · `invalid_target` · `invalid_action: <a> from <s>` · `response_required` · `note_required`. Accepting a contribution update is intentionally two steps so RLS on the canonical table stays enforced:

```ts
await updateEntityRecord(r.domain, r.recordRef, patch);   // RLS-gated write
await actOnContributionRequest(r.id, 'accept');           // → 'done'
```

## B.11 Documents & RAG Administration

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `documents_set_access_tier` | `p_document_id uuid, p_tier text` | `void` | **Admins or Director** (`caller_is_admin() OR caller_has_role('Director')`). Sets `p_tier` ∈ `owner \| confidential \| division \| institute` & writes `pms_audit_logs` (`DOCUMENT_TIER_CHANGED`) |
| `rag_requeue_document` | `p_doc_id uuid` | `void` | SystemAdmin / MasterAdmin. Resets `ingest_status = 'pending'`, clears `ingest_error`, `ingest_attempts`, `processing_started_at` |
| `rag_requeue_all` | — | `integer` (rows requeued) | SystemAdmin / MasterAdmin. Resets `indexed`/`failed` rows back to `pending` |
| `rag_monitor_summary` | — | `TABLE(status_counts jsonb, traceability_cited bigint, traceability_total bigint)` | Verified caller (`INVOKER`, `STABLE`). Powers admin RAG health & citation traceability summary (`src/lib/rag/monitor.ts`) |
| `rag_replace_doc_pages` | `p_document_id uuid, p_pages jsonb` | `void` | **Worker (`service_role`) only** (`EXECUTE` revoked from `authenticated`). Atomically replaces `doc_pages` rows for a document |

---

# Part C — Ask SURYA HTTP API

FastAPI application `rag/api.py`, served by uvicorn on `127.0.0.1:8000`, reverse-proxied by nginx at `/rag/`. Same-origin in production; `CORS_ORIGINS` exists only for split-port development.

All four endpoints require `Authorization: Bearer <supabase user JWT>` and `Content-Type: application/json`, and enforce database feature/role gates via the caller's JWT.

## C.1 Shared DTOs

```ts
interface AskCitation {
  document_id: string;   // documents.id
  title: string;         // document title
  node_title: string;    // PageIndex section title
  page_start: number;    // 1-based, inclusive
  page_end: number;      // inclusive
  storage_path: string;  // for building a signed URL
}

type AskEntityType = 'project' | 'staff' | 'division' | 'instrument';
interface AskEntity { type: AskEntityType; id: string; }
```

```python
@dataclass
class Answer:
    text: str                  # prose, or the refusal string
    mode: str                  # 'document' | 'structured' | 'hybrid'
    citations: list[Citation]  # empty iff refusal or pure-structured
    trace: dict | None         # {route, function, params, fallback?}
    data: dict | None          # typed structured payload, when mode != 'document'
```

The refusal string is exactly `"Not found in institute documents."` — a caller may test for it, and the invariant is that `citations` is empty whenever it appears.

## C.2 `POST /query`

Answer a question over institute documents and structured data. Requires `can_use_ask_surya` gate.

**Request**

```json
{
  "question": "How many active projects does the CMPD division run?",
  "history": [
    { "question": "Which divisions exist?", "answer": "CMPD, LWMD, MMD…" }
  ],
  "context_entity": { "type": "division", "id": "CMPD" }
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `question` | `string` | yes | Non-blank after trim (max length `MAX_QUESTION_CHARS`), else `400 empty question` |
| `history` | `{question, answer}[]` | no | Last **3** turns used; each answer truncated to **300** chars and prepended as context |
| `context_entity` | `{type, id}` (`project \| staff \| division \| instrument`) | no | Grounds the query to the named record and searches its documents first (projects: also progress reports). If missing or unreadable under the caller's RLS, returns **`404 record not found`** |

**Response `200`**

```json
{
  "text": "CMPD has 14 ongoing projects.",
  "mode": "structured",
  "citations": [],
  "trace": {
    "route": "structured",
    "function": "count_projects_by_division",
    "params": { "status": "Ongoing" }
  },
  "data": { "CMPD": 14, "LWMD": 9 },
  "query_id": "9c1f…"
}
```

Document-mode response:

```json
{
  "text": "The MoU with IIT Bombay covers joint supervision of PhD scholars…",
  "mode": "document",
  "citations": [{
    "document_id": "3f2a…", "title": "MoU — IIT Bombay 2025",
    "node_title": "3. Scope of Collaboration",
    "page_start": 2, "page_end": 3,
    "storage_path": "mous/iitb-2025.pdf"
  }],
  "trace": { "route": "document", "function": null, "params": null },
  "data": null,
  "query_id": "7b0e…"
}
```

`query_id` is `null` if logging failed — logging is best-effort and never breaks an answer. Use it with `sendFeedback(queryId, 1 | -1)`, which updates `query_log.feedback` directly under RLS.

**Errors:** `400 empty question` · `401 missing bearer token` · `401 invalid token` · `403 forbidden` · `404 record not found` · `504 model timeout`.

## C.3 `POST /query/stream`

Identical request body (including optional `context_entity` and its `404 record not found` check). Returns `text/event-stream`.

```
data: {"token": "CMPD has "}

data: {"token": "14 ongoing projects."}

data: {"done": { …same payload as /query… }}
```

- Only the **document** route truly streams. Structured and hybrid answers arrive as a single `token` frame followed by `done`.
- Tokens are withheld while the accumulated text could still be the `NOT_FOUND` sentinel, then flushed — so a refusal never leaks a partial ungrounded sentence.
- Errors mid-stream: `data: {"error": "model timeout"}`.
- `405` (or `404` when **no** `context_entity` was supplied — older server) makes `askSuryaStream` fall back to `/query` automatically; `404` **with** `context_entity` throws `"That record is not available to you."`.

## C.4 `POST /similar`

Duplication / prior-work check. Requires `can_use_ask_surya`. Returns ranked corpus sections, **no generated prose** — matches only, so the result is inherently grounded.

**Request** `{ "text": "Development of magnesium-based biodegradable implants" }`

**Response `200`**

```json
{ "matches": [
  { "document_id": "1a2b…", "title": "Proposal — Mg alloy implants (2024)",
    "node_title": "2. Objectives", "page_start": 3, "page_end": 4,
    "storage_path": "proposal-documents/2024/mg-implants.pdf" }
] }
```

At most `MAX_SIMILAR_MATCHES = 6`, ordered by the model's own pick order. Empty array when nothing is relevant. Consumed by `SimilarWorkPanel` on the proposal form.

**Errors:** `400 empty text` · `401` · `403 forbidden` · `504`.

## C.5 `POST /map-columns`

Propose mappings from an uploaded file's raw headers to canonical database columns. Requires **`caller_is_admin()`** (gated like `/data`, not by `can_use_ask_surya`). **Advisory only** — `ImportFlow` still requires a human to confirm before any write.

**Request**

```json
{
  "raw_headers": ["Emp Name", "Date of Joining", "Divn"],
  "target_fields": [
    { "column": "Name", "label": "Staff name" },
    { "column": "DOJ",  "label": "Date of joining" },
    { "column": "Division", "label": "Division code" }
  ]
}
```

| Field | Rules |
|---|---|
| `raw_headers` | non-empty, ≤ 400 items, each ≤ 256 chars |
| `target_fields` | non-empty, ≤ 400 items; each `{column, label}` (≤ 256 chars) |

**Response `200`**

```json
{ "mapping": { "Emp Name": "Name", "Date of Joining": "DOJ", "Divn": "Division" } }
```

Unmappable headers are omitted. A confirmed mapping is persisted to `import_field_mappings` keyed by a SHA-256 fingerprint of the sorted, normalized headers, so the same file layout is recognized without a model call next time.

**Errors:** `400 raw_headers and target_fields required` · `400 too many headers/fields (max 400)` · `400 header too long (max 256 chars)` · `401` · `403 forbidden`.

## C.6 Structured analytics catalog (18 functions)

The router may only invoke a function present in `analytics.CATALOG` (`rag/analytics.py`). That membership check is the no-free-form-SQL guarantee; a name outside the catalog falls back to the document route.

| Function | Params | Answers |
|---|---|---|
| `count_documents_by_status` | — | Documents grouped by ingestion status |
| `count_projects_by_division` | `status?` | Projects per division |
| `count_projects_by_status` | — | Projects by status |
| `project_expenditure_summary` | `division_code?` | Sanctioned vs utilized funds and utilization % |
| `patent_pipeline_counts` | — | Patents by stage (Filed / Published / Granted) |
| `count_publications_by_division` | `year?` | Publications per division |
| `count_staff_by_division` | — | Staff per division |
| `overdue_phd_milestones` | — | Milestones past due and incomplete, by type |
| `mou_status_summary` | — | MoUs by status + active ones expiring within 90 days |
| `tech_transfer_summary` | — | Tech transfers by status + total value in lakhs |
| `expertise_search` | `topic` **(required)** | "Who has worked on X" (`expertise_find`) |
| `metric` | `key?, division?, year?, stage?` | One KPI from the `metrics` registry (`metric_value`), or lists available keys when `key` is absent/unknown |
| `project_budget_variance` | `threshold_pp?` | Active projects deviating from expected burn |
| `expertise_succession_risk` | `years?` | Staff retiring within N years whose expertise nobody covers |
| `staff_profile` | `name` **(required)** | "Who is X" — plus counts from `staff_profile_facts`; two matches → lists both, never picks |
| `projects_for_staff` | `name` **(required)** | "What is X working on" — from `staff_profile_facts` (keys, not names) |
| `division_summary` | `division_code` **(required)** | One division's head, strength, staff, project counts |
| `project_team` | `project_no` \| `project_name` | "Who works on project X" |

All catalog functions read through the caller's RLS-scoped client, so a structured answer is scoped identically to an equivalent direct query. A function that raises returns `None`, falling through to the document path rather than surfacing a `500`.

## C.7 Client reference (`src/lib/ask/client.ts`)

`src/lib/ask/client.ts` holds all SPA integration with Surface C, plus query-side helpers (`AskCitation`, `AskAnswer`, `AskEntityType`, `AskEntity`, `AskHistoryTurn`):

| Export | Mechanism |
|---|---|
| `askSurya(question, history?, entity?)` | `POST /query` (includes optional `context_entity`) |
| `askSuryaStream(question, history, onToken, entity?)` | `POST /query/stream`; falls back to `/query` on `405` or `404` when `!entity`; throws `"That record is not available to you."` on `404` with `entity` |
| `findSimilar(text)` | `POST /similar` |
| `scheduleBrief(ownerId, question, cadence = 'weekly')` | Direct `scheduled_queries` insert under RLS (`owner = ownerId`) for daily/weekly worker digests (`rag/briefs.py`) |
| `sendFeedback(queryId, 1 \| -1)` | Direct `query_log.feedback` update under RLS |
| `parseAskEntity(value)` / `askAboutHref(entity)` | Parse `?entity=project:P-1` URL parameters and construct entity-scoped `/ask` links |

Note the field rename at the boundary: the HTTP service returns `text`, while `AskAnswer` exposes `answer`. Keep that normalization inside `client.ts`.

### Stage 3 RPCs (`20261121000012_stage3_priorities_decisions_notices_meetings.sql`)
- **Priorities:** `can_pin_priority`, `priority_pin`, `priority_seen`, `priority_push_back`, `priority_answer`, `priority_done`, `priority_withdraw`
- **Decisions & Clarification:** `my_decisions()`, `my_answer_time()`, `decision_ask`, `decision_answer`
- **Nudges & Snooze:** `home_snooze_tomorrow`, `report_nudge_sweep`, `my_on_time_record`
- **Notices:** `notice_matches_caller`, `notice_issue`, `notice_mark_read`
- **Committee Agenda & Attendance:** `agenda_circulate`, `agenda_receipt_ack`, `meeting_attendance_set`, `meeting_quorum_status`, `meeting_mark_held`, `meeting_adjourn`

### Stage 4 RPCs (`20261121000013_stage4_signatures_delegation_meetings.sql`)
- **Minutes & Signatures:** `meeting_proceeding_upsert`, `minutes_draft_create`, `minutes_circulate`, `minutes_comment_add`, `minutes_approve`, `signature_attest`, `signature_verify`
- **Delegation Dial & Flags:** `delegation_rule_set`, `decision_authority`, `decision_record`, `director_flag_set`, `director_flag_resolve`
- **General Meetings:** `general_meeting_schedule`

### Stage 5 RPCs (`20261121000014_stage5_desk_leave_letters_reports.sql`)
- **Bookings, Leave & Letters:** `instrument_book`, `instrument_booking_decide`, `project_leave_apply`, `project_leave_decide`, `letter_request`, `letter_issue`
- **Dak, Safety & Reports:** `dak_letter_log`, `dak_letter_update_status`, `safety_incident_report`, `division_report_assemble`, `division_report_send`, `director_watch_pin`, `action_item_verify`

### Stage 6 RPCs (`20261121000015_stage6_depth_polishes.sql`)
- **Tech, Outside, Mentoring & Grievances:** `technology_log_step`, `outside_contact_log`, `supervisor_meeting_log`, `private_grievance_submit`
- **Faults, Transcripts, Clearances & Rubric:** `equipment_fault_report`, `equipment_fault_resolve`, `meeting_transcript_save`, `no_dues_request`, `no_dues_signoff`, `campus_request_create`, `proposal_rubric_score`

# SURYA — API Specification

_Complete interface reference. Current as of 2026-08-08._

SURYA exposes **three API surfaces**. There is no bespoke Node/REST tier — that is
deliberate ([app.md §8](app.md#8-non-goals)).

| # | Surface | Base | Consumer | Auth |
|---|---|---|---|---|
| **A** | Supabase **PostgREST** — table reads/writes | `${VITE_SUPABASE_URL}/rest/v1` | SPA (via `@supabase/supabase-js`) | anon key + user JWT; **RLS is the gate** |
| **B** | Supabase **RPC** — the mutation/workflow API | `${VITE_SUPABASE_URL}/rest/v1/rpc/<fn>` | SPA | Same JWT; each function authorizes itself |
| **C** | **Ask SURYA HTTP API** — the AI service | `${VITE_RAG_URL}` (prod: `/rag`, proxied by nginx) | SPA (`src/lib/ask/client.ts`) | `Authorization: Bearer <user JWT>` |

---

# Part 0 — Conventions

## 0.1 Authentication

Every surface authenticates with the **same Supabase-issued user JWT**. There is no API
key, no service account, and no second identity system.

```http
apikey: <VITE_SUPABASE_ANON_KEY>
Authorization: Bearer <session.access_token>
```

Obtained via `supabase.auth.signInWithPassword()`; refreshed by the client library. The
SPA reads it with `supabase.auth.getSession()` — never from `localStorage`.

Surface C forwards the same token. `rag-api` verifies it (`auth.verify_token`) and builds
a client whose PostgREST calls carry it (`auth.scoped_client`). **The AI service can never
read anything the asking user could not read directly.**

## 0.2 Authorization

Authorization is not expressed in the API shape. It is expressed in:

- **RLS policies** — a read you are not entitled to returns `[]`, not `403`. A write you
  are not entitled to returns a policy violation.
- **RPC authorization blocks** — every `SECURITY DEFINER` function opens with an explicit
  check; failure raises a Postgres exception surfaced as `400` with the message.
- **Actor assertions** — any parameter named `p_actor_id` / `p_author_id` /
  `p_submitted_by` must equal `auth.uid()`. Client-supplied identity is never trusted.

## 0.3 Versioning

**Unversioned, by design.** The SPA and the schema deploy together; there is no third-party
consumer to hold compatible. Compatibility is preserved by convention instead:

- Migrations are append-only; shipped baseline files are never edited.
- RPC signatures are extended with `DEFAULT`-valued trailing parameters, never reordered.
  Where a parameter type had to change (`helpdesk_*` actor ids went `text` → `uuid` in
  `20260725000004`), the change shipped as a new migration replacing the function whole.
- Answers from surface C are stamped with `catalog_version` so a logged answer traces to
  the code that produced it.

If an external consumer ever appears, version surface C by path prefix (`/v1/query`); do
not version B — the client is in-repo.

## 0.4 Pagination

**Surface A/B.** PostgREST caps responses at `max_rows = 1000`, declared in
`supabase/config.toml`. The SPA pages with `fetchAll` (`src/lib/data/fetchAll.ts`) at
`PAGE_SIZE = 1000`.

> The two numbers must stay equal. A page size **above** the cap makes a capped response
> indistinguishable from a final short one, so paging stops early and truncates silently.
> If you raise `max_rows`, raise `PAGE_SIZE` with it — never past it.

```ts
supabase.from('staff').select('*').order('ID').range(offset, offset + 999)
```

**Surface C** does not paginate: `/query` returns one answer, `/similar` returns at most
`MAX_SIMILAR_MATCHES = 6`. Internally, `read_docs` pages `doc_indexes` at 200 rows, so
corpus size is not capped.

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
| `403` | RLS policy violation on write |
| `404` | Unknown table or function |
| `409` | Unique constraint conflict (e.g. a second report for the same cycle+scientist) |

A read blocked by RLS is **not** an error — it is an empty array. Do not treat `[]` as
"no data"; it may mean "not yours".

**Surface C** — FastAPI `{"detail": "..."}`:

| HTTP | `detail` | Cause |
|---|---|---|
| `400` | `empty question` / `empty text` | Blank body field |
| `400` | `raw_headers and target_fields required` | `/map-columns` missing input |
| `400` | `too many headers/fields (max 400)` | `/map-columns` over the cap |
| `401` | `missing bearer token` | No/malformed `Authorization` header |
| `401` | `invalid token` | JWT rejected by GoTrue |
| `504` | `model timeout` | LLM host exceeded `RAG_*_TIMEOUT_S` |

On `/query/stream` a mid-stream failure arrives as an SSE frame, not an HTTP status:
`data: {"error": "model timeout"}`.

## 0.6 Idempotency and side effects

- All `pms_*`, `proposal_*`, `project_report_*` transition RPCs assert the current state
  before writing, so a duplicate call raises rather than double-applying.
- `helpdesk_create_ticket` is **not** idempotent — it mints a new token per call.
- Imports upsert on primary key, so re-importing the same file is safe.
- Document capture dedupes on SHA-256 content hash.

---

# Part A — Data API (PostgREST)

Accessed exclusively through `@supabase/supabase-js`. Raw HTTP is documented only so the
shape is legible.

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

Full column-level definitions are in [database_design.md](database_design.md). Read scope
is the RLS policy, not a query parameter.

| Table | Read scope | Direct client write |
|---|---|---|
| `divisions`, `staff`, `projects`, `project_staff`, `phd_students`, `phd_milestones`, `equipment`, `labs`, `contract_staff`, `scientific_outputs`, `ip_intelligence`, `mous`, `tech_transfers` | Role-scoped: Director/admins see all; DivisionHead/HOD/Technician scoped to their `division_code`; others narrower | HRAdmin + SystemAdmin only |
| `vacancy_advertisements`, `vacancy_posts` | All authenticated | Data admins |
| `committees`, `committee_members`, `meetings`, `agenda_items`, `action_items`, `meeting_documents` | All authenticated | Chair/secretary + admins; minutes lock after finalization (`unlock_meeting_minutes` to reopen) |
| `tickets`, `ticket_responses`, `ticket_events` | Submitter + assignee + admins | **RPC only** |
| `calendar_events`, `holidays` | By `visibility` (`OrgWide` / `Division` / `Personal`) | Creator + admins |
| `proposals`, `proposal_copis`, `proposal_documents`, `proposal_status_history` | `proposals_can_read` — PI, co-PIs, same division, admins | Editable statuses only; transitions via RPC |
| `project_reports`, `project_report_history` | `project_reports_can_read` | Editable statuses only; transitions via RPC |
| `pms_reports` and children | Owner + admins + assigned evaluators + committee + grievance members | Owner in `DRAFT` only; transitions via RPC |
| `documents` | `documents_can_read` — four-tier ladder | Insert: `owner_id = auth.uid()`. Update: admins only |
| `doc_indexes`, `doc_pages`, `collection_indexes` | Follows the parent document's readability | Worker (service role) only |
| `query_log` | Own rows | Insert by the API as the caller; `feedback` update by owner |
| `route_labels` | Admins | Admins |
| `user_roles`, `user_profiles` | Own rows + admins | **Column-narrowed grants.** Role changes via RPC only |
| `feature_controls` | All authenticated (read) | MasterAdmin |
| `harvested_imports`, `ingest_sender_map`, `import_events`, `import_field_mappings` | Data admins | Data admins |
| `audit_log`, `pms_audit_logs` | Admins | Triggers / RPCs only |

## A.3 Storage

Four buckets, all private: `documents` (shared, new modules), `annexures` (PMS),
`proposal-documents`, `committee-docs`.

```ts
await supabase.storage.from('documents').upload(path, file);
const { data } = await supabase.storage.from('documents').createSignedUrl(path, 60);
```

`storage.objects` policies mirror the registry: an object in `documents` is readable only
when a `documents` row with the same `(storage_bucket, storage_path)` passes
`documents_can_read`. Uploading is permitted to any authenticated user, but the object stays
unreadable until the uploader creates the owning registry row — so a stray upload leaks
nothing.

Citation deep-links are built by `citationHref` (`src/lib/ask/citations.ts`) from the
`storage_path` returned in each citation.

---

# Part B — RPC API

Called as `supabase.rpc('<name>', { ...params })`. Every function listed as `SECURITY
DEFINER` runs as the owner, bypasses RLS, and therefore **is** the authorization boundary —
each opens with an explicit check, enforced in CI by `scripts/check_security_definer.py`.

## B.1 Authentication and users

| Function | Parameters | Returns | Authorization |
|---|---|---|---|
| `approve_access_request` | `p_request_id uuid, p_roles text[], p_division text` | `void` | SystemAdmin / MasterAdmin. Writes `user_roles`, marks the request `APPROVED` |
| `reject_access_request` | `p_request_id uuid, p_note text` | `void` | SystemAdmin / MasterAdmin |
| `admin_set_user_roles` | `p_user_id uuid, p_roles text[], p_active_role text, p_division text` | `void` | MasterAdmin. The only path that changes a user's roles |
| `admin_list_users` | — | `TABLE(...)` | Admins. Joins `auth.users` with roles/profiles |
| `admin_force_password_reset` | `p_user_id uuid` | `void` | Admins. Sets `must_change_password` |
| `admin_staff_link_gaps` | — | `TABLE(...)` | Admins. Users with no matching `staff."ID"` — a data-quality report |
| `clear_must_change_password` | — | `void` | Self. **Refuses if the new password hash cannot be verified** — it will not clear the flag on an unchanged password |
| `user_directory` | — | `TABLE(user_id, name, email, ...)` | Roles permitted to see the directory (`caller_sees_directory`). Powers `UserPicker` / `StaffPicker` without exposing `auth.users` |
| `merge_user_preferences` | `p_patch jsonb` | `void` | Self. Shallow-merges into own preferences |

```ts
const { error } = await supabase.rpc('admin_set_user_roles', {
  p_user_id: userId,
  p_roles: ['Scientist', 'DivisionHead'],
  p_active_role: 'DivisionHead',
  p_division: 'CMPD',
});
```

## B.2 PMS

| Function | Parameters | Returns | Authorization + effect |
|---|---|---|---|
| `pms_submit_report` | `p_report_id uuid` | `void` | Owner, status `DRAFT`, cycle unlocked, before the `SELF_APPRAISAL` deadline. → `SUBMITTED`, sets `submitted_at` |
| `pms_assign_evaluators` | `p_report_id uuid, p_committee_id uuid` | `void` | Admin. Panel must satisfy `pms_committee_panel_valid`. Creates one `pms_evaluations` row per member → `UNDER_EVALUATION_COMMITTEE_REVIEW` |
| `pms_finalize_report` | `p_report_id uuid, p_final_score integer, p_justification text, p_reasons_outstanding text = NULL, p_reasons_below text = NULL, p_suggestions text = NULL` | `void` | Empowered committee member. Standard track. → `FINALIZED`, sets `score_communicated_at` |
| `pms_finalize_senior_report` | `p_report_id uuid, p_remarks text` | `void` | Empowered committee. Annexure-I/II — pen picture, no numeric score |
| `pms_set_duty_days` | `p_report_id uuid, p_duty_days integer` | `void` | Admin |
| `pms_mark_not_assessed` | `p_report_id uuid, p_remark text = NULL` | `void` | Admin. Terminal state for `duty_days < 90` |
| `pms_record_non_submission` | `p_report_id uuid, p_cert_path text` | `void` | Admin. Records the non-submission certificate |
| `pms_submit_representation` | `p_report_id uuid, p_grounds text` | `void` | Owner, report `FINALIZED`, within 15 days of `score_communicated_at`. `grounds` ≥ 20 chars. → `UNDER_GRIEVANCE_REVIEW` |
| `pms_resolve_representation` | `p_report_id uuid, p_resolution text, p_revised_score integer = NULL, p_reasons_outstanding text = NULL, p_reasons_below text = NULL, p_suggestions text = NULL` | `void` | Grievance committee member for that cycle. → `FINALIZED` |

**Read-only helpers** (usable from the client for UI state, and used inside RLS policies):
`pms_is_admin()`, `pms_is_evaluation_committee_member(p_cycle_id)`,
`pms_is_grievance_member(p_cycle_id)`, `pms_committee_panel_valid(p_committee_id)`,
`pms_empowered_committee_valid(p_cycle_id)`, `pms_deadline(p_cycle_id, p_kind)`,
`pms_cycle_locked(p_cycle_id)`, `pms_caller_track()`.

`p_kind` ∈ `SELF_APPRAISAL` (May 15) · `EC_COMPLETION` (Jun 30) ·
`EMPOWERED_COMPLETION` (Jul 31) · `SYSTEM_LOCK` (Nov 30), all of the cycle's end year.

**Validation enforced by the database, not the form:**

| Rule | Mechanism |
|---|---|
| `self_score`, `total_score`, `final_score` ∈ [0, 100] | `CHECK` |
| `justification` ≥ 50 characters (trimmed) | `CHECK` |
| `grounds` ≥ 20 characters (trimmed) | `CHECK` |
| `time_committed_percentage` ∈ [0, 100] | `CHECK` |
| One report per `(cycle_id, scientist_id)` | `UNIQUE` |
| One evaluation per `(report_id, evaluator_id)` | `UNIQUE` |
| One decision and one representation per report | `UNIQUE` |
| Score ≥ 90 → `reasons_for_outstanding` required; ≤ 75 → `reasons_below_threshold` + `suggestions_for_improvement` required | RPC guard |
| No writes after `SYSTEM_LOCK` | `pms_block_locked_cycle_reports` / `..._children` triggers |

```ts
await supabase.rpc('pms_finalize_report', {
  p_report_id: reportId,
  p_final_score: 92,
  p_justification: 'Sustained outstanding contribution across three sponsored projects…',
  p_reasons_outstanding: 'Two granted patents and a technology transferred to industry.',
});
```

## B.3 Proposals

| Function | Parameters | From → To |
|---|---|---|
| `proposal_submit` | `p_id uuid` | `DRAFT` \| `REVISION_REQUESTED` → `SUBMITTED` |
| `proposal_set_under_review` | `p_id uuid, p_body text, p_sent_date date` | `SUBMITTED` → `UNDER_REVIEW` |
| `proposal_request_revision` | `p_id uuid, p_notes text` | `UNDER_REVIEW` → `REVISION_REQUESTED` |
| `proposal_reject` | `p_id uuid, p_reason text` | `UNDER_REVIEW` → `REJECTED` |
| `proposal_recommend` | `p_id uuid` | `UNDER_REVIEW` → `RECOMMENDED` |
| `proposal_approve` | `p_id uuid, p_amount numeric, p_date date` | `RECOMMENDED` → `APPROVED` |
| `proposal_issue_om` | `p_id uuid, p_om_no text, p_om_date date, p_doc_id uuid` | `APPROVED` → `OM_ISSUED` |
| `proposal_link_project` | `p_id uuid, p_project_no text` | `OM_ISSUED` → `LINKED` |
| `proposal_archive` | `p_id uuid` | `OM_ISSUED` → `ARCHIVED` |

`proposal_submit` is PI-only; the rest are admin/review-body actions. All append
`proposal_status_history`.

### Proposal DTO validation (`src/lib/proposals/validation.ts`, zod)

Two schemas, because a draft may be incomplete and a submission may not:

| Field | `draftSchema` | `submitSchema` |
|---|---|---|
| `title` | required, ≥1 | required, ≥1 |
| `piName`, `sponsorName`, `divisionCode`, `abstract`, `problemStatement`, `objectives`, `expectedOutcomes` | nullish | required, ≥1 |
| `domainTheme`, `fundType`, `sponsorType`, `projectCategory` | nullish enum | required enum |
| `proposedDurationMonths` | nullish positive int | required positive int |
| `requestedBudget` | nullish, ≥0 | required, ≥0 |
| `currentTrl`, `targetTrl` | int 1–9 or null | int 1–9 or null |
| `coPIs[]` | `{staffId, staffName}` both ≥1 | same |

Mirrored in SQL: `proposed_duration_months > 0`, `requested_budget >= 0`,
`current_trl/target_trl BETWEEN 1 AND 9`, `proposal_code` unique (assigned by the
`proposals_set_code` trigger).

## B.4 Project progress reports

| Function | Parameters | Effect |
|---|---|---|
| `project_report_submit` | `p_id uuid` | `DRAFT` \| `REVISION_REQUESTED` → `SUBMITTED` |
| `project_report_review` | `p_id uuid, p_decision text, p_notes text` | `SUBMITTED`/`UNDER_REVIEW` → `UNDER_REVIEW` \| `REVISION_REQUESTED` \| `REVIEWED`. Authorized by `project_reports_can_review` |

`period_type` ∈ `Q` \| `H` \| `Y`; `period_label` is free text (e.g. `"Q2 2026-27"`).

## B.5 Helpdesk

| Function | Parameters | Returns | Notes |
|---|---|---|---|
| `helpdesk_create_ticket` | `p_subject text, p_category text, p_urgency text, p_description text, p_submitted_by uuid` | `uuid` | `p_submitted_by` must equal `auth.uid()`. Mints a token, calls `route_ticket`, writes a `Created` event |
| `helpdesk_assign_ticket` | `p_ticket_id uuid, p_new_handler_id uuid, p_actor_id uuid` | `void` | Assignee or admin; `p_actor_id` must equal `auth.uid()` |
| `helpdesk_update_status` | `p_ticket_id uuid, p_new_status text, p_actor_id uuid` | `void` | Sets `resolved_at` on `Resolved` |
| `helpdesk_add_response` | `p_ticket_id uuid, p_author_id uuid, p_message text` | `uuid` | Submitter, assignee, or admin |
| `route_ticket` | `p_category text, p_submitter_id text` | `text` | Internal. `helpdesk_routing` override → submitter's DivisionHead → HRAdmin → SystemAdmin |

`category` ∈ `Infrastructure` \| `EquipmentIT` \| `Administrative` \| `HRGrievance` \|
`Finance` \| `LabResearch` \| `Library` \| `Transport`.
`urgency` ∈ `Low` \| `Medium` \| `High` \| `Critical`.
`status` ∈ `Open` \| `InProgress` \| `Resolved` \| `Closed`.

Client-side draft validation (`missingTicketFields`) requires non-empty `category`,
`subject`, and `description`.

> `helpdesk_add_response` carries a scar worth knowing: its guard originally read
> `IF NOT (submitter OR assigned_to = auth.uid() OR admin)`. On an unassigned ticket
> `assigned_to` is NULL, the OR-chain collapses to NULL, `NOT NULL` is NULL, and the `IF`
> never fired — authorizing everyone. The fix is `COALESCE(..., false)`. Apply the same
> pattern to any new plpgsql guard touching a nullable column.

## B.6 Committees and calendar

| Function | Parameters | Notes |
|---|---|---|
| `unlock_meeting_minutes` | `p_meeting_id uuid` | Chair/secretary/admin. Reopens finalized minutes for editing |

## B.7 Documents and RAG administration

| Function | Parameters | Returns | Authorization |
|---|---|---|---|
| `documents_set_access_tier` | `p_document_id uuid, p_tier text` | `void` | Owner or admin. `p_tier` ∈ `institute` \| `division` \| `owner` \| `confidential` |
| `rag_requeue_document` | `p_doc_id uuid` | `void` | Admin. `failed` → `pending`, resets `ingest_attempts` |
| `rag_requeue_all` | — | `int` (rows requeued) | Admin. Bulk re-index |

---

# Part C — Ask SURYA HTTP API

FastAPI application `rag/api.py`, served by uvicorn on `127.0.0.1:8000`, reverse-proxied by
nginx at `/rag/`. Same-origin in production; `CORS_ORIGINS` exists only for split-port
development.

All four endpoints require `Authorization: Bearer <supabase user JWT>` and
`Content-Type: application/json`.

## C.1 Shared DTOs

```ts
interface Citation {
  document_id: string;   // documents.id
  title: string;         // document title
  node_title: string;    // PageIndex section title
  page_start: number;    // 1-based, inclusive
  page_end: number;      // inclusive
  storage_path: string;  // for building a signed URL
}
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

The refusal string is exactly `"Not found in institute documents."` — a caller may test for
it, and the invariant is that `citations` is empty whenever it appears.

## C.2 `POST /query`

Answer a question over institute documents and data.

**Request**

```json
{
  "question": "How many active projects does the CMPD division run?",
  "history": [
    { "question": "Which divisions exist?", "answer": "CMPD, LWMD, MMD…" }
  ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `question` | string | yes | Non-blank after trim, else `400 empty question` |
| `history` | `{question, answer}[]` | no | Last **3** turns used; each answer truncated to **300** chars and prepended as context |

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

`query_id` is `null` if logging failed — logging is best-effort and never breaks an answer.
Use it with `sendFeedback(queryId, 1 | -1)`, which updates `query_log.feedback` directly
under RLS.

**Errors:** `400 empty question` · `401 missing bearer token` · `401 invalid token` ·
`504 model timeout`.

## C.3 `POST /query/stream`

Identical request body. Returns `text/event-stream`.

```
data: {"token": "CMPD has "}

data: {"token": "14 ongoing projects."}

data: {"done": { …same payload as /query… }}
```

- Only the **document** route truly streams. Structured and hybrid answers arrive as a
  single `token` frame followed by `done`.
- Tokens are withheld while the accumulated text could still be the `NOT_FOUND` sentinel,
  then flushed — so a refusal never leaks a partial ungrounded sentence.
- Errors mid-stream: `data: {"error": "model timeout"}`.
- `404`/`405` (endpoint absent on an older server) makes `askSuryaStream` fall back to
  `/query` automatically.

## C.4 `POST /similar`

Duplication / prior-work check. Returns ranked corpus sections, **no generated prose** —
matches only, so the result is inherently grounded.

**Request** `{ "text": "Development of magnesium-based biodegradable implants" }`

**Response `200`**

```json
{ "matches": [
  { "document_id": "1a2b…", "title": "Proposal — Mg alloy implants (2024)",
    "node_title": "2. Objectives", "page_start": 3, "page_end": 4,
    "storage_path": "proposal-documents/2024/mg-implants.pdf" }
] }
```

At most `MAX_SIMILAR_MATCHES = 6`, ordered by the model's own pick order. Empty array when
nothing is relevant. Consumed by `SimilarWorkPanel` on the proposal form.

**Errors:** `400 empty text` · `401` · `504`.

## C.5 `POST /map-columns`

Propose mappings from an uploaded file's raw headers to canonical database columns.
**Advisory only** — `ImportFlow` still requires a human to confirm before any write.

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
| `raw_headers` | non-empty, ≤ 400 items |
| `target_fields` | non-empty, ≤ 400 items; each `{column, label}` |

**Response `200`**

```json
{ "mapping": { "Emp Name": "Name", "Date of Joining": "DOJ", "Divn": "Division" } }
```

Unmappable headers are omitted. A confirmed mapping is persisted to
`import_field_mappings` keyed by a SHA-256 fingerprint of the sorted, normalized headers,
so the same file layout is recognized without a model call next time.

**Errors:** `400 raw_headers and target_fields required` ·
`400 too many headers/fields (max 400)` · `401`.

## C.6 Structured analytics catalog

The router may only invoke a function present in `analytics.CATALOG`. That membership check
is the no-free-form-SQL guarantee; a name outside the catalog falls back to the document
route. Each description below is the routing prompt the model sees — it is written as the
question a user would ask, and changing it changes routing behaviour.

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
| `expertise_search` | `topic` **(required)** | "Who has worked on X" |
| `project_budget_variance` | `threshold_pp?` | Active projects deviating from expected burn |
| `expertise_succession_risk` | `years?` | Staff retiring within N years whose expertise nobody covers |
| `staff_profile` | `name` **(required)** | "Who is X" |
| `projects_for_staff` | `name` **(required)** | "What is X working on" |
| `division_summary` | `division_code` **(required)** | One division's head, strength, staff, project counts |
| `project_team` | `project_no` \| `project_name` | "Who works on project X" |

All catalog functions read through the caller's RLS-scoped client, so a structured answer is
scoped exactly like the equivalent hand-written query would be. A function that raises for
any reason returns `None`, and the request falls through to the document path rather than
surfacing a `500`.

## C.7 Client reference

`src/lib/ask/client.ts` is the only SPA code that talks to surface C:

| Export | Endpoint |
|---|---|
| `askSurya(question, history?)` | `POST /query` |
| `askSuryaStream(question, history, onToken)` | `POST /query/stream`, falls back to `/query` on 404/405 |
| `findSimilar(text)` | `POST /similar` |
| `sendFeedback(queryId, 1 \| -1)` | **Not** an HTTP call — a direct `query_log` update under RLS |

Note the field rename at the boundary: the service returns `text`, the client exposes
`answer`. Keep that normalization in `client.ts`; do not let `text` leak into components.

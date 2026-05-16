# Project Proposals — Design Spec

**Date:** 2026-05-16
**Status:** Draft for implementation
**Scope:** Tracking module for project proposals submitted by scientists. No in-app approval workflow. Admin manually updates status to reflect off-platform committee decisions.

---

## 1. Goals & Non-Goals

### Goals
- Scientists submit project proposals through a structured form + signed PDF upload.
- Admins (HRAdmin/SystemAdmin/MasterAdmin) record status transitions as committee decisions happen offline.
- Full audit trail of every status change.
- Role-scoped visibility (scientist → own; HOD/DivisionHead → division; Director/Admin → all).
- Approved proposals can be linked to an existing `ProjectInfo` row or archived.

### Non-Goals
- No in-app review/approval chain (no reviewer assignment, no scoring, no committee UX).
- No e-signature, no document versioning UI (latest file wins; history kept for audit only).
- No admin UI for managing Domain/Theme or Project Category lookup values in v1 (hardcoded constants).

---

## 2. Architecture

Mirrors PMS module pattern in this codebase: fresh snake_case tables, state machine driven by SECURITY DEFINER RPCs, RLS-enforced reads, dedicated React context.

### New files

```
src/pages/proposals/
  Proposals.tsx          # List page (role-scoped)
  ProposalForm.tsx       # Create + edit
  ProposalDetail.tsx     # Read + admin status panel

src/components/proposals/
  StatusUpdateModal.tsx  # Admin per-status form

src/lib/proposals/
  constants.ts           # Domain/Theme, Project Category, status enums
  permissions.ts         # canCreate/canEdit/canUpdateStatus
  validation.ts          # zod schemas (draft + submit)
  api.ts                 # RPC wrappers
  storage.ts             # upload/download helpers

src/contexts/
  ProposalsContext.tsx   # Loads + caches proposals for current user scope

supabase/migrations/
  <TS>_proposals.sql     # tables + RLS + RPCs + storage policies
```

### Routes (HashRouter)

| Route | Component | Allowed roles |
|---|---|---|
| `/proposals` | `Proposals.tsx` | Scientist, HOD, DivisionHead, Director, HRAdmin, SystemAdmin, MasterAdmin |
| `/proposals/new` | `ProposalForm.tsx` | Scientist |
| `/proposals/:id` | `ProposalDetail.tsx` | role-scoped via RLS |
| `/proposals/:id/edit` | `ProposalForm.tsx` | owner if `DRAFT` or `REVISION_REQUESTED` |

Registered in `src/App.tsx`. Nav entry added to `src/components/layout/Layout.tsx` `NAV_ITEMS` using `FileText` icon from `lucide-react`.

### Storage

Supabase Storage bucket `proposal-documents` (private). RLS policies on bucket mirror table RLS.

### Lookup data

Domain/Theme and Project Category live as module constants in `src/lib/proposals/constants.ts`. Promotion to a DB-backed lookup table is deferred until admin UI for managing them is requested.

---

## 3. Data Model

### Table `proposals`

```sql
create table proposals (
  id                          uuid primary key default gen_random_uuid(),
  proposal_code               text unique not null,         -- auto: PROP-YYYY-NNNN

  -- Scientist-fill fields
  title                       text not null,
  acronym                     text,
  domain_theme                text not null,                -- enum from constants
  fund_type                   text not null,                -- 'Internal' | 'External'
  sponsor_type                text not null,
  sponsor_name                text not null,
  project_category            text not null,                -- enum from constants
  proposed_start_date         date not null,
  proposed_duration_months    int  not null check (proposed_duration_months > 0),
  requested_budget            numeric(14,2) not null check (requested_budget >= 0),
  pi_user_id                  uuid not null references auth.users(id),
  pi_name                     text not null,                -- snapshot at submit
  division_code               text not null,
  abstract                    text not null,
  problem_statement           text not null,
  objectives                  text not null,
  expected_outcomes           text not null,
  current_trl                 smallint check (current_trl between 1 and 9),
  target_trl                  smallint check (target_trl between 1 and 9),

  -- State
  status                      text not null default 'DRAFT',

  -- Per-status admin-fill fields
  review_body                 text,
  review_sent_date            date,
  revision_notes              text,
  rejection_reason            text,
  sanctioned_amount           numeric(14,2),
  sanction_date               date,
  om_number                   text,
  om_date                     date,

  -- Linking / final disposition
  linked_project_no           text references "ProjectInfo"("ProjectNo"),
  archived                    boolean default false,

  -- Audit
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),
  submitted_at                timestamptz,
  created_by                  uuid not null references auth.users(id),
  last_status_change_by       uuid references auth.users(id),
  last_status_change_at       timestamptz
);

create index proposals_pi_user_id_idx on proposals(pi_user_id);
create index proposals_division_code_idx on proposals(division_code);
create index proposals_status_idx on proposals(status);
```

`proposal_code` generated by a `BEFORE INSERT` trigger: `PROP-{YYYY}-{NNNN}` where `NNNN` is a per-year sequence.

### Table `proposal_copis`

```sql
create table proposal_copis (
  proposal_id uuid references proposals(id) on delete cascade,
  staff_id    text not null,                 -- StaffMember.ID
  staff_name  text not null,                 -- snapshot
  primary key (proposal_id, staff_id)
);
```

### Table `proposal_documents`

```sql
create table proposal_documents (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references proposals(id) on delete cascade,
  doc_type      text not null check (doc_type in ('signed_proposal','om_document')),
  storage_path  text not null,               -- bucket key
  file_name     text not null,
  file_size     int,
  uploaded_at   timestamptz default now(),
  uploaded_by   uuid not null references auth.users(id)
);

create index proposal_documents_proposal_id_idx on proposal_documents(proposal_id);
```

Latest row per `(proposal_id, doc_type)` is the canonical file. Older rows kept for audit.

### Table `proposal_status_history`

```sql
create table proposal_status_history (
  id            bigserial primary key,
  proposal_id   uuid not null references proposals(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  payload       jsonb,                       -- per-status fields snapshot
  changed_by    uuid not null references auth.users(id),
  changed_at    timestamptz default now()
);

create index proposal_status_history_proposal_id_idx on proposal_status_history(proposal_id);
```

Append-only. Never updated or deleted.

---

## 4. RLS Policies

All four tables ship with RLS enabled.

### `proposals`

**SELECT** — readable when any of:
- `pi_user_id = auth.uid()` OR `created_by = auth.uid()` (owner)
- Caller has `HOD` or `DivisionHead` in `user_roles` AND `division_code` matches caller's division
- Caller has `Director`, `HRAdmin`, `SystemAdmin`, or `MasterAdmin` role

**INSERT** — caller must be Scientist with `pi_user_id = auth.uid()` and `created_by = auth.uid()`.

**UPDATE** — only the owner, only while `status IN ('DRAFT','REVISION_REQUESTED')`. Admin status changes go through RPCs (SECURITY DEFINER bypasses this policy).

**DELETE** — disabled at policy level. Admins use the `proposal_archive` RPC.

### Child tables

`proposal_copis`, `proposal_documents`, `proposal_status_history` SELECT/INSERT inherit visibility via `EXISTS (select 1 from proposals where id = parent.proposal_id and <readable_by_caller>)`.

### Storage bucket `proposal-documents`

Bucket private. Object policies mirror `proposals` SELECT. Path prefix is `{proposal_id}/`, used to join back to the table for the visibility check.

---

## 5. State Machine

```
DRAFT ──submit──> SUBMITTED ──admin──> UNDER_REVIEW
                       ↑                  │
                       │                  │
      ┌────────────────┴──────┐           │
      │   scientist resubmits │           │
      │                       │           │
REVISION_REQUESTED <──────────┼───────────┤
                              ↓           ↓
                          REJECTED    RECOMMENDED
                         (terminal)        │
                                           ↓
                                       APPROVED
                                           │
                                           ↓
                                       OM_ISSUED
                                           │
                            ┌──────────────┴─────────────┐
                            ↓                            ↓
                        ARCHIVED                LINKED (terminal)
                       (terminal)           (→ ProjectInfo.ProjectNo)
```

Notes:
- `REVISION_REQUESTED → SUBMITTED` is the resubmit path (RPC accepts either `DRAFT` or `REVISION_REQUESTED` as source).
- While in `REVISION_REQUESTED`, the owner regains edit rights on the form.

**Status values:** `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `REVISION_REQUESTED`, `REJECTED`, `RECOMMENDED`, `APPROVED`, `OM_ISSUED`, `ARCHIVED`, `LINKED`.

Terminal: `REJECTED`, `ARCHIVED`, `LINKED`.

---

## 6. RPCs

All RPCs are `SECURITY DEFINER`. Each one:
1. Validates current status; raises `invalid_status_transition` exception otherwise.
2. Validates caller role via `user_roles`.
3. Performs the status change.
4. Appends a row to `proposal_status_history` with payload snapshot.
5. Sets `last_status_change_by`, `last_status_change_at`, `updated_at`.

| RPC | Caller | Inputs | Transition |
|---|---|---|---|
| `proposal_submit(p_id uuid)` | scientist (owner) | id | `DRAFT → SUBMITTED`; sets `submitted_at`, snapshots `pi_name` |
| `proposal_set_under_review(p_id uuid, p_body text, p_sent_date date)` | admin | id, body name, sent date | `SUBMITTED → UNDER_REVIEW` |
| `proposal_request_revision(p_id uuid, p_notes text)` | admin | id, notes (required) | `UNDER_REVIEW → REVISION_REQUESTED` (unlocks edit) |
| `proposal_reject(p_id uuid, p_reason text)` | admin | id, reason (required) | `UNDER_REVIEW → REJECTED` |
| `proposal_recommend(p_id uuid)` | admin | id | `UNDER_REVIEW → RECOMMENDED` |
| `proposal_approve(p_id uuid, p_amount numeric, p_date date)` | admin | id, amount, sanction date | `RECOMMENDED → APPROVED` |
| `proposal_issue_om(p_id uuid, p_om_no text, p_om_date date, p_doc_id uuid)` | admin | id, OM number, OM date, uploaded `proposal_documents.id` of type `om_document` | `APPROVED → OM_ISSUED` |
| `proposal_archive(p_id uuid)` | admin | id | `OM_ISSUED → ARCHIVED`; sets `archived=true` |
| `proposal_link_project(p_id uuid, p_project_no text)` | admin | id, existing `ProjectInfo.ProjectNo` | `OM_ISSUED → LINKED` |

Client wrappers in `src/lib/proposals/api.ts` return `{ ok: true } | { ok: false, error: string }`.

Why RPCs and not direct UPDATE: matches CLAUDE.md PMS rule — never patch `status` from the client. Atomicity, audit trail, and role check are enforced in one place server-side.

---

## 7. UI Surfaces

### List page — `Proposals.tsx`

- StatCards: `My Drafts`, `Under Review`, `Approved`, `OM Issued`. Counts scoped to caller's RLS visibility.
- Filters: status dropdown, fund type, division (admin only), search by title/acronym/PI.
- DataTable columns: `proposal_code`, `title`, `pi_name`, `status` (color-coded Badge), `requested_budget`, `created_at`.
- "New Proposal" button — Scientist only.
- Row click → `/proposals/:id`.

### Form page — `ProposalForm.tsx`

Used for both create and edit. Edit allowed only when caller is owner and `status IN ('DRAFT','REVISION_REQUESTED')`.

Sections (collapsible cards):
1. **Identity** — title, acronym, domain_theme, project_category
2. **Sponsor** — fund_type, sponsor_type, sponsor_name
3. **Timeline & Budget** — proposed_start_date, proposed_duration_months, requested_budget
4. **Team** — PI (read-only = logged user), Co-PIs (multi-select from staff list)
5. **Technical** — abstract, problem_statement, objectives, expected_outcomes, current_trl, target_trl
6. **Document** — single `signed_proposal` PDF upload (required to submit; optional to save draft)

Buttons:
- `Save Draft` → upserts row with `status='DRAFT'`; relaxed validation (only `title` required).
- `Submit` → strict zod validation, requires uploaded PDF, then calls `proposal_submit` RPC.

If editing a `REVISION_REQUESTED` proposal, `Submit` re-runs `proposal_submit` and transitions `REVISION_REQUESTED → SUBMITTED`. (RPC accepts either source state.)

### Detail page — `ProposalDetail.tsx`

- Read-only summary, sections expand on click.
- Status badge + timeline strip rendered from `proposal_status_history`.
- Document list with download links via short-lived signed URLs.
- Admin panel (visible only to HRAdmin/SystemAdmin/MasterAdmin):
  - "Update Status" button → opens `StatusUpdateModal`.
  - Modal lists only the next legal transitions for the current status.
  - Each transition renders the required fields per §6 RPC signature.
- For terminal states `LINKED` and `ARCHIVED`, panel shows summary instead of update button.

### Permissions helper — `src/lib/proposals/permissions.ts`

```ts
canCreateProposal(user) → user.roles.includes('Scientist')
canEditProposal(user, p) →
  p.created_by === user.id &&
  ['DRAFT','REVISION_REQUESTED'].includes(p.status)
canUpdateStatus(user) → hasAny(user, ['HRAdmin','SystemAdmin','MasterAdmin'])
// view: rely on RLS; no client-side gate
```

---

## 8. File Storage

**Bucket:** `proposal-documents` (private).

**Path convention:**
```
proposal-documents/
  {proposal_id}/
    signed_proposal/{epoch_ms}_{sanitized_filename}.pdf
    om_document/{epoch_ms}_{sanitized_filename}.pdf
```

**Constraints:**
- PDF only. Client-side MIME check; server-side enforced by Storage policy.
- Max 25 MB per file.
- Re-upload allowed. New `proposal_documents` row inserted; older rows kept for audit; UI shows latest.

**Access:**
- Upload: scientist (own proposal) for `signed_proposal`; admin for `om_document`.
- Download: short-lived signed URL (60 s) via `supabase.storage.createSignedUrl()`.

**Client helpers** — `src/lib/proposals/storage.ts`:
- `uploadProposalDoc(proposalId, docType, file)` → returns inserted `proposal_documents.id`
- `getDownloadUrl(docId)` → resolves to a signed URL

Upload is sequenced: Storage put first, then `proposal_documents` row insert. If insert fails, the Storage object is removed (best-effort) to avoid orphans.

---

## 9. Error Handling

- RPC errors → toast via existing toast pattern; form state preserved on failure (no re-fetch).
- File upload failure → no `proposal_documents` row inserted.
- Optimistic concurrency: `updated_at` is sent as a `If-Match`-style argument on edit save; RPC raises if value differs from current row, UI shows "Proposal modified by another session — refresh."
- Illegal status transition (race condition) → RPC raises `invalid_status_transition`; modal shows inline error, refetches the proposal.

---

## 10. Testing

- **Unit:** `lib/proposals/validation.ts` zod schemas — draft path and submit path (vitest).
- **Unit:** `lib/proposals/permissions.ts` — role matrix (vitest).
- **Integration:** RPC sequence against test Supabase project — happy path `submit → under_review → recommend → approve → om_issued → archived` and revision loop `submit → under_review → request_revision → submit`.
- **RLS:** assert scientist A cannot read scientist B's proposal; HOD reads own division only; admin reads all.

---

## 11. Open Decisions Deferred to Implementation

- Exact list of Domain/Theme values and Project Category values. Hardcoded in `constants.ts`. User to supply or accept a starter list during implementation.
- Whether `Co-PIs` selection list filters by division or shows all staff. Default to all-staff for v1.
- Email/notification on status change. Out of scope for v1.

---

## 12. Out of Scope (v1)

- In-app review/approval workflow.
- Reviewer assignment, scoring, committee UI.
- Document versioning UI (history kept but no diff/restore).
- Admin CRUD for Domain/Theme and Project Category.
- Notifications.

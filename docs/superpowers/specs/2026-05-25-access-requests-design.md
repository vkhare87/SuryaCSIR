# First-Time User Access Requests — Design Spec

**Date:** 2026-05-25
**Scope:** Self-service role-request flow for new (`DefaultUser`) accounts, with SystemAdmin/MasterAdmin review + grant.
**Status:** Approved design, pending implementation plan.

---

## Goal

A first-time user lands on a static "wait for an admin" screen (`PendingAccessView`) with no way to act. Add a
request workflow: the user requests roles (+ division + justification); SystemAdmin/MasterAdmin review a queue,
verify identity (auto-matched staff record), and grant a chosen subset of roles. On approval the `DefaultUser`
placeholder is replaced with the granted roles.

## Principles

- **All role grants flow through a SECURITY DEFINER RPC** — never client-side `user_roles` writes (matches the
  PMS transition pattern; see CLAUDE.md).
- **RLS mandatory** on the new table from the first migration.
- **New timestamped migration**, never edit `00000000000000_init.sql`.
- Reuse existing helpers (`user_has_role`) and the `useData()`/`useAuth()` conventions.

## Non-Goals

- No email notifications (in-app only).
- No bulk approve. No request editing after submit (resubmit instead).
- No change to the auto-register trigger (new users still start as `DefaultUser`).

---

## 1. Data Model — new migration `<TS>_access_requests.sql`

```sql
CREATE TABLE public.access_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email              text,
    requested_roles    text[] NOT NULL,
    requested_division text NULL,
    justification      text NOT NULL DEFAULT '',
    status             text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    review_note        text NULL,
    reviewed_by        uuid NULL REFERENCES auth.users(id),
    reviewed_at        timestamptz NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- At most one open request per user
CREATE UNIQUE INDEX access_requests_one_pending
    ON public.access_requests(user_id) WHERE status = 'PENDING';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
```

**RLS policies:**
- `select_own`: `auth.uid() = user_id`.
- `insert_own`: `auth.uid() = user_id` (requester creates their own request).
- `select_admin` / `update_admin`: `user_has_role('SystemAdmin') OR user_has_role('MasterAdmin')`.
- No client UPDATE/DELETE by requester; status changes happen via RPC only.

**Requestable roles** (frontend picker): all roles **except** `DefaultUser`, `SystemAdmin`, `MasterAdmin`
(admin roles are granted manually, not self-requested).

## 2. RPCs (SECURITY DEFINER; guard: caller is SystemAdmin or MasterAdmin, else `RAISE EXCEPTION`)

```sql
approve_access_request(p_request_id uuid, p_roles text[], p_division text)
```
- Validate request exists and is `PENDING`; resolve its `user_id`.
- For each role in `p_roles`: `INSERT INTO user_roles(user_id, role, division_code, must_change_password)
  VALUES (..., false) ON CONFLICT DO NOTHING`.
- `DELETE FROM user_roles WHERE user_id = target AND role = 'DefaultUser'`.
- `UPDATE user_profiles SET active_role = p_roles[1] WHERE user_id = target`.
- `UPDATE access_requests SET status='APPROVED', review_note=NULL, reviewed_by=auth.uid(), reviewed_at=now()`.
- All in one function body (atomic).

```sql
reject_access_request(p_request_id uuid, p_note text)
```
- Guarded; set `status='REJECTED', review_note=p_note, reviewed_by=auth.uid(), reviewed_at=now()`.
- User keeps `DefaultUser`; the partial unique index frees up so they can submit a new PENDING request.

Both `GRANT EXECUTE ... TO authenticated` (internal guard enforces admin-only).

## 3. User UI — rework `src/pages/dashboards/PendingAccessView.tsx`

Loads the user's latest `access_requests` row (by `user_id`, newest first) via `supabase`.

- **No request / latest REJECTED** → request form:
  - Multi-select of requestable roles (checkbox list).
  - Division dropdown (from `useData().divisions`, optional).
  - Justification textarea (required, non-empty).
  - Submit → `insert` into `access_requests` (status defaults PENDING). On rejected, show prior `review_note`
    above the form and let them resubmit.
- **PENDING** → status card: "Request submitted, awaiting review" + the roles/division/justification they sent.
- **APPROVED** is transient (their active role changes on next session refresh; the view won't render for them).

Keep the existing visual shell (icon, email chip, CSIR-AMPRI footer); swap the body for form/status.

## 4. Admin UI — new page `src/pages/AccessRequests.tsx`, route `/admin/access-requests`

- Route in `App.tsx`, `allowedRoles={['SystemAdmin','MasterAdmin']}`; nav item under **Admin** group in `Layout.tsx`.
- Loads `access_requests` (PENDING first) + `useData().staff`/`divisions`.
- Each request card:
  - Requester email, submitted roles, requested division, justification, timestamp.
  - **Auto-matched staff record:** find `staff` where `Email` (case-insensitive) === request email → show
    name / designation / division as a verification panel (or "no staff match found").
  - **Grant controls:** checkbox list pre-checked to the requested roles (admin can uncheck), division
    dropdown pre-filled from requested division or the matched staff's division.
  - **Approve** → `rpc('approve_access_request', { p_request_id, p_roles, p_division })`.
  - **Reject** → prompt for note → `rpc('reject_access_request', { p_request_id, p_note })`.
  - Refresh queue after each action; toast on success/failure.
- SystemAdmin dashboard's existing "Reg. Users / N pending" KPI links to `/admin/access-requests`.

## Data flow & errors

- Frontend never writes `user_roles`/`user_profiles` directly — only `insert` into `access_requests` (user) and
  the two RPCs (admin).
- RPC failures surface via the app's existing toast pattern; guard violations return a Postgres error.
- Empty queue → friendly empty state.

## Files

- **New:** `supabase/migrations/<TS>_access_requests.sql` (table + RLS + 2 RPCs),
  `src/pages/AccessRequests.tsx`, `src/lib/access/requestableRoles.ts` (the role allow-list constant + helper).
- **Modify:** `src/pages/dashboards/PendingAccessView.tsx` (request form/status),
  `src/App.tsx` (route + lazy import), `src/components/layout/Layout.tsx` (Admin nav item),
  `src/pages/dashboards/SystemAdminView.tsx` (link the pending KPI).
- **Types:** add `AccessRequest` interface to `src/types/index.ts`.

## Testing

- Unit-test `requestableRoles` (excludes admin/DefaultUser) and any pure mapping/validation helper (vitest).
- The migration + RPCs are applied to Supabase by the user (CLI `db reset` on a clean project, or SQL editor as
  `postgres`); not runnable in CI here.
- Manual: as a fresh `DefaultUser`, submit a request → appears in admin queue → approve subset → user gains roles,
  `DefaultUser` gone; reject path shows note + allows resubmit. Auto-match shows the right staff row.

## Open Items for Planning

- Exact multi-select widget styling (checkbox list vs chips) — cosmetic; match existing form patterns.
- Whether to also expose this queue to `HRAdmin` later — out of scope now (SystemAdmin+MasterAdmin only).
- **Deployment note:** the new migration must be applied to the live Supabase before the UI works; the spec
  ships the SQL file but applying it is a manual user step.

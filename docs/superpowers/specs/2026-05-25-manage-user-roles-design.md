# Design — Manage User Roles

**Date:** 2026-05-25
**Status:** Approved (design phase)

## Problem

Roles in SURYA are not fixed: a Scientist may become HOD, a Technician may pick up
ProjectStaff duties, etc. Today the only role-assignment path is
`access_requests` — and that handles **first-time onboarding only** (a `DefaultUser`
requesting initial access). Once a user holds any role, there is no in-app way to
change it. Editing roles requires direct database access.

This feature gives `SystemAdmin` and `MasterAdmin` an in-app way to edit any user's
role assignments after onboarding.

## Scope (decisions)

- **Location:** a new tab inside the existing Access Requests page
  (`/admin/access-requests`, already gated to `SystemAdmin` + `MasterAdmin`).
- **Editable per user:** roles (add/remove), active role, division.
- **Admin roles:** both `SystemAdmin` and `MasterAdmin` may grant/revoke every role,
  including the powerful admin roles.
- **Lockout guards:** block an admin from stripping their own last admin role, and
  block removing the institute's last remaining admin.
- **Audit:** each role change is recorded.

Out of scope: creating/deleting auth users, password resets, bulk edits.

## Architecture

### Database — migration `supabase/migrations/20260525130000_manage_user_roles.sql`

One `SECURITY DEFINER` RPC, mirroring the existing `approve_access_request` pattern:

```
admin_set_user_roles(
    p_user_id     uuid,
    p_roles       text[],
    p_active_role text,
    p_division    text
) RETURNS void
```

Logic, in order:

1. **Authz** — caller must hold `SystemAdmin` or `MasterAdmin`
   (`public.user_has_role`), else `RAISE EXCEPTION 'not authorized'`.
2. **Validation**
   - `p_roles` non-empty, else `RAISE EXCEPTION 'no roles selected'`.
   - every entry of `p_roles` must be one of the 14 allowed roles
     (the `user_roles.role` CHECK set), else raise.
   - `p_active_role` must be a member of `p_roles`, else raise.
3. **Lockout guards** (computed against current vs. requested state):
   - If the target user **is the caller** and the requested roles include no admin
     role (`SystemAdmin`/`MasterAdmin`) while the caller currently holds one →
     `RAISE EXCEPTION 'cannot remove your own last admin role'`.
   - If the change removes an admin role from the target and, after applying it, the
     count of distinct users holding any admin role would drop below 1 →
     `RAISE EXCEPTION 'cannot remove the last administrator'`.
4. **Diff** current role set vs. `p_roles` → `added`, `removed`.
5. **Apply**
   - `DELETE` removed role rows for the user.
   - `INSERT … ON CONFLICT (user_id, role) DO UPDATE` added rows.
   - Set `division_code = p_division` on all of the user's role rows (same behavior as
     `approve_access_request`, which applies one division to every granted role).
6. **Active role** — `UPDATE user_profiles SET active_role = p_active_role`.
7. **Audit** — `INSERT` into `pms_audit_logs`:
   - `user_id` = `auth.uid()` (the acting admin)
   - `action` = `'ROLES_UPDATED'`
   - `entity_type` = `'user_roles'`
   - `entity_id` = `p_user_id` (the edited user)
   - `details` = jsonb `{ added, removed, active_role, division }`

`GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, text[], text, text) TO authenticated`.

No new table. No RLS changes — `user_roles` and `user_profiles` already carry
admin select/insert/update/delete policies, and `pms_audit_logs` already accepts
free-text `action`/`entity_type`.

`pms_audit_logs` is the audit target (not the committees `audit_log`) because its
columns fit: free-text `action`/`entity_type`, uuid `user_id` actor + uuid
`entity_id` target, jsonb `details`, and no restrictive CHECK constraints. The
`AuditLog.tsx` "PMS" tab already renders this table generically, so `ROLES_UPDATED`
entries appear there with no UI change.

### Frontend

**`src/pages/AccessRequests.tsx`** becomes a two-tab shell:

- **Pending Requests** — the existing review/grant UI, behavior unchanged.
- **Manage Users** — new, extracted into its own component.

**`src/components/admin/ManageUsersTab.tsx`** (new):

- **Load** (admins can read both tables via existing RLS):
  - `user_profiles` → all users (`user_id`, `email`, `active_role`).
  - `user_roles` → grouped by `user_id` → current roles + `division_code`.
  - Match `email` against `staff` (from `useData()`) to display
    Name · Designation · Division, reusing the pending-requests match style.
- **List** — searchable by email/name. Each row: email, staff name, current-role
  chips, active-role badge.
- **Edit** (click row → inline expand):
  - Role checkboxes for all 14 roles (`Role` union from `src/types`).
  - Active-role `<select>`, options limited to currently-checked roles.
  - Division `<select>` — `divisions` from `useData()`, plus a "No division" option.
  - **Save** → `supabase.rpc('admin_set_user_roles', { p_user_id, p_roles,
    p_active_role, p_division })`. On success: toast + reload list. On error
    (including lockout guards): `push(error.message, 'error')` surfaces the raised
    message verbatim.

No routing or nav change — the page is already mounted at `/admin/access-requests`
behind `ProtectedRoute allowedRoles={['SystemAdmin','MasterAdmin']}`.

## Data flow

```
Admin edits roles in ManageUsersTab
  → supabase.rpc('admin_set_user_roles', …)
    → RPC: authz + validate + lockout guards
    → mutate user_roles (delete/insert) + user_profiles.active_role
    → insert pms_audit_logs row
  → toast + reload tab
  (edited user picks up new roles on their next AuthContext.resolveUserRoles)
```

## Error handling

- RPC raises plain-text exceptions for every rejection (authz, validation, lockout).
  The Supabase client returns these as `error.message`, surfaced to the admin via the
  existing toast (`useToast().push`).
- Demo mode (no Supabase / dev-admin mock user): the tab guards on `supabase` being
  present, same as the existing pending-requests load.

## Testing

- RPC unit-level checks (manual / SQL Editor against a clean project):
  - non-admin caller → `not authorized`.
  - empty `p_roles` → `no roles selected`.
  - `p_active_role` not in `p_roles` → raise.
  - admin removing own last admin role → `cannot remove your own last admin role`.
  - removing the only admin in the system → `cannot remove the last administrator`.
  - happy path: roles added/removed, `active_role` updated, audit row written.
- UI: load list, search, edit a non-admin user (e.g. add HOD to a Scientist), verify
  toast + refreshed chips, verify the `ROLES_UPDATED` entry in AuditLog "PMS" tab.

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/20260525130000_manage_user_roles.sql` | new — `admin_set_user_roles` RPC |
| `src/pages/AccessRequests.tsx` | refactor to tab shell; keep pending UI |
| `src/components/admin/ManageUsersTab.tsx` | new — user list + role editor |

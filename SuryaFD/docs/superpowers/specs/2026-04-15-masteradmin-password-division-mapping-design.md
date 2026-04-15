# Design Spec: MasterAdmin Role, Password Reset Wizard & Division Mapping
**Date:** 2026-04-15  
**Status:** Approved  
**Scope:** SURYA FD — SuryaFD React/Vite/Supabase app

---

## 1. Problem Summary

Four interconnected issues to resolve:

1. **Login failure for `vivek.khare@csir.res.in`** — The `user_roles` CHECK constraint does not include `MasterAdmin`. The account either has no `user_roles` row or an invalid role value, causing `resolveUserRole` to sign the user out immediately.
2. **No forced password change on first login** — All users need passwords reset to `CSIR-AMPRI` with a mandatory change on next login.
3. **No division data on project staff, PhD students, contract staff** — These three tables have no `division_code` column. No contract staff table exists at all.
4. **No tagging UI** — Admins have no way to assign division, PI, guide, or supervisor to non-regular-staff records.

---

## 2. Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| MasterAdmin scope | Fully additive over SystemAdmin | All SystemAdmin capabilities + password management + user provisioning + division mapping ownership |
| Password change enforcement | Route-level interceptor (`/change-password`) | Bulletproof — cannot be bypassed; fits existing `ProtectedRoute` pattern |
| Division mapping storage | Add columns directly to source tables | Simplest, no overlay complexity; auto-detection fills on import |
| Division mapping UI placement | New tab inside `/data` (DataManagement) | Already MasterAdmin/HRAdmin restricted; consistent with existing data admin surface |

---

## 3. Database Schema Changes (`migration_v2.sql`)

All changes are additive. Script is idempotent (safe to run twice).

### 3.1 `user_roles` table

```sql
-- Expand CHECK constraint to include MasterAdmin
ALTER TABLE public.user_roles
  DROP CONSTRAINT user_roles_role_check,
  ADD CONSTRAINT user_roles_role_check CHECK (role IN (
    'Director','DivisionHead','Scientist','Technician',
    'HRAdmin','FinanceAdmin','SystemAdmin','MasterAdmin'
  ));

-- Force-change flag
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
```

### 3.2 `project_staff` table

```sql
ALTER TABLE public.project_staff ADD COLUMN IF NOT EXISTS "DivisionCode" text;
-- PIName already exists; no addition needed
```

### 3.3 `phd_students` table

```sql
ALTER TABLE public.phd_students ADD COLUMN IF NOT EXISTS "DivisionCode" text;
-- SupervisorName / CoSupervisorName already exist
```

### 3.4 New `contract_staff` table

```sql
CREATE TABLE IF NOT EXISTS public.contract_staff (
    "id"                text PRIMARY KEY,
    "Name"              text,
    "Designation"       text,
    "Division"          text,
    "DateOfJoining"     text,
    "ContractEndDate"   text,
    "LabCode"           text,
    "DateOfBirth"       text,
    "AttachedToStaffID" text    -- references staff.ID
);

ALTER TABLE public.contract_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contract_staff"
    ON public.contract_staff FOR SELECT TO authenticated USING (true);

CREATE POLICY "HRAdmin and MasterAdmin can write contract_staff"
    ON public.contract_staff FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin', 'MasterAdmin')
    )
    WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin', 'MasterAdmin')
    );
```

### 3.5 Password reset (all users)

```sql
-- Reset all passwords to CSIR-AMPRI
UPDATE auth.users
SET encrypted_password = crypt('CSIR-AMPRI', gen_salt('bf')),
    updated_at = NOW();

-- Force password change for everyone
UPDATE public.user_roles SET must_change_password = true;
```

### 3.6 Fix `vivek.khare@csir.res.in`

```sql
-- Upsert MasterAdmin role (runs after constraint expansion)
INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
SELECT id, 'MasterAdmin', NULL, true
FROM auth.users WHERE email = 'vivek.khare@csir.res.in'
ON CONFLICT (user_id) DO UPDATE
  SET role = 'MasterAdmin', must_change_password = true;
```

---

## 4. TypeScript / App Changes

### 4.1 `types/index.ts`

- Add `'MasterAdmin'` to the `Role` union type.
- Add `mustChangePassword: boolean` to `UserAccount` interface — read by `ProtectedRoute` via `useAuth()`.
- Add `ContractStaff` interface:

```typescript
export interface ContractStaff {
  id: string;
  Name: string;
  Designation: string;
  Division: string;       // references DivisionInfo.divCode
  DateOfJoining: string;
  ContractEndDate: string;
  LabCode: string;
  DateOfBirth: string;
  AttachedToStaffID: string;  // references StaffMember.ID
}
```

- Add `DivisionCode` field to `ProjectStaff` and `PhDStudent` interfaces.

### 4.2 `utils/supabaseClient.ts`

No changes needed beyond what was already fixed (build fix session).

### 4.3 `contexts/AuthContext.tsx`

- `resolveUserRole` query adds `must_change_password` to the SELECT.
- Context exposes `mustChangePassword: boolean`.
- New `clearMustChangePassword()` async function:
  - Calls `supabase.from('user_roles').update({ must_change_password: false }).eq('user_id', user.id)`
  - Updates local state: `setUser(prev => ({ ...prev!, mustChangePassword: false }))`

### 4.4 `contexts/DataContext.tsx`

- Add `contractStaff: ContractStaff[]` state.
- Add `contract_staff` to the `Promise.all` Supabase fetch.
- Add `mapContractStaffRow` mapper in `utils/dataMapper.ts`.
- Expose `contractStaff` on the context type.

### 4.5 `App.tsx`

- Add `/change-password` route (authenticated but not blocked by `mustChangePassword`).
- `ProtectedRoute` logic addition:
  ```
  if (isAuthenticated && mustChangePassword && currentPath !== '/change-password')
    → <Navigate to="/change-password" replace />
  ```
- Add `MasterAdmin` to `ROLE_ROUTES` → `/master-admin`.
- Add `/master-admin` route → `<Dashboard />`.
- Add `'MasterAdmin'` to `allowedRoles` on DataManagement, Recruitment routes.

### 4.6 `constants/roleRoutes.ts`

```typescript
MasterAdmin: '/master-admin'
```

---

## 5. New Page: `ChangePassword`

**File:** `src/pages/ChangePassword.tsx`

**Layout:** Matches Login page aesthetic — dark left panel (SURYA branding), light right panel (form).

**Form fields:**
- Current password (confirms identity)
- New password (min 8 characters)
- Confirm new password

**Flow:**
1. User submits form
2. `supabase.auth.signInWithPassword({ email, password: currentPassword })` called first to verify current password
3. On verification success → `supabase.auth.updateUser({ password: newPassword })` called
4. On success → `clearMustChangePassword()` → navigate to `ROLE_ROUTES[role]`
5. On any error → inline error message, stays on page

**Edge cases:**
- Dev bypass (`admin@dev.local`) — `mustChangePassword` is always `false`, page never shown
- Refresh mid-wizard — session restored, user lands back on `/change-password`
- Supabase error — shown inline, no silent failure

---

## 6. Division Mapping UI

**Location:** New "Staff Mapping" tab in `src/pages/DataManagement.tsx`  
**Visibility:** `HRAdmin`, `SystemAdmin`, `MasterAdmin` only

### 6.1 Untagged summary banner

On DataManagement landing, a banner shows:  
*"X project staff, Y PhD students, Z contract staff have no division assigned."*  
Clicking it navigates to the Staff Mapping tab.

### 6.2 Three sub-tabs

**Project Staff | PhD Students | Contract Staff**

Each sub-tab renders a table with columns:
- Name / Enrollment No
- Designation / Specialization  
- Division (current value or **Untagged** badge in amber)
- PI / Supervisor / Attached To (current value or empty)
- Edit button → inline row expansion

**Inline assignment panel (row expand):**
- Division picker: dropdown populated from `divisions` table (divCode + divName)
- PI/Guide/Attached-To picker: searchable dropdown of `staff` records (Name + ID)
- Save → PATCH to Supabase, optimistic UI update
- Cancel → collapse row

### 6.3 Auto-detection on import

Triggered in `utils/dataMigration.ts` after CSV/XLS parse, before Supabase insert:

| Table | Resolution logic |
|---|---|
| `project_staff` | `ProjectNo` → `projects` lookup → copy `DivisionCode` |
| `phd_students` | `SupervisorName` exact match → `staff.Name` → copy `Division` as `DivisionCode` |
| `contract_staff` | `AttachedToStaffID` value matched against `staff.Name` first (name match), then `staff.ID` as fallback → copy `Division` |

- Resolved rows: `DivisionCode` pre-filled before insert
- Unresolved rows: inserted with `DivisionCode = null`, appear as "Untagged" in mapping UI

---

## 7. Data Mapper Additions (`utils/dataMapper.ts`)

New function `mapContractStaffRow` mapping Supabase column names → `ContractStaff` interface.  
`mapProjectStaffRow` and `mapPhDStudentRow` updated to include `DivisionCode`.

---

## 8. Files Changed / Created

| File | Change type |
|---|---|
| `migration_v2.sql` (new, root) | All DB schema changes — single paste into Supabase SQL Editor |
| `src/types/index.ts` | Add `MasterAdmin` to `Role`, add `ContractStaff`, update `ProjectStaff`/`PhDStudent` |
| `src/contexts/AuthContext.tsx` | Add `mustChangePassword`, `clearMustChangePassword` |
| `src/contexts/DataContext.tsx` | Add `contractStaff` state + fetch |
| `src/utils/dataMapper.ts` | Add `mapContractStaffRow`, update existing mappers |
| `src/utils/dataMigration.ts` | Add auto-detection step post-parse |
| `src/App.tsx` | Add `/change-password` route, `MasterAdmin` route, intercept in `ProtectedRoute` |
| `src/constants/roleRoutes.ts` | Add `MasterAdmin` entry |
| `src/pages/ChangePassword.tsx` (new) | First-login password change wizard |
| `src/pages/DataManagement.tsx` | Add Staff Mapping tab + untagged banner |

---

## 9. Out of Scope

- Email notifications on password reset
- Audit log of who tagged which division
- Bulk division assignment (select multiple → assign one division) — future backlog
- Supabase CLI migration tooling — out of scope for this phase

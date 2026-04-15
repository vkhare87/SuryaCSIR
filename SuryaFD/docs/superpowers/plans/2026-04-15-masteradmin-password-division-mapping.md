# MasterAdmin Role, Password Reset Wizard & Division Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MasterAdmin role, enforce first-login password change for all users, and build a division-tagging UI for project staff, PhD students, and contract staff.

**Architecture:** Schema changes land in a single `migration_v2.sql` script the admin runs once in Supabase SQL Editor. All app changes are TypeScript-first — types drive the implementation order. The first-login wizard intercepts routing via `ProtectedRoute`. The division mapping UI lives in a new "Staff Mapping" tab inside the existing `DataManagement` page.

**Tech Stack:** React 19, TypeScript 5, Vite 8, Supabase JS v2, Tailwind CSS v4, React Router v7, Lucide React

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `migration_v2.sql` | **Create** (root) | Single SQL script for all DB changes — user runs once in Supabase |
| `src/types/index.ts` | **Modify** | Add `MasterAdmin` to `Role`, `mustChangePassword` to `UserAccount`, `ContractStaff` interface, `DivisionCode` to `ProjectStaff`/`PhDStudent` |
| `src/constants/roleRoutes.ts` | **Modify** | Add `MasterAdmin: '/master-admin'` |
| `src/utils/dataMapper.ts` | **Modify** | Add `mapContractStaffRow`, update `mapProjectStaffRow`/`mapPhDStudentRow` for `DivisionCode` |
| `src/utils/dataMigration.ts` | **Modify** | Add `contractStaff` to `FileType`, `SCHEMA_MAPS`, `ALLOWED_COLUMNS`, `TABLE_NAMES`; add `resolveImportDivisions()` auto-detection |
| `src/contexts/AuthContext.tsx` | **Modify** | Add `mustChangePassword` to context, `clearMustChangePassword()` function |
| `src/contexts/DataContext.tsx` | **Modify** | Add `contractStaff` state + Supabase fetch |
| `src/App.tsx` | **Modify** | Add `/change-password` route, `/master-admin` route, `mustChangePassword` intercept in `ProtectedRoute` |
| `src/pages/ChangePassword.tsx` | **Create** | First-login password change wizard |
| `src/pages/DataManagement.tsx` | **Modify** | Add top-level tabs (Import / Staff Mapping), Staff Mapping tab with 3 sub-tabs |

---

## Task 1: Database Migration Script

**Files:**
- Create: `migration_v2.sql` (repo root, alongside `supabase_schema.sql`)

- [ ] **Step 1.1: Create `migration_v2.sql`**

Create file at `D:\Claude\Surya\SuryaFD\migration_v2.sql` with the full content below. This script is idempotent — safe to run twice.

```sql
-- migration_v2.sql
-- SURYA — Run once in Supabase SQL Editor (postgres role, bypasses RLS)
-- Safe to run twice: uses IF NOT EXISTS / ON CONFLICT / DO UPDATE patterns
-- ============================================================

-- ============================================================
-- STEP 1: Expand user_roles role CHECK to include MasterAdmin
-- ============================================================
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN (
    'Director', 'DivisionHead', 'Scientist', 'Technician',
    'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin'
  ));

-- ============================================================
-- STEP 2: Add must_change_password flag to user_roles
-- ============================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- ============================================================
-- STEP 3: Add DivisionCode to project_staff
-- ============================================================
ALTER TABLE public.project_staff
  ADD COLUMN IF NOT EXISTS "DivisionCode" text;

-- ============================================================
-- STEP 4: Add DivisionCode to phd_students
-- ============================================================
ALTER TABLE public.phd_students
  ADD COLUMN IF NOT EXISTS "DivisionCode" text;

-- ============================================================
-- STEP 5: Create contract_staff table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contract_staff (
    "id"                text PRIMARY KEY,
    "Name"              text,
    "Designation"       text,
    "Division"          text,
    "DateOfJoining"     text,
    "ContractEndDate"   text,
    "LabCode"           text,
    "DateOfBirth"       text,
    "AttachedToStaffID" text
);

ALTER TABLE public.contract_staff ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_staff'
    AND policyname = 'Authenticated users can read contract_staff'
  ) THEN
    CREATE POLICY "Authenticated users can read contract_staff"
      ON public.contract_staff FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_staff'
    AND policyname = 'HRAdmin and MasterAdmin can write contract_staff'
  ) THEN
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
  END IF;
END $$;

-- ============================================================
-- STEP 6: Reset all passwords to CSIR-AMPRI + force change
-- ============================================================
UPDATE auth.users
SET encrypted_password = crypt('CSIR-AMPRI', gen_salt('bf')),
    updated_at = NOW();

UPDATE public.user_roles
SET must_change_password = true;

-- ============================================================
-- STEP 7: Fix vivek.khare@csir.res.in → MasterAdmin
-- (safe: no-op if user doesn't exist in auth.users)
-- ============================================================
INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
SELECT id, 'MasterAdmin', NULL, true
FROM auth.users
WHERE email = 'vivek.khare@csir.res.in'
ON CONFLICT (user_id) DO UPDATE
  SET role = 'MasterAdmin',
      must_change_password = true;

RAISE NOTICE 'migration_v2.sql completed successfully';
```

- [ ] **Step 1.2: Commit**

```bash
git add migration_v2.sql
git commit -m "feat: add migration_v2.sql for MasterAdmin, password reset, division columns, contract_staff table"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 2.1: Open `src/types/index.ts` and apply all type changes**

Replace the `Role` type, `UserAccount` interface, `ProjectStaff` interface, `PhDStudent` interface, and add `ContractStaff` interface. The full updated sections:

```typescript
// Replace the Role type (line ~123):
export type Role =
  | 'Director'
  | 'DivisionHead'
  | 'Scientist'
  | 'Technician'
  | 'HRAdmin'
  | 'FinanceAdmin'
  | 'SystemAdmin'
  | 'MasterAdmin';

// Replace UserAccount interface (line ~132):
export interface UserAccount {
  id: string;
  email: string;
  role: Role;
  divisionCode: string | null;
  mustChangePassword: boolean;
}

// Replace ProjectStaff interface — add DivisionCode field (line ~60):
export interface ProjectStaff {
  id: string;
  ProjectNo: string;
  StaffName: string;
  Designation: string;
  RecruitmentCycle: string;
  DateOfJoining: string;
  DateOfProjectDuration: string;
  PIName: string;
  DivisionCode: string;
}

// Replace PhDStudent interface — add DivisionCode field (line ~71):
export interface PhDStudent {
  EnrollmentNo: string;
  StudentName: string;
  Specialization: string;
  SupervisorName: string;
  CoSupervisorName: string;
  FellowshipDetails: string;
  CurrentStatus: string;
  ThesisTitle: string;
  ProjectNo: string;
  DivisionCode: string;
}

// Add after IPIntelligence interface:
export interface ContractStaff {
  id: string;
  Name: string;
  Designation: string;
  Division: string;
  DateOfJoining: string;
  ContractEndDate: string;
  LabCode: string;
  DateOfBirth: string;
  AttachedToStaffID: string;
}
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
cd SuryaFD && npx tsc --noEmit 2>&1
```

Expected: errors about `mustChangePassword` not existing on `UserAccount` usages in `AuthContext` — those are fixed in Task 4. At this stage you may see cascade errors. That's normal — they resolve as subsequent tasks complete.

- [ ] **Step 2.3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add MasterAdmin role, ContractStaff type, mustChangePassword to UserAccount"
```

---

## Task 3: Role Routes

**Files:**
- Modify: `src/constants/roleRoutes.ts`

- [ ] **Step 3.1: Add MasterAdmin entry**

The full updated file:

```typescript
import type { Role } from '../types';

export const ROLE_ROUTES: Record<Role, string> = {
  Director:     '/director',
  DivisionHead: '/division-head',
  Scientist:    '/scientist',
  Technician:   '/technician',
  HRAdmin:      '/hr-admin',
  FinanceAdmin: '/finance-admin',
  SystemAdmin:  '/system-admin',
  MasterAdmin:  '/master-admin',
};
```

- [ ] **Step 3.2: Commit**

```bash
git add src/constants/roleRoutes.ts
git commit -m "feat: add MasterAdmin to ROLE_ROUTES"
```

---

## Task 4: Data Mappers + dataMigration

**Files:**
- Modify: `src/utils/dataMapper.ts`
- Modify: `src/utils/dataMigration.ts`

- [ ] **Step 4.1: Update `mapProjectStaffRow` to include `DivisionCode`**

In `src/utils/dataMapper.ts`, replace `mapProjectStaffRow`:

```typescript
export const mapProjectStaffRow = (row: any): ProjectStaff => ({
  id: String(row.id || row.ID || ''),
  ProjectNo: row.ProjectNo || row.project_no || '',
  StaffName: row.StaffName || row.staff_name || '',
  Designation: row.Designation || row.designation || '',
  RecruitmentCycle: row.RecruitmentCycle || row.recruitment_cycle || '',
  DateOfJoining: row.DateOfJoining || row.date_of_joining || '',
  DateOfProjectDuration: row.DateOfProjectDuration || row.date_of_project_duration || '',
  PIName: row.PIName || row.pi_name || '',
  DivisionCode: row.DivisionCode || row.division_code || '',
});
```

- [ ] **Step 4.2: Update `mapPhDStudentRow` to include `DivisionCode`**

Replace `mapPhDStudentRow`:

```typescript
export const mapPhDStudentRow = (row: any): PhDStudent => ({
  EnrollmentNo: row.EnrollmentNo || row.enrollment_no || '',
  StudentName: row.StudentName || row.student_name || '',
  Specialization: row.Specialization || row.specialization || '',
  SupervisorName: row.SupervisorName || row.supervisor_name || '',
  CoSupervisorName: row.CoSupervisorName || row.co_supervisor_name || 'None',
  FellowshipDetails: row.FellowshipDetails || row.fellowship_details || '',
  CurrentStatus: row.CurrentStatus || row.current_status || '',
  ThesisTitle: row.ThesisTitle || row.thesis_title || '',
  ProjectNo: row.ProjectNo || row.project_no || '',
  DivisionCode: row.DivisionCode || row.division_code || '',
});
```

- [ ] **Step 4.3: Add `mapContractStaffRow`**

Add this at the end of `src/utils/dataMapper.ts`. Also update the import at the top to include `ContractStaff`:

```typescript
// Top import line — replace existing import:
import type { DivisionInfo, StaffMember, ProjectInfo, ProjectStaff, PhDStudent, Equipment, ScientificOutput, IPIntelligence, ContractStaff } from '../types';

// Add at end of file:
export const mapContractStaffRow = (row: any): ContractStaff => ({
  id: String(row.id || row.ID || ''),
  Name: row.Name || row.name || '',
  Designation: row.Designation || row.designation || '',
  Division: row.Division || row.division || '',
  DateOfJoining: row.DateOfJoining || row.date_of_joining || '',
  ContractEndDate: row.ContractEndDate || row.contract_end_date || '',
  LabCode: row.LabCode || row.lab_code || '',
  DateOfBirth: row.DateOfBirth || row.date_of_birth || '',
  AttachedToStaffID: row.AttachedToStaffID || row.attached_to_staff_id || '',
});
```

- [ ] **Step 4.4: Add `contractStaff` to `dataMigration.ts` — FileType, SCHEMA_MAPS, ALLOWED_COLUMNS, TABLE_NAMES**

In `src/utils/dataMigration.ts`:

**Line 9 — replace FileType:**
```typescript
export type FileType = 'staff' | 'divisions' | 'projects' | 'projectStaff' | 'phd' | 'equipment' | 'contractStaff';
```

**In `SCHEMA_MAPS` — add `contractStaff` entry after `equipment`:**
```typescript
  contractStaff: {
    'Name':                 'Name',
    'Designation':          'Designation',
    'Division':             'Division',
    'Date of Joining':      'DateOfJoining',
    'Contract End Date':    'ContractEndDate',
    'Lab Code':             'LabCode',
    'Date of Birth':        'DateOfBirth',
    'Attached To':          'AttachedToStaffID',
    'DateOfJoining':        'DateOfJoining',
    'ContractEndDate':      'ContractEndDate',
    'LabCode':              'LabCode',
    'DateOfBirth':          'DateOfBirth',
    'AttachedToStaffID':    'AttachedToStaffID',
  },
```

**In `ALLOWED_COLUMNS` — add `contractStaff` entry:**
```typescript
  contractStaff: [
    'id', 'Name', 'Designation', 'Division', 'DateOfJoining',
    'ContractEndDate', 'LabCode', 'DateOfBirth', 'AttachedToStaffID',
  ],
```

**In `TABLE_NAMES` — add `contractStaff` entry:**
```typescript
  contractStaff: 'contract_staff',
```

- [ ] **Step 4.5: Add `resolveImportDivisions()` auto-detection function to `dataMigration.ts`**

Add this function at the end of `dataMigration.ts`, before the final export if any. It accepts the parsed rows, the file type, and reference data (projects and staff already in the DB) and returns the rows with `DivisionCode` pre-filled where possible:

```typescript
/**
 * Post-parse auto-detection: pre-fills DivisionCode/Division using existing
 * reference data before rows are pushed to Supabase.
 *
 * project_staff: ProjectNo → projects lookup → copy DivisionCode
 * phd:           SupervisorName exact match → staff.Name → copy Division
 * contractStaff: AttachedToStaffID value matched against staff.Name first,
 *                then staff.ID as fallback → copy Division
 *
 * Rows with no match are returned unchanged (DivisionCode stays empty).
 */
export function resolveImportDivisions(
  rows: Record<string, string>[],
  type: FileType,
  referenceProjects: Array<{ ProjectNo: string; DivisionCode: string }>,
  referenceStaff: Array<{ ID: string; Name: string; Division: string }>,
): Record<string, string>[] {
  if (type === 'projectStaff') {
    const projectMap = new Map(
      referenceProjects.map((p) => [p.ProjectNo, p.DivisionCode])
    );
    return rows.map((row) => {
      if (row.DivisionCode) return row; // already set, don't overwrite
      const divCode = projectMap.get(row.ProjectNo);
      return divCode ? { ...row, DivisionCode: divCode } : row;
    });
  }

  if (type === 'phd') {
    const staffByName = new Map(
      referenceStaff.map((s) => [s.Name.trim().toLowerCase(), s.Division])
    );
    return rows.map((row) => {
      if (row.DivisionCode) return row;
      const div = staffByName.get((row.SupervisorName || '').trim().toLowerCase());
      return div ? { ...row, DivisionCode: div } : row;
    });
  }

  if (type === 'contractStaff') {
    const staffByName = new Map(
      referenceStaff.map((s) => [s.Name.trim().toLowerCase(), s.Division])
    );
    const staffById = new Map(
      referenceStaff.map((s) => [s.ID.trim(), s.Division])
    );
    return rows.map((row) => {
      if (row.Division) return row;
      const attached = (row.AttachedToStaffID || '').trim();
      const divByName = staffByName.get(attached.toLowerCase());
      if (divByName) return { ...row, Division: divByName };
      const divById = staffById.get(attached);
      if (divById) return { ...row, Division: divById };
      return row;
    });
  }

  return rows;
}
```

- [ ] **Step 4.6: Verify build**

```bash
cd SuryaFD && npm run build 2>&1
```

Expected: TypeScript errors about `mustChangePassword` in AuthContext — those resolve in Task 5. No errors about the mapper or dataMigration changes.

- [ ] **Step 4.7: Commit**

```bash
git add src/utils/dataMapper.ts src/utils/dataMigration.ts
git commit -m "feat: add ContractStaff mapper, DivisionCode to ProjectStaff/PhD mappers, contractStaff file type, resolveImportDivisions auto-detection"
```

---

## Task 5: AuthContext — mustChangePassword

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 5.1: Update `AuthContextType` interface**

Add two entries to the interface at the top of the file:

```typescript
interface AuthContextType {
  user: UserAccount | null;
  isAuthenticated: boolean;
  role: Role | null;
  divisionCode: string | null;
  mustChangePassword: boolean;                          // ← add
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => Promise<void>;         // ← add
  isLoading: boolean;
  hasPermission: (allowedRoles: Role[]) => boolean;
}
```

- [ ] **Step 5.2: Update `resolveUserRole` to read `must_change_password`**

Replace the SELECT query and the setUser call in `resolveUserRole`:

```typescript
const resolveUserRole = async (authUser: SupabaseUser) => {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, division_code, must_change_password')
    .eq('user_id', authUser.id)
    .single();
  if (error || !data) {
    await supabase.auth.signOut();
    setUser(null);
    return;
  }
  setUser({
    id: authUser.id,
    email: authUser.email ?? '',
    role: data.role as Role,
    divisionCode: data.division_code ?? null,
    mustChangePassword: data.must_change_password ?? false,
  });
  await supabase
    .from('user_roles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', authUser.id);
};
```

- [ ] **Step 5.3: Update dev bypass in `login()` to set `mustChangePassword: false`**

Replace the dev bypass block:

```typescript
if (email === 'admin@dev.local' && password === 'admin123') {
  setUser({ id: 'dev-admin', email, role: 'SystemAdmin', divisionCode: null, mustChangePassword: false });
  return { success: true };
}
```

- [ ] **Step 5.4: Add `clearMustChangePassword()` function**

Add this function after `logout`:

```typescript
const clearMustChangePassword = async () => {
  if (!supabase || !user) return;
  await supabase
    .from('user_roles')
    .update({ must_change_password: false })
    .eq('user_id', user.id);
  setUser((prev) => prev ? { ...prev, mustChangePassword: false } : prev);
};
```

- [ ] **Step 5.5: Update `AuthContext.Provider` value**

Add the two new fields to the value object:

```typescript
return (
  <AuthContext.Provider value={{
    user,
    isAuthenticated: !!user,
    role: user?.role ?? null,
    divisionCode: user?.divisionCode ?? null,
    mustChangePassword: user?.mustChangePassword ?? false,
    login,
    logout,
    clearMustChangePassword,
    isLoading,
    hasPermission
  }}>
    {children}
  </AuthContext.Provider>
);
```

- [ ] **Step 5.6: Verify build**

```bash
cd SuryaFD && npm run build 2>&1
```

Expected: clean build or only errors about `contractStaff` missing from DataContext (resolved in Task 6).

- [ ] **Step 5.7: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: add mustChangePassword flag and clearMustChangePassword to AuthContext"
```

---

## Task 6: DataContext — contractStaff

**Files:**
- Modify: `src/contexts/DataContext.tsx`

- [ ] **Step 6.1: Update imports**

Add `ContractStaff` to the type import at the top, and add `mapContractStaffRow` to the mapper import:

```typescript
import type {
  DivisionInfo,
  StaffMember,
  ProjectInfo,
  ProjectStaff,
  PhDStudent,
  Equipment,
  ScientificOutput,
  IPIntelligence,
  ContractStaff,
  Role,
} from '../types';
import {
  mapDivisionRow,
  mapStaffRow,
  mapProjectRow,
  mapProjectStaffRow,
  mapPhDStudentRow,
  mapEquipmentRow,
  mapScientificOutputRow,
  mapIPIntelligenceRow,
  mapContractStaffRow,
} from '../utils/dataMapper';
```

- [ ] **Step 6.2: Add `contractStaff` to `DataContextType`**

```typescript
interface DataContextType {
  divisions: DivisionInfo[];
  staff: StaffMember[];
  projects: ProjectInfo[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  contractStaff: ContractStaff[];      // ← add
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  equipment: Equipment[];
  isLoading: boolean;
  isBackendProvisioned: boolean;
  refreshData: () => Promise<void>;
  error: string | null;
}
```

- [ ] **Step 6.3: Add `contractStaff` state + fetch in `DataProvider`**

Add state declaration after `ipIntelligence`:
```typescript
const [contractStaff, setContractStaff] = useState<ContractStaff[]>([]);
```

In the Supabase branch inside `loadData`, add to `Promise.all`:
```typescript
const [
  divRes, staffRes, projRes, psRes, phdRes, equipRes, soRes, ipRes, csRes,
] = await Promise.all([
  supabase.from('divisions').select('*'),
  supabase.from('staff').select('*'),
  supabase.from('projects').select('*'),
  supabase.from('project_staff').select('*'),
  supabase.from('phd_students').select('*'),
  supabase.from('equipment').select('*'),
  supabase.from('scientific_outputs').select('*'),
  supabase.from('ip_intelligence').select('*'),
  supabase.from('contract_staff').select('*'),    // ← add
]);
```

After the existing setters, add:
```typescript
setContractStaff(csRes.data ? csRes.data.map(mapContractStaffRow) : []);
```

In the mock fallback branch, add:
```typescript
setContractStaff([]);
```

In the error catch fallback, add:
```typescript
setContractStaff([]);
```

- [ ] **Step 6.4: Expose `contractStaff` in Provider value**

```typescript
return (
  <DataContext.Provider value={{
    divisions,
    staff,
    projects,
    projectStaff,
    phDStudents,
    contractStaff,              // ← add
    scientificOutputs,
    ipIntelligence,
    equipment,
    isLoading,
    isBackendProvisioned: provisioned,
    refreshData: loadData,
    error,
  }}>
    {children}
  </DataContext.Provider>
);
```

- [ ] **Step 6.5: Verify build**

```bash
cd SuryaFD && npm run build 2>&1
```

Expected: clean build.

- [ ] **Step 6.6: Commit**

```bash
git add src/contexts/DataContext.tsx
git commit -m "feat: add contractStaff state and fetch to DataContext"
```

---

## Task 7: App.tsx — Routes + MasterAdmin + Intercept

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 7.1: Import `ChangePassword` and update `ProtectedRoute`**

Add import at the top:
```typescript
import ChangePassword from './pages/ChangePassword';
```

Update `ProtectedRoute` to import `mustChangePassword` and intercept:
```typescript
function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const provisioned = isProvisioned();

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background text-text-muted">Loading SURYA Vault Data...</div>;
  }

  if (!provisioned && window.location.hash !== '#/login') {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Force password change before accessing any other route
  if (mustChangePassword && !window.location.hash.includes('/change-password')) {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_ROUTES[user.role]} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
```

- [ ] **Step 7.2: Add `/change-password` and `/master-admin` routes**

Inside the `<Routes>` block, add the change-password route before the protected block:
```typescript
<Route path="/change-password" element={<ChangePassword />} />
```

Inside the protected layout block, add master-admin route alongside the other role routes:
```typescript
<Route path="/master-admin" element={<ProtectedRoute allowedRoles={['MasterAdmin']}><Dashboard /></ProtectedRoute>} />
```

- [ ] **Step 7.3: Add `MasterAdmin` to restricted route allowedRoles**

Find the Recruitment and DataManagement routes and add `'MasterAdmin'`:
```typescript
<Route path="/recruitment" element={<ProtectedRoute allowedRoles={['HRAdmin', 'SystemAdmin', 'MasterAdmin']}><Recruitment /></ProtectedRoute>} />
<Route path="/data" element={<ProtectedRoute allowedRoles={['HRAdmin', 'SystemAdmin', 'MasterAdmin']}><DataManagement /></ProtectedRoute>} />
```

- [ ] **Step 7.4: Verify build**

```bash
cd SuryaFD && npm run build 2>&1
```

Expected: error about `ChangePassword` not found — that's resolved when Task 8 creates the file. Everything else should be clean.

- [ ] **Step 7.5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add /change-password route, MasterAdmin route, mustChangePassword intercept in ProtectedRoute"
```

---

## Task 8: ChangePassword Page

**Files:**
- Create: `src/pages/ChangePassword.tsx`

- [ ] **Step 8.1: Create `src/pages/ChangePassword.tsx`**

```typescript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabaseClient';
import { ROLE_ROUTES } from '../constants/roleRoutes';

export default function ChangePassword() {
  const { user, clearMustChangePassword, role } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (!supabase || !user) {
      setError('Not connected to database.');
      return;
    }

    setIsLoading(true);

    // Step 1: verify current password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      setError('Current password is incorrect.');
      setIsLoading(false);
      return;
    }

    // Step 2: update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    // Step 3: clear the must_change_password flag
    await clearMustChangePassword();

    // Step 4: navigate to role dashboard
    navigate(role ? ROLE_ROUTES[role] : '/');
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f5f4ed] overflow-hidden font-sans">

      {/* Left Panel */}
      <div className="flex-1 relative overflow-hidden bg-[#141413] p-12 flex flex-col justify-between">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#faf9f5]/5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none border border-[#faf9f5]/10" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[#c96442]/5 rounded-full translate-x-1/4 translate-y-1/4 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-6">
          <div className="text-[10px] font-semibold text-[#d97757] tracking-widest uppercase">
            Digital Sun Initiative
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4 py-20 lg:py-0">
          <div className="flex items-center gap-6">
            <h1 className="text-8xl lg:text-[10rem] font-[500] text-[#faf9f5] tracking-tight font-serif">SURYA</h1>
            <div className="text-[#d97757] animate-pulse">
              <Sun size={80} strokeWidth={3} />
            </div>
          </div>
          <p className="text-[#b0aea5] text-base max-w-md mt-4 leading-relaxed">
            Your account requires a password change before you can access the system.
            Choose a strong password you haven't used before.
          </p>
        </div>

        <div className="relative z-10 border-t border-[#faf9f5]/10 pt-8">
          <div className="text-[10px] font-semibold text-[#b0aea5] tracking-[0.4em] uppercase">
            CSIR-AMPRI — UNIFIED INSTITUTIONAL INTELLIGENCE
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="lg:w-[500px] bg-[#faf9f5] flex flex-col items-center justify-center p-8 lg:p-16 relative">
        <div className="w-full max-w-sm space-y-10">

          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-[#faf9f5] rounded-[16px] p-4 mb-6 shadow-[0px_0px_0px_1px_#f0eee6] flex items-center justify-center">
              <Lock size={36} className="text-[#c96442]" />
            </div>
            <h2 className="text-3xl font-[500] text-[#141413] tracking-tight mb-2 uppercase font-serif">
              Set New Password
            </h2>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-semibold tracking-[0.2em] text-[#87867f] uppercase">
                First Login — Password Change Required
              </span>
              <div className="h-1 w-24 bg-[#c96442] mt-2 rounded-full" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">
                Current Password
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">
                New Password
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                  placeholder="Min. 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b0aea5] hover:text-[#141413] transition-colors"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[#87867f] uppercase tracking-widest ml-1">
                Confirm New Password
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b0aea5] group-focus-within:text-[#3898ec] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-[#141413] font-medium transition-all placeholder:text-[#b0aea5]"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-[#b53333] font-bold bg-[#f5e8e8] p-4 rounded-xl border border-[#e8c8c8]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-[#c96442] hover:bg-[#b5593b] text-[#faf9f5] rounded-[8px] font-semibold text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0px_0px_0px_1px_#c96442] transition-all active:scale-[0.98] disabled:opacity-70 group"
            >
              {isLoading ? 'Updating...' : 'Set New Password'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Verify full build is clean**

```bash
cd SuryaFD && npm run build 2>&1
```

Expected: `✓ built in Xms` with no errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/pages/ChangePassword.tsx src/App.tsx
git commit -m "feat: add ChangePassword first-login wizard page"
```

---

## Task 9: Staff Mapping Tab in DataManagement

**Files:**
- Modify: `src/pages/DataManagement.tsx`

- [ ] **Step 9.1: Add tab state and imports**

At the top of `DataManagement.tsx`, add to imports:
```typescript
import { MapPin, Tags } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import type { DivisionInfo, ProjectStaff, PhDStudent, ContractStaff } from '../types';
import { supabase } from '../utils/supabaseClient';
```

Note: `useData` is already imported. Add `useAuth`, the new icons, and the types.

Inside the component, add tab state at the top alongside existing state:
```typescript
const [activeTab, setActiveTab] = useState<'import' | 'mapping'>('import');
```

Also destructure the needed data:
```typescript
const { divisions, staff, projectStaff, phDStudents, contractStaff, refreshData } = useData();
const { role } = useAuth();
```

- [ ] **Step 9.2: Add the untagged count banner helper**

Add this derived value near the top of the component body (after state declarations):
```typescript
const untaggedProjectStaff = projectStaff.filter((p) => !p.DivisionCode).length;
const untaggedPhD = phDStudents.filter((p) => !p.DivisionCode).length;
const untaggedContract = contractStaff.filter((c) => !c.Division).length;
const totalUntagged = untaggedProjectStaff + untaggedPhD + untaggedContract;
```

- [ ] **Step 9.3: Replace the page header with tab navigation**

Replace the existing page heading JSX:
```tsx
{/* Page heading */}
<div>
  <h1 className="text-2xl font-[500] text-text font-serif">Data Import</h1>
  <p className="text-text-muted mt-1">Upload and review data before committing to Supabase</p>
</div>
```

With:
```tsx
{/* Page heading + tab switcher */}
<div>
  <h1 className="text-2xl font-[500] text-text font-serif">Data Management</h1>
  <p className="text-text-muted mt-1">Import data and manage division assignments</p>
</div>

{/* Untagged banner */}
{totalUntagged > 0 && (
  <div
    className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm cursor-pointer hover:bg-amber-100 transition-colors"
    onClick={() => setActiveTab('mapping')}
  >
    <Tags size={16} className="text-amber-600 shrink-0" />
    <span className="text-amber-800 font-medium">
      {totalUntagged} record{totalUntagged !== 1 ? 's' : ''} have no division assigned
      ({untaggedProjectStaff} project staff, {untaggedPhD} PhD students, {untaggedContract} contract staff).
    </span>
    <span className="ml-auto text-amber-600 font-semibold text-xs uppercase tracking-wide">Fix →</span>
  </div>
)}

{/* Tab bar */}
<div className="flex gap-1 border-b border-border">
  <button
    onClick={() => setActiveTab('import')}
    className={clsx(
      'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
      activeTab === 'import'
        ? 'border-[#c96442] text-[#c96442]'
        : 'border-transparent text-text-muted hover:text-text',
    )}
  >
    Data Import
  </button>
  <button
    onClick={() => setActiveTab('mapping')}
    className={clsx(
      'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
      activeTab === 'mapping'
        ? 'border-[#c96442] text-[#c96442]'
        : 'border-transparent text-text-muted hover:text-text',
    )}
  >
    <MapPin size={14} />
    Staff Mapping
    {totalUntagged > 0 && (
      <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
        {totalUntagged > 9 ? '9+' : totalUntagged}
      </span>
    )}
  </button>
</div>
```

- [ ] **Step 9.4: Wrap existing import Card in `{activeTab === 'import' && ...}`**

Wrap the entire `<Card>` block (from `<Card>` to `</Card>`, which currently contains the step indicator + all 3 steps) so it only renders when the import tab is active:

```tsx
{activeTab === 'import' && (
  <Card>
    {/* ... all existing import wizard content unchanged ... */}
  </Card>
)}
```

- [ ] **Step 9.5: Add the Staff Mapping tab panel**

After the import Card wrapper, add the mapping panel:

```tsx
{activeTab === 'mapping' && (
  <StaffMappingPanel
    divisions={divisions}
    staff={staff}
    projectStaff={projectStaff}
    phDStudents={phDStudents}
    contractStaff={contractStaff}
    onSaved={refreshData}
  />
)}
```

- [ ] **Step 9.6: Create `StaffMappingPanel` component in the same file**

Add this component **above** `DataManagement` (before `export default function DataManagement()`):

```tsx
// ─────────────────────────────────────────────────────────────────────────────
// StaffMappingPanel
// ─────────────────────────────────────────────────────────────────────────────

type MappingSubTab = 'projectStaff' | 'phd' | 'contract';

interface StaffMappingPanelProps {
  divisions: DivisionInfo[];
  staff: import('../types').StaffMember[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  contractStaff: ContractStaff[];
  onSaved: () => Promise<void>;
}

function StaffMappingPanel({
  divisions,
  staff,
  projectStaff,
  phDStudents,
  contractStaff,
  onSaved,
}: StaffMappingPanelProps) {
  const [subTab, setSubTab] = useState<MappingSubTab>('projectStaff');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftDivision, setDraftDivision] = useState('');
  const [draftAttached, setDraftAttached] = useState('');

  const openRow = (id: string, currentDivision: string, currentAttached: string) => {
    setExpandedId(id);
    setDraftDivision(currentDivision);
    setDraftAttached(currentAttached);
  };

  const closeRow = () => {
    setExpandedId(null);
    setDraftDivision('');
    setDraftAttached('');
  };

  const saveProjectStaff = async (id: string) => {
    if (!supabase) return;
    setSavingId(id);
    await supabase
      .from('project_staff')
      .update({ DivisionCode: draftDivision, PIName: draftAttached })
      .eq('id', id);
    await onSaved();
    setSavingId(null);
    closeRow();
  };

  const savePhD = async (enrollmentNo: string) => {
    if (!supabase) return;
    setSavingId(enrollmentNo);
    await supabase
      .from('phd_students')
      .update({ DivisionCode: draftDivision, SupervisorName: draftAttached })
      .eq('EnrollmentNo', enrollmentNo);
    await onSaved();
    setSavingId(null);
    closeRow();
  };

  const saveContract = async (id: string) => {
    if (!supabase) return;
    setSavingId(id);
    await supabase
      .from('contract_staff')
      .update({ Division: draftDivision, AttachedToStaffID: draftAttached })
      .eq('id', id);
    await onSaved();
    setSavingId(null);
    closeRow();
  };

  const SUB_TABS: { key: MappingSubTab; label: string; count: number }[] = [
    { key: 'projectStaff', label: 'Project Staff', count: projectStaff.filter((p) => !p.DivisionCode).length },
    { key: 'phd',          label: 'PhD Students',  count: phDStudents.filter((p) => !p.DivisionCode).length },
    { key: 'contract',     label: 'Contract Staff', count: contractStaff.filter((c) => !c.Division).length },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-2">
        {SUB_TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
              subTab === key
                ? 'bg-[#c96442] text-white'
                : 'bg-surface-hover text-text-muted hover:text-text',
            )}
          >
            {label}
            {count > 0 && (
              <span className={clsx(
                'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center',
                subTab === key ? 'bg-white/30 text-white' : 'bg-amber-500 text-white',
              )}>
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Project Staff sub-tab */}
      {subTab === 'projectStaff' && (
        <Card>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-hover border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Designation</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Project</th>
                  <th className="px-4 py-3 font-medium text-text-muted">PI</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Division</th>
                  <th className="px-4 py-3 font-medium text-text-muted w-20"></th>
                </tr>
              </thead>
              <tbody>
                {projectStaff.map((ps) => (
                  <React.Fragment key={ps.id}>
                    <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                      <td className="px-4 py-3 font-medium text-text">{ps.StaffName}</td>
                      <td className="px-4 py-3 text-text-muted">{ps.Designation}</td>
                      <td className="px-4 py-3 text-text-muted">{ps.ProjectNo}</td>
                      <td className="px-4 py-3 text-text-muted">{ps.PIName || '—'}</td>
                      <td className="px-4 py-3">
                        {ps.DivisionCode ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {ps.DivisionCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Untagged
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => expandedId === ps.id ? closeRow() : openRow(ps.id, ps.DivisionCode || '', ps.PIName || '')}
                          className="text-xs font-medium text-[#c96442] hover:underline"
                        >
                          {expandedId === ps.id ? 'Cancel' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === ps.id && (
                      <tr className="border-b border-border bg-[#faf9f5]">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>
                              <select
                                value={draftDivision}
                                onChange={(e) => setDraftDivision(e.target.value)}
                                className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]"
                              >
                                <option value="">— Select Division —</option>
                                {divisions.map((d) => (
                                  <option key={d.divCode} value={d.divCode}>
                                    {d.divCode} — {d.divName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">PI Name</label>
                              <select
                                value={draftAttached}
                                onChange={(e) => setDraftAttached(e.target.value)}
                                className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]"
                              >
                                <option value="">— Select PI —</option>
                                {staff.map((s) => (
                                  <option key={s.ID} value={s.Name}>
                                    {s.Name} ({s.Designation})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => saveProjectStaff(ps.id)}
                              disabled={savingId === ps.id}
                              className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                            >
                              {savingId === ps.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* PhD Students sub-tab */}
      {subTab === 'phd' && (
        <Card>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-hover border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-text-muted">Student</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Specialization</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Supervisor</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Division</th>
                  <th className="px-4 py-3 font-medium text-text-muted w-20"></th>
                </tr>
              </thead>
              <tbody>
                {phDStudents.map((phd) => (
                  <React.Fragment key={phd.EnrollmentNo}>
                    <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                      <td className="px-4 py-3 font-medium text-text">{phd.StudentName}</td>
                      <td className="px-4 py-3 text-text-muted">{phd.Specialization}</td>
                      <td className="px-4 py-3 text-text-muted">{phd.SupervisorName || '—'}</td>
                      <td className="px-4 py-3">
                        {phd.DivisionCode ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {phd.DivisionCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Untagged
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => expandedId === phd.EnrollmentNo ? closeRow() : openRow(phd.EnrollmentNo, phd.DivisionCode || '', phd.SupervisorName || '')}
                          className="text-xs font-medium text-[#c96442] hover:underline"
                        >
                          {expandedId === phd.EnrollmentNo ? 'Cancel' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === phd.EnrollmentNo && (
                      <tr className="border-b border-border bg-[#faf9f5]">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>
                              <select
                                value={draftDivision}
                                onChange={(e) => setDraftDivision(e.target.value)}
                                className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]"
                              >
                                <option value="">— Select Division —</option>
                                {divisions.map((d) => (
                                  <option key={d.divCode} value={d.divCode}>
                                    {d.divCode} — {d.divName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Supervisor</label>
                              <select
                                value={draftAttached}
                                onChange={(e) => setDraftAttached(e.target.value)}
                                className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]"
                              >
                                <option value="">— Select Supervisor —</option>
                                {staff.map((s) => (
                                  <option key={s.ID} value={s.Name}>
                                    {s.Name} ({s.Designation})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => savePhD(phd.EnrollmentNo)}
                              disabled={savingId === phd.EnrollmentNo}
                              className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                            >
                              {savingId === phd.EnrollmentNo ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Contract Staff sub-tab */}
      {subTab === 'contract' && (
        <Card>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-hover border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Designation</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Lab Code</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Attached To</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Division</th>
                  <th className="px-4 py-3 font-medium text-text-muted w-20"></th>
                </tr>
              </thead>
              <tbody>
                {contractStaff.map((cs) => (
                  <React.Fragment key={cs.id}>
                    <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                      <td className="px-4 py-3 font-medium text-text">{cs.Name}</td>
                      <td className="px-4 py-3 text-text-muted">{cs.Designation}</td>
                      <td className="px-4 py-3 text-text-muted">{cs.LabCode}</td>
                      <td className="px-4 py-3 text-text-muted">{cs.AttachedToStaffID || '—'}</td>
                      <td className="px-4 py-3">
                        {cs.Division ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {cs.Division}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Untagged
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => expandedId === cs.id ? closeRow() : openRow(cs.id, cs.Division || '', cs.AttachedToStaffID || '')}
                          className="text-xs font-medium text-[#c96442] hover:underline"
                        >
                          {expandedId === cs.id ? 'Cancel' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === cs.id && (
                      <tr className="border-b border-border bg-[#faf9f5]">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>
                              <select
                                value={draftDivision}
                                onChange={(e) => setDraftDivision(e.target.value)}
                                className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]"
                              >
                                <option value="">— Select Division —</option>
                                {divisions.map((d) => (
                                  <option key={d.divCode} value={d.divCode}>
                                    {d.divCode} — {d.divName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Attached To (Staff)</label>
                              <select
                                value={draftAttached}
                                onChange={(e) => setDraftAttached(e.target.value)}
                                className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]"
                              >
                                <option value="">— Select Staff Member —</option>
                                {staff.map((s) => (
                                  <option key={s.ID} value={s.ID}>
                                    {s.Name} ({s.Designation})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => saveContract(cs.id)}
                              disabled={savingId === cs.id}
                              className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                            >
                              {savingId === cs.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {contractStaff.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-sm">
                      No contract staff records yet. Import them via the Data Import tab.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 9.7: Add `React` import to DataManagement (needed for `React.Fragment`)**

At the top of `DataManagement.tsx`, ensure React is imported:
```typescript
import React, { useState, useRef } from 'react';
```

- [ ] **Step 9.8: Verify full build is clean**

```bash
cd SuryaFD && npm run build 2>&1
```

Expected: `✓ built in Xms` with zero errors.

- [ ] **Step 9.9: Commit**

```bash
git add src/pages/DataManagement.tsx
git commit -m "feat: add Staff Mapping tab to DataManagement with division tagging for project staff, PhD students, and contract staff"
```

---

## Self-Review Checklist

- [x] **migration_v2.sql** — covers constraint expansion, must_change_password, DivisionCode columns, contract_staff table, password reset, vivek.khare fix ✓
- [x] **MasterAdmin in types + routes** — Task 2 + Task 3 ✓
- [x] **mustChangePassword on UserAccount** — Task 2 + Task 5 ✓
- [x] **clearMustChangePassword()** — Task 5 ✓
- [x] **ProtectedRoute intercept** — Task 7 ✓
- [x] **ChangePassword page** — Task 8 ✓
- [x] **ContractStaff type + mapper + DataContext** — Task 4 + Task 6 ✓
- [x] **resolveImportDivisions auto-detection** — Task 4.5 ✓
- [x] **contractStaff in FileType/SCHEMA_MAPS/ALLOWED_COLUMNS/TABLE_NAMES** — Task 4.4 ✓
- [x] **Staff Mapping tab UI** — Task 9 ✓
- [x] **Untagged count banner** — Task 9.3 ✓
- [x] **MasterAdmin added to Recruitment + DataManagement allowedRoles** — Task 7.3 ✓
- [x] **Type names consistent across tasks** — `ContractStaff`, `MappingSubTab`, `mapContractStaffRow`, `resolveImportDivisions`, `clearMustChangePassword` used consistently ✓

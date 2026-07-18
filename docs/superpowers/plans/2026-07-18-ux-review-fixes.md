# UX Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the anon RPC write hole, make the helpdesk create→view flow coherent, surface user-directory load errors, add local test auth users, preserve deep links through login, and fix a11y labels — the ordered findings of the 2026-07-18 UX drive.

**Architecture:** One new append-only Supabase migration locks `EXECUTE` on all public functions to `authenticated`/`service_role` (root-cause fix for the anon write). Frontend fixes are small surgical edits: two new pure helper modules (ticket validation, post-login path) with vitest coverage, plus error-state plumbing in the existing hook/tab. A dev-only mock SQL file seeds password-login test users for local QA.

**Tech Stack:** React 19 + TS 5.9 strict (`verbatimModuleSyntax` — `import type` for types), Vite 8, React Router 7 (HashRouter), Supabase CLI (`supabase db push`), vitest + @testing-library/react.

## Global Constraints

- Never edit shipped files in `supabase/migrations/` — new timestamped files only (after `20260718000001`).
- Apply schema only via `supabase db push`. Never paste SQL into the Dashboard SQL Editor.
- `supabase/mock/` is dev-only fixture data — NEVER applied to prod.
- Pages consume data via `useData()` only; semantic Tailwind tokens only (`text-text-muted`, `bg-surface`, `border-border` — no raw colors).
- Health gate before every commit: `npx tsc --noEmit && npx eslint src/ && npm test -- --run` all green.
- Tests colocate next to source as `<name>.test.ts`.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Background (from the UX drive — why each task exists)

1. **CRITICAL:** With no session (anon key only), `supabase.rpc('helpdesk_create_ticket', …)` succeeded and inserted ticket `2a47b1cb-c300-4bfd-8271-bb257a73ee53` into the hosted DB. Cause: the function is `SECURITY DEFINER` and Postgres default-grants `EXECUTE` to `PUBLIC`. All other SECURITY DEFINER RPCs (`pms_*`, `helpdesk_*`, `admin_*`) share this exposure. The read-scoping migration `20260718000001_rls_scope_reads.sql` exists but is not yet pushed.
2. The ticket success screen shows the raw UUID and "View Ticket" can land on "Ticket not found." The RPC already generates human token `AMPRI-YYMMDD-XXX` (migration `20260712000005`, line 473) — UI never shows it.
3. `useUserDirectory` swallows RPC errors (`const { data } = await supabase.rpc('user_directory')`) → misleading "No users" empty state. `ManageUsersTab` toasts the error but still renders the same misleading empty state after the toast fades.
4. No seeded auth users with known passwords → role dashboards, PMS flows, Feature Controls (MasterAdmin-only) are undrivable in QA. Dev bypass is SystemAdmin-only.
5. Pre-auth deep link (`#/helpdesk/new`) is lost at login; user lands on role dashboard.
6. Icon-only buttons (sidebar collapse/close, mobile menu, role switcher) have no accessible names.

---

### Task 1: Lock RPC EXECUTE to authenticated + push read scoping

**Files:**
- Create: `supabase/migrations/20260718000002_lock_rpc_execute.sql`
- Create: `supabase/ops/cleanup_qa_ticket_20260718.sql`

**Interfaces:**
- Consumes: nothing (schema-level).
- Produces: anon can no longer execute any `public.*` function. All app RPC calls made with a real session keep working (`authenticated` granted). Later tasks assume this is pushed.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260718000002_lock_rpc_execute.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000002_lock_rpc_execute
-- Postgres default-grants EXECUTE on functions to PUBLIC. Combined with
-- SECURITY DEFINER RPCs (helpdesk_create_ticket, pms_*, admin_*), this let
-- an UNAUTHENTICATED client (anon key only) insert rows — confirmed live
-- during the 2026-07-18 UX drive. Lock every public function to
-- authenticated + service_role, and make that the default for future
-- functions too.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Future functions created by migrations (run as postgres) inherit the lock.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
```

- [ ] **Step 2: Write the stray-ticket cleanup ops file**

Create `supabase/ops/cleanup_qa_ticket_20260718.sql`:

```sql
-- One-off data cleanup: ticket inserted by the 2026-07-18 UX drive through
-- the pre-lock anon RPC hole. Data-only (no schema) — run via psql against
-- the linked project (connection string: Dashboard → Settings → Database).
DELETE FROM public.ticket_events
 WHERE ticket_id = '2a47b1cb-c300-4bfd-8271-bb257a73ee53';
DELETE FROM public.tickets
 WHERE id = '2a47b1cb-c300-4bfd-8271-bb257a73ee53';
```

- [ ] **Step 3: Push migrations (applies 20260718000001 read scoping + this lock)**

Run: `supabase db push`
Expected: both `20260718000001_rls_scope_reads` and `20260718000002_lock_rpc_execute` listed as applied, no errors.

- [ ] **Step 4: Verify anon is locked out**

Run (values from `.env` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/helpdesk_create_ticket" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_subject":"probe","p_category":"Infrastructure","p_urgency":"Low","p_description":"probe","p_submitted_by":"probe"}'
```

Expected: `401` or `403` (permission denied for function). NOT `200`.

- [ ] **Step 5: Run the cleanup against the linked DB**

Run: `psql "<connection-string-from-dashboard-settings>" -f supabase/ops/cleanup_qa_ticket_20260718.sql`
Expected: `DELETE 1` (or `DELETE 2` for events) then `DELETE 1`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718000002_lock_rpc_execute.sql supabase/ops/cleanup_qa_ticket_20260718.sql
git commit -m "fix(security): revoke anon EXECUTE on all public functions

Anon client could call SECURITY DEFINER RPCs (confirmed: created a
helpdesk ticket with no session). Lock EXECUTE to authenticated +
service_role, set default privileges for future functions, push the
pending read-scoping migration, clean up the stray QA ticket.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Helpdesk ticket — human token on success + per-field validation

**Files:**
- Create: `src/lib/helpdesk/ticketValidation.ts`
- Test: `src/lib/helpdesk/ticketValidation.test.ts`
- Modify: `src/lib/helpdesk/ticketRPCs.ts:39-52` (`createTicket`)
- Modify: `src/pages/helpdesk/TicketForm.tsx` (submit handler ~line 63, success card ~line 106, field markup)

**Interfaces:**
- Consumes: `helpdesk_create_ticket` RPC (returns uuid); `tickets.token` column.
- Produces: `missingTicketFields(draft: TicketDraft): TicketField[]` where `type TicketField = 'category' | 'subject' | 'description'`; `createTicket` result `data` becomes `{ ticketId: string; token: string | null }`.

- [ ] **Step 1: Write the failing validation test**

Create `src/lib/helpdesk/ticketValidation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { missingTicketFields } from './ticketValidation';

describe('missingTicketFields', () => {
  it('returns all fields for an empty draft', () => {
    expect(missingTicketFields({ category: null, subject: '', description: '' }))
      .toEqual(['category', 'subject', 'description']);
  });

  it('treats whitespace-only text as missing', () => {
    expect(missingTicketFields({ category: 'Infrastructure', subject: '   ', description: '\n\t' }))
      .toEqual(['subject', 'description']);
  });

  it('returns empty array for a complete draft', () => {
    expect(missingTicketFields({ category: 'Finance', subject: 'AC broken', description: 'Room 201 AC leaking' }))
      .toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/helpdesk/ticketValidation.test.ts`
Expected: FAIL — cannot resolve `./ticketValidation`.

- [ ] **Step 3: Implement the validator**

Create `src/lib/helpdesk/ticketValidation.ts`:

```typescript
export interface TicketDraft {
  category: string | null;
  subject: string;
  description: string;
}

export type TicketField = 'category' | 'subject' | 'description';

export function missingTicketFields(d: TicketDraft): TicketField[] {
  const missing: TicketField[] = [];
  if (!d.category) missing.push('category');
  if (!d.subject.trim()) missing.push('subject');
  if (!d.description.trim()) missing.push('description');
  return missing;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/helpdesk/ticketValidation.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Return the human token from `createTicket`**

In `src/lib/helpdesk/ticketRPCs.ts`, replace the body of `createTicket` (lines 39-52) with:

```typescript
export async function createTicket(params: CreateTicketParams): Promise<RpcResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('helpdesk_create_ticket', {
    p_subject: params.subject,
    p_category: params.category,
    p_urgency: params.urgency,
    p_description: params.description,
    p_submitted_by: params.submitted_by,
  });

  if (error) return { success: false, error: error.message };

  // RPC returns only the uuid; the human token (AMPRI-YYMMDD-XXX) lives on
  // the row. tickets_select is USING(true) for authenticated, so this read
  // always succeeds for a caller who could create.
  const { data: row } = await supabase
    .from('tickets')
    .select('token')
    .eq('id', data as string)
    .single();

  return { success: true, data: { ticketId: data as string, token: row?.token ?? null } };
}
```

- [ ] **Step 6: Wire per-field errors + token display into `TicketForm.tsx`**

In `src/pages/helpdesk/TicketForm.tsx`:

a. Add import: `import { missingTicketFields, type TicketField } from '../../lib/helpdesk/ticketValidation';`

b. Change success state to carry the token. Find `setSuccess({ ticketId, handlerName: … })` (~line 88) and the `success` state declaration; update the state type to `{ ticketId: string; token: string | null; handlerName: string | null }` and the setter to:

```typescript
const { ticketId, token } = result.data as { ticketId: string; token: string | null };
setSuccess({ ticketId, token, handlerName: routingPreview?.handlerName ?? null });
```

c. Add field-error state next to the existing `error` state:

```typescript
const [fieldErrors, setFieldErrors] = useState<TicketField[]>([]);
```

d. Replace the top of `handleSubmit` (lines 64-67):

```typescript
const missing = missingTicketFields({ category, subject, description });
setFieldErrors(missing);
if (missing.length > 0) {
  setError('Please complete the highlighted fields.');
  return;
}
```

Clear stale highlights on success path: add `setFieldErrors([]);` next to `setError(null);` before submitting.

e. Highlight the fields. On the category section wrapper, subject `<input>`, and description `<textarea>`, add conditional classes and inline messages:

```tsx
// subject input — append to its className:
{fieldErrors.includes('subject') ? ' border-danger' : ''}
// directly under the subject input:
{fieldErrors.includes('subject') && (
  <p className="text-xs text-danger mt-1">Subject is required.</p>
)}
// description textarea — same pattern with 'description', message "Description is required."
// under the category button grid:
{fieldErrors.includes('category') && (
  <p className="text-xs text-danger mt-1">Pick a category.</p>
)}
```

f. Success card (~line 109): replace `<span className="font-mono text-lg text-text-muted">{success.ticketId}</span>` with:

```tsx
<span className="font-mono text-lg text-text">{success.token ?? success.ticketId}</span>
<p className="text-xs text-text-muted">Quote this ticket number in any follow-up.</p>
```

(The "View Ticket" button keeps navigating by `success.ticketId` — routes are uuid-keyed.)

- [ ] **Step 7: Verify in the running app**

Health first: `npx tsc --noEmit && npx eslint src/`
Then drive (dev server + a real test login from Task 5, or dev bypass for the validation-only part): submit empty form → each missing field highlighted with its own message; complete form as an authenticated user → success card shows `AMPRI-…` token and "View Ticket" opens the detail page.

- [ ] **Step 8: Commit**

```bash
git add src/lib/helpdesk/ticketValidation.ts src/lib/helpdesk/ticketValidation.test.ts src/lib/helpdesk/ticketRPCs.ts src/pages/helpdesk/TicketForm.tsx
git commit -m "feat(helpdesk): human ticket number on success, per-field validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Surface user-directory load errors

**Files:**
- Modify: `src/hooks/useUserDirectory.ts`
- Modify: `src/components/admin/ManageUsersTab.tsx` (load fn lines 40-65, empty-state render)

**Interfaces:**
- Consumes: `user_directory` / `admin_list_users` RPCs; `EmptyState` (`variant?: 'empty' | 'error'` — already shipped).
- Produces: `useUserDirectory()` now returns `{ users, loading, error: string | null }` (additive — existing consumers unaffected).

- [ ] **Step 1: Expose the error from `useUserDirectory`**

In `src/hooks/useUserDirectory.ts`, add error state and stop swallowing the RPC failure. Replace lines 18-44 body accordingly:

```typescript
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      // user_roles has no broad-select RLS policy (by design — see
      // 20260712000002_auth_rbac.sql); user_directory() RPC is the
      // sanctioned way for any authenticated caller to resolve identities.
      const { data, error: rpcError } = await supabase.rpc('user_directory');
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setUsers([]);
        setLoading(false);
        return;
      }
      setError(null);
      const staffByEmail = new Map(staff.map(s => [(s.Email || '').toLowerCase(), s.Name]));
      const rows: DirectoryUser[] = ((data as { user_id: string; email: string | null; roles: Role[] | null }[]) ?? []).map(p => ({
        userId: p.user_id,
        email: p.email,
        name: p.email ? staffByEmail.get(p.email.toLowerCase()) ?? null : null,
        roles: p.roles ?? [],
      }));
      setUsers(rows);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [staff]);

  return { users, loading, error };
```

- [ ] **Step 2: Persistent error state in `ManageUsersTab`**

In `src/components/admin/ManageUsersTab.tsx`:

a. Add state next to `loading`: `const [loadError, setLoadError] = useState<string | null>(null);`

b. In `load()` (lines 46-52), record the error alongside the existing toast:

```typescript
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) {
      push(error.message, 'error');
      setLoadError(error.message);
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoadError(null);
```

c. In the render, before the existing "no users" `EmptyState`, add an error branch (match the file's existing `EmptyState` usage — icon `ShieldQuestion` is already imported):

```tsx
if (loadError) {
  return (
    <EmptyState
      variant="error"
      icon={ShieldQuestion}
      title="Couldn't load users"
      description={loadError}
      action={<button onClick={() => void load()} className="text-sm text-brand-blue hover:underline">Retry</button>}
    />
  );
}
```

(Adjust the `action` prop shape to whatever `EmptyState` expects — check its props; if `action` takes `{label, onClick}`, use that form.)

d. Fix the misleading filtered copy. Find the empty `EmptyState` (currently "No users" / "No registered users match.") and make it search-aware:

```tsx
title="No users"
description={search.trim() ? 'No registered users match your search.' : 'No registered users yet.'}
```

- [ ] **Step 3: Health + verify**

Run: `npx tsc --noEmit && npx eslint src/ && npm test -- --run`
Expected: green.
Drive: as dev-bypass (anon → RPC now returns permission error after Task 1), open `#/admin/access-requests` → Manage Users tab shows the red error EmptyState with Retry, not "No users match".

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUserDirectory.ts src/components/admin/ManageUsersTab.tsx
git commit -m "fix(admin): surface user-directory load errors instead of silent empty state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Preserve deep link through login

**Files:**
- Create: `src/lib/auth/postLogin.ts`
- Test: `src/lib/auth/postLogin.test.ts`
- Modify: `src/App.tsx:102-104` (ProtectedRoute unauthenticated branch)
- Modify: `src/pages/Login.tsx:129-134` (post-auth navigate effect)

**Interfaces:**
- Consumes: React Router location state (`Navigate` `state` prop, `useLocation`).
- Produces: `resolvePostLoginPath(from: unknown, fallback: string): string` — returns the stored path when it is a valid in-app hash path, else the role-dashboard fallback.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/postLogin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolvePostLoginPath } from './postLogin';

describe('resolvePostLoginPath', () => {
  it('returns the stored path for a valid deep link', () => {
    expect(resolvePostLoginPath('#/helpdesk/new', '/system-admin')).toBe('/helpdesk/new');
  });

  it('falls back when from is missing or not a string', () => {
    expect(resolvePostLoginPath(undefined, '/scientist')).toBe('/scientist');
    expect(resolvePostLoginPath({ evil: true }, '/scientist')).toBe('/scientist');
  });

  it('falls back for login/root/malformed targets', () => {
    expect(resolvePostLoginPath('#/login', '/hod')).toBe('/hod');
    expect(resolvePostLoginPath('#/', '/hod')).toBe('/hod');
    expect(resolvePostLoginPath('https://evil.example/#/x', '/hod')).toBe('/hod');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/auth/postLogin.test.ts`
Expected: FAIL — cannot resolve `./postLogin`.

- [ ] **Step 3: Implement**

Create `src/lib/auth/postLogin.ts`:

```typescript
/** Resolve where to land after login: the pre-auth deep link if sane,
 * else the role dashboard. `from` is untrusted router state. */
export function resolvePostLoginPath(from: unknown, fallback: string): string {
  if (typeof from !== 'string') return fallback;
  if (!from.startsWith('#/')) return fallback;
  const path = from.slice(1); // '#/helpdesk/new' -> '/helpdesk/new'
  if (path === '/' || path.startsWith('/login')) return fallback;
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/auth/postLogin.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Thread it through ProtectedRoute and Login**

In `src/App.tsx`, the unauthenticated branch (lines 102-104) becomes:

```tsx
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.hash }} />;
  }
```

In `src/pages/Login.tsx`:

a. Imports: add `useLocation` to the existing `react-router-dom` import; add `import { resolvePostLoginPath } from '../lib/auth/postLogin';`

b. Inside the component, next to `const navigate = useNavigate();`: `const location = useLocation();`

c. Replace the post-auth effect (lines 130-134):

```tsx
  useEffect(() => {
    if (isAuthenticated && role) {
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(resolvePostLoginPath(from, ROLE_ROUTES[role]));
    }
  }, [isAuthenticated, role, navigate, location.state]);
```

(If the target route is role-gated beyond the user, the existing ProtectedRoute bounce to the role dashboard still applies — no dead end.)

- [ ] **Step 6: Health + verify**

Run: `npx tsc --noEmit && npx eslint src/ && npm test -- --run`
Drive: logged out, open `#/helpdesk/new` → login screen → sign in → land on `#/helpdesk/new`, not the dashboard.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/postLogin.ts src/lib/auth/postLogin.test.ts src/App.tsx src/pages/Login.tsx
git commit -m "feat(auth): preserve pre-login deep link through the login wall

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Local test auth users + MasterAdmin coverage for dev bypass

**Files:**
- Create: `supabase/mock/17_test_auth_users.sql`
- Modify: `src/contexts/AuthContext.tsx:112-121` (dev bypass roles)

**Interfaces:**
- Consumes: `auth.users` insert trigger (auto-creates `DefaultUser` in `user_roles` + `user_profiles` row — see baseline `20260712000002_auth_rbac.sql`).
- Produces: local logins `director@test.local`, `hod@test.local`, `scientist@test.local`, `hradmin@test.local`, `master@test.local`, `committee@test.local` — all password `Test@1234`. Dev bypass gains a MasterAdmin role for role-switcher coverage.

- [ ] **Step 1: Write the mock seed**

Create `supabase/mock/17_test_auth_users.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- 17_test_auth_users — LOCAL DEV ONLY. NEVER APPLY TO PROD.
-- Password-login QA accounts for every role tier the UX drive needs.
-- All passwords: Test@1234
-- Runs after schema + trigger (auto-creates DefaultUser rows we replace).
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    t record;
    v_id uuid;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('director@test.local',  'Director',           NULL),
        ('hod@test.local',       'HOD',                'ARC'),
        ('scientist@test.local', 'Scientist',          'ARC'),
        ('hradmin@test.local',   'HRAdmin',            NULL),
        ('master@test.local',    'MasterAdmin',        NULL),
        ('committee@test.local', 'EmpoweredCommittee', NULL)
    ) AS x(email, app_role, div)
    LOOP
        SELECT id INTO v_id FROM auth.users WHERE email = t.email;
        IF v_id IS NULL THEN
            v_id := gen_random_uuid();
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at, confirmation_token, recovery_token,
                email_change_token_new, email_change
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_id,
                'authenticated', 'authenticated', t.email,
                crypt('Test@1234', gen_salt('bf')),
                now(), '{"provider":"email","providers":["email"]}', '{}',
                now(), now(), '', '', '', ''
            );
            INSERT INTO auth.identities (
                id, user_id, provider_id, identity_data, provider,
                created_at, updated_at, last_sign_in_at
            ) VALUES (
                gen_random_uuid(), v_id, v_id::text,
                jsonb_build_object('sub', v_id::text, 'email', t.email),
                'email', now(), now(), now()
            );
        END IF;

        -- Replace the trigger-created DefaultUser role with the real one.
        DELETE FROM public.user_roles WHERE user_id = v_id;
        INSERT INTO public.user_roles (user_id, role, division_code)
        VALUES (v_id, t.app_role, t.div)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;

        INSERT INTO public.user_profiles (user_id, email, active_role, must_change_password)
        VALUES (v_id, t.email, t.app_role, false)
        ON CONFLICT (user_id) DO UPDATE
            SET active_role = EXCLUDED.active_role,
                email = EXCLUDED.email,
                must_change_password = false;
    END LOOP;
END $$;
```

Note for the implementer: check `user_profiles` column names in `supabase/migrations/20260712000002_auth_rbac.sql` before running — if `active_role` has a different name or `user_roles` lacks `division_code`, match the real schema.

- [ ] **Step 2: Apply locally and verify login**

Run: `supabase db reset` (rebuilds local DB: migrations → seed → mock).
Then start the app against the LOCAL supabase (`.env` pointing at `supabase status` URL/anon key) and sign in as `master@test.local` / `Test@1234`.
Expected: lands on MasterAdmin dashboard; `#/admin/features` (Feature Controls) opens instead of bouncing.

- [ ] **Step 3: Give dev bypass a second role for switcher coverage**

In `src/contexts/AuthContext.tsx` (lines 112-121), change the bypass user:

```typescript
    if (import.meta.env.DEV && email === 'admin@dev.local' && password === 'admin123') {
      setUser({
        id: 'dev-admin',
        email,
        roles: ['SystemAdmin', 'MasterAdmin'],
        activeRole: 'SystemAdmin',
        divisionCode: null,
        mustChangePassword: false,
      });
      return { success: true };
    }
```

(Bypass stays UI-smoke-only — it has no real session, so post-Task-1 every backend call correctly fails. Real QA uses the seeded logins above.)

- [ ] **Step 4: Health + commit**

Run: `npx tsc --noEmit && npx eslint src/ && npm test -- --run`

```bash
git add supabase/mock/17_test_auth_users.sql src/contexts/AuthContext.tsx
git commit -m "feat(dev): seeded test auth users per role, MasterAdmin in dev bypass

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Accessible names for icon-only buttons

**Files:**
- Modify: `src/components/layout/Layout.tsx:54-59` (mobile menu), `:82-88` (role switcher)
- Modify: `src/components/layout/Sidebar.tsx:113-115` (collapse), `:118-120` (mobile close)

**Interfaces:**
- Consumes/Produces: none — attribute-only changes.

- [ ] **Step 1: Add aria-labels**

`Layout.tsx` mobile menu button (line 54): add `aria-label="Open menu"`.
`Layout.tsx` role switcher button (line 82): add `aria-label="Switch role"`.
`Sidebar.tsx` collapse button (line 113): add `aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}`.
`Sidebar.tsx` mobile close button (line 118): add `aria-label="Close menu"`.

(Settings/Logout buttons at Sidebar 168/176 render visible text when expanded and already carry `title` when collapsed — leave them.)

- [ ] **Step 2: Health + verify**

Run: `npx tsc --noEmit && npx eslint src/`
Drive: read the page accessibility tree — previously bare `button` entries now read "Open menu", "Switch role", "Collapse sidebar".

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Layout.tsx src/components/layout/Sidebar.tsx
git commit -m "fix(a11y): accessible names for icon-only layout buttons

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Deliberately out of scope (from the findings, with reasons)

- **"Backend health" card asserting health while reads fail** — root cause is the sessionless dev bypass; Task 5's real test logins remove the condition. Revisit only if it reproduces with a real session.
- **404 screen for unknown routes** — current silent redirect to dashboard is a designed, non-crashing state; a dedicated 404 is polish with no confusion once role-bounce messaging isn't compounding it.
- **Denied-route "no access" notice** — worth doing eventually (toast on role bounce in ProtectedRoute), but it changes guard UX for every role; propose separately.

## Execution order

Task 1 first (security, unblocks correct error behavior everywhere). Task 5 second (unblocks real-session verification of Tasks 2-4). Then 2, 3, 4, 6 in any order.

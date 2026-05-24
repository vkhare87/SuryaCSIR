# Access Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let first-time (`DefaultUser`) accounts request roles+division+justification, and let SystemAdmin/MasterAdmin review a queue (with staff auto-match) and grant a chosen subset via SECURITY DEFINER RPCs.

**Architecture:** New RLS-enabled `access_requests` table + two grant/reject RPCs (new migration). `PendingAccessView` becomes a request form/status screen; a new `/admin/access-requests` page is the review queue. All role grants go through the RPC — no client `user_roles` writes.

**Tech Stack:** React 19 + TS, Supabase (PostgREST + RPC), Tailwind 4 tokens, vitest. Migration applied by the user (CLI/SQL editor).

---

## File Structure

- `supabase/migrations/<TS>_access_requests.sql` (new) — table, RLS, `approve_access_request`, `reject_access_request`.
- `src/lib/access/requestableRoles.ts` (new) — allow-list constant + helper.
- `src/lib/access/requestableRoles.test.ts` (new).
- `src/types/index.ts` (modify) — add `AccessRequest`.
- `src/pages/dashboards/PendingAccessView.tsx` (modify) — request form + status.
- `src/pages/AccessRequests.tsx` (new) — admin review queue.
- `src/App.tsx` (modify) — lazy import + route.
- `src/components/layout/Layout.tsx` (modify) — Admin nav item.
- `src/pages/dashboards/SystemAdminView.tsx` (modify) — link the pending KPI.

---

### Task 1: Migration (table + RLS + RPCs)

**Files:**
- Create: `supabase/migrations/20260525120000_access_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Access requests: self-service role requests for DefaultUser accounts.
CREATE TABLE IF NOT EXISTS public.access_requests (
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

CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
    ON public.access_requests(user_id) WHERE status = 'PENDING';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_select_own" ON public.access_requests
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "access_requests_insert_own" ON public.access_requests
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "access_requests_select_admin" ON public.access_requests
    FOR SELECT TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY "access_requests_update_admin" ON public.access_requests
    FOR UPDATE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- Approve: grant chosen roles, drop DefaultUser, set active_role, mark approved.
CREATE OR REPLACE FUNCTION public.approve_access_request(
    p_request_id uuid, p_roles text[], p_division text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user uuid;
    v_role text;
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF array_length(p_roles, 1) IS NULL THEN
        RAISE EXCEPTION 'no roles selected';
    END IF;
    SELECT user_id INTO v_user FROM public.access_requests
        WHERE id = p_request_id AND status = 'PENDING';
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'request not found or not pending';
    END IF;

    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (v_user, v_role, p_division, false)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;
    END LOOP;

    DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'DefaultUser';
    UPDATE public.user_profiles SET active_role = p_roles[1] WHERE user_id = v_user;

    UPDATE public.access_requests
        SET status = 'APPROVED', review_note = NULL, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_access_request(
    p_request_id uuid, p_note text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    UPDATE public.access_requests
        SET status = 'REJECTED', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id AND status = 'PENDING';
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_request(uuid, text) TO authenticated;
```

- [ ] **Step 2: Commit (file only; user applies to Supabase)**

```bash
git add supabase/migrations/20260525120000_access_requests.sql
git commit -m "feat: access_requests table, RLS, grant/reject RPCs"
```

Note: apply via `supabase db reset` (clean project) or paste into SQL editor as `postgres`. UI depends on it.

---

### Task 2: Requestable roles + type

**Files:**
- Create: `src/lib/access/requestableRoles.ts`, `src/lib/access/requestableRoles.test.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/access/requestableRoles.test.ts
import { describe, it, expect } from 'vitest';
import { REQUESTABLE_ROLES, isRequestableRole } from './requestableRoles';

describe('requestableRoles', () => {
  it('excludes admin and default roles', () => {
    expect(REQUESTABLE_ROLES).not.toContain('SystemAdmin');
    expect(REQUESTABLE_ROLES).not.toContain('MasterAdmin');
    expect(REQUESTABLE_ROLES).not.toContain('DefaultUser');
  });
  it('includes common roles', () => {
    expect(REQUESTABLE_ROLES).toContain('Scientist');
    expect(REQUESTABLE_ROLES).toContain('DivisionHead');
  });
  it('isRequestableRole guards the allow-list', () => {
    expect(isRequestableRole('Scientist')).toBe(true);
    expect(isRequestableRole('SystemAdmin')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/access/requestableRoles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement + add type**

```typescript
// src/lib/access/requestableRoles.ts
import type { Role } from '../../types';

export const REQUESTABLE_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'Student', 'ProjectStaff', 'Guest', 'EmpoweredCommittee',
];

export function isRequestableRole(role: Role): boolean {
  return REQUESTABLE_ROLES.includes(role);
}
```

Append to `src/types/index.ts`:

```typescript
export interface AccessRequest {
  id: string;
  user_id: string;
  email: string | null;
  requested_roles: Role[];
  requested_division: string | null;
  justification: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/access/requestableRoles.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/access/requestableRoles.ts src/lib/access/requestableRoles.test.ts src/types/index.ts
git commit -m "feat: requestable roles allow-list and AccessRequest type"
```

---

### Task 3: PendingAccessView request form + status

**Files:**
- Modify: `src/pages/dashboards/PendingAccessView.tsx`

- [ ] **Step 1: Rewrite the view**

Loads the user's latest `access_requests` row. No-request/rejected → form; pending → status card.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Clock, Mail, Send, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../utils/supabaseClient';
import { REQUESTABLE_ROLES } from '../../lib/access/requestableRoles';
import type { AccessRequest, Role } from '../../types';

export function PendingAccessView() {
  const { user } = useAuth();
  const { divisions } = useData();
  const { push } = useToast();
  const [latest, setLatest] = useState<AccessRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [division, setDivision] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useMemo(() => async () => {
    if (!supabase || !user) { setLoading(false); return; }
    const { data } = await supabase
      .from('access_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    setLatest((data?.[0] as AccessRequest) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const toggleRole = (r: Role) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const submit = async () => {
    if (!supabase || !user) return;
    if (roles.length === 0) { push('Select at least one role', 'warning'); return; }
    if (!justification.trim()) { push('Justification is required', 'warning'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('access_requests').insert({
      user_id: user.id,
      email: user.email,
      requested_roles: roles,
      requested_division: division || null,
      justification: justification.trim(),
    });
    setSubmitting(false);
    if (error) { push(error.message, 'error'); return; }
    push('Request submitted', 'success');
    setRoles([]); setDivision(''); setJustification('');
    void load();
  };

  const showForm = !loading && (!latest || latest.status === 'REJECTED');
  const pending = !loading && latest?.status === 'PENDING';

  return (
    <div className="min-h-[60vh] flex items-center justify-center py-10">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[#f5f4ed] border border-[#f0eee6] flex items-center justify-center text-[#c96442]">
              {pending ? <Clock size={36} /> : <Send size={32} />}
            </div>
          </div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            {pending ? 'Request Submitted' : 'Request Access'}
          </h1>
          <div className="h-1 w-16 bg-[#c96442] rounded-full mx-auto" />
        </div>

        {user?.email && (
          <div className="bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] px-6 py-3 flex items-center gap-3">
            <Mail size={16} className="text-[#87867f] shrink-0" />
            <span className="text-sm text-[#4d4c48] font-medium">{user.email}</span>
          </div>
        )}

        {loading && <p className="text-center text-sm text-text-muted">Loading…</p>}

        {pending && latest && (
          <div className="bg-surface border border-border rounded-[12px] p-6 space-y-2 text-sm">
            <p className="text-text-muted">Awaiting administrator review.</p>
            <div><span className="text-text-muted">Roles: </span><span className="text-text font-medium">{latest.requested_roles.join(', ')}</span></div>
            {latest.requested_division && <div><span className="text-text-muted">Division: </span>{latest.requested_division}</div>}
            <div className="text-text-muted">{latest.justification}</div>
          </div>
        )}

        {showForm && (
          <div className="bg-surface border border-border rounded-[12px] p-6 space-y-5">
            {latest?.status === 'REJECTED' && (
              <div className="rounded-lg border border-[#fca5a5] bg-[#fde2e2] px-4 py-3 text-xs text-[#991b1b]">
                Previous request was declined{latest.review_note ? `: ${latest.review_note}` : '.'} You may submit a new request.
              </div>
            )}
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-text-muted">Roles requested</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {REQUESTABLE_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm text-text">
                    <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)} />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-text-muted">Division (optional)</label>
              <select value={division} onChange={(e) => setDivision(e.target.value)}
                className="mt-2 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm">
                <option value="">— none —</option>
                {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode} - {d.divName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-text-muted">Justification</label>
              <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3}
                placeholder="Briefly describe your role and why you need access"
                className="mt-2 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={submit} disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#c96442] text-white rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors disabled:opacity-60">
              {submitting ? 'Submitting…' : <><Send size={14} /> Submit request</>}
            </button>
          </div>
        )}

        <p className="text-[10px] text-[#b0aea5] uppercase tracking-widest text-center flex items-center justify-center gap-1">
          <CheckCircle2 size={11} /> CSIR-AMPRI — access granted by a system administrator
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint src/pages/dashboards/PendingAccessView.tsx && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboards/PendingAccessView.tsx
git commit -m "feat: access request form on pending view"
```

---

### Task 4: Admin review queue + route + nav + KPI link

**Files:**
- Create: `src/pages/AccessRequests.tsx`
- Modify: `src/App.tsx`, `src/components/layout/Layout.tsx`, `src/pages/dashboards/SystemAdminView.tsx`

- [ ] **Step 1: Create the admin page**

```tsx
// src/pages/AccessRequests.tsx
import { useEffect, useState, useCallback } from 'react';
import { UserCheck, ShieldQuestion } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import type { AccessRequest, Role } from '../types';

export default function AccessRequests() {
  const { staff, divisions } = useData();
  const { push } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, { roles: Role[]; division: string }>>({});

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase
      .from('access_requests')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    const rows = (data as AccessRequest[]) ?? [];
    setRequests(rows);
    setDraft(Object.fromEntries(rows.map((r) => [r.id, { roles: r.requested_roles, division: r.requested_division ?? '' }])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const matchStaff = (email: string | null) =>
    email ? staff.find((s) => (s.Email || '').toLowerCase() === email.toLowerCase()) : undefined;

  const setDraftRoles = (id: string, role: Role) =>
    setDraft((d) => {
      const cur = d[id] ?? { roles: [], division: '' };
      const roles = cur.roles.includes(role) ? cur.roles.filter((r) => r !== role) : [...cur.roles, role];
      return { ...d, [id]: { ...cur, roles } };
    });

  const approve = async (req: AccessRequest) => {
    if (!supabase) return;
    const d = draft[req.id];
    if (!d || d.roles.length === 0) { push('Select at least one role to grant', 'warning'); return; }
    const { error } = await supabase.rpc('approve_access_request', {
      p_request_id: req.id, p_roles: d.roles, p_division: d.division || null,
    });
    if (error) { push(error.message, 'error'); return; }
    push('Access granted', 'success');
    void load();
  };

  const reject = async (req: AccessRequest) => {
    if (!supabase) return;
    const note = window.prompt('Reason for rejection (optional):') ?? '';
    const { error } = await supabase.rpc('reject_access_request', { p_request_id: req.id, p_note: note });
    if (error) { push(error.message, 'error'); return; }
    push('Request rejected', 'info');
    void load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">Access Requests</h1>
        <p className="text-text-muted mt-1">Review and grant role access to new users</p>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : requests.length === 0 ? (
        <Card><EmptyState icon={UserCheck} title="No pending requests" description="New access requests will appear here." /></Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const match = matchStaff(req.email);
            const d = draft[req.id] ?? { roles: [], division: '' };
            return (
              <Card key={req.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-text">{req.email}</div>
                    <div className="text-xs text-text-muted mt-0.5">{new Date(req.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`text-xs rounded-lg px-3 py-2 ${match ? 'bg-[#e6f4eb] text-[#2f7a4a]' : 'bg-[#f5ede0] text-[#7a4a1e]'}`}>
                    {match ? (
                      <span>Staff match: <b>{match.Name}</b> · {match.Designation} · {match.Division}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><ShieldQuestion size={12} /> No staff record matched this email</span>
                    )}
                  </div>
                </div>

                <div className="text-sm text-text-muted">
                  <span className="text-text-muted">Requested: </span>
                  <span className="text-text">{req.requested_roles.join(', ')}</span>
                  {req.requested_division && <span> · division {req.requested_division}</span>}
                </div>
                {req.justification && <div className="text-sm text-text bg-surface-hover rounded-lg px-3 py-2">{req.justification}</div>}

                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Grant roles</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {req.requested_roles.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-sm text-text">
                        <input type="checkbox" checked={d.roles.includes(r)} onChange={() => setDraftRoles(req.id, r)} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={d.division}
                    onChange={(e) => setDraft((dd) => ({ ...dd, [req.id]: { ...d, division: e.target.value } }))}
                    className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">No division</option>
                    {divisions.map((dv) => <option key={dv.divCode} value={dv.divCode}>{dv.divCode} - {dv.divName}</option>)}
                  </select>
                  <button onClick={() => approve(req)}
                    className="px-4 py-2 bg-[#c96442] text-white rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors">
                    Approve & grant
                  </button>
                  <button onClick={() => reject(req)}
                    className="px-4 py-2 bg-surface border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors">
                    Reject
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add route in `src/App.tsx`**

Add lazy import near the other admin pages:
```tsx
const AccessRequests = lazy(() => import('./pages/AccessRequests'));
```
Add route alongside `/admin/holidays`:
```tsx
<Route path="/admin/access-requests" element={<ProtectedRoute allowedRoles={['SystemAdmin', 'MasterAdmin']}><AccessRequests /></ProtectedRoute>} />
```

- [ ] **Step 3: Add nav item in `src/components/layout/Layout.tsx`**

Import `UserCheck` in the lucide import block, then add to the `Admin` section `items` array:
```tsx
{ path: '/admin/access-requests', label: 'Access Requests', icon: UserCheck, allowedRoles: ['SystemAdmin', 'MasterAdmin'] },
```

- [ ] **Step 4: Link the pending KPI in `src/pages/dashboards/SystemAdminView.tsx`**

Import `Link` from `react-router-dom` (top of file) and wrap the "Reg. Users" KpiCard:
```tsx
<Link to="/admin/access-requests" className="block">
  <KpiCard label="Reg. Users" value={userRoles.length} icon={<Users size={18} />} sublabel={`${pendingUsers} pending`} />
</Link>
```

- [ ] **Step 5: Lint + typecheck + full tests**

Run: `npx eslint src/pages/AccessRequests.tsx src/App.tsx src/components/layout/Layout.tsx src/pages/dashboards/SystemAdminView.tsx && npx tsc --noEmit && npx vitest run`
Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AccessRequests.tsx src/App.tsx src/components/layout/Layout.tsx src/pages/dashboards/SystemAdminView.tsx
git commit -m "feat: admin access-request review queue"
```

---

## Self-Review Notes

- **Spec coverage:** table+RLS+RPCs (Task 1), requestable roles + type (Task 2), user form/status (Task 3),
  admin queue + auto-match + subset grant + route + nav + KPI link (Task 4). Covered.
- **Type consistency:** `AccessRequest` fields match the SQL columns; RPC param names (`p_request_id`,
  `p_roles`, `p_division`, `p_note`) match the migration; `requested_roles` typed `Role[]`.
- **Security:** all grants via SECURITY DEFINER RPC with admin guard; RLS restricts table; client only inserts
  own request. No client `user_roles` writes.
- **Deployment:** migration must be applied to Supabase before the UI functions (manual user step).

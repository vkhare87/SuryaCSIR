# Feature Controls Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the feature-first Feature Controls admin page with three single-purpose panels — a role-first editor (the primary daily task), a read-only feature lookup, and a separate global kill-switch panel — so MasterAdmin always knows whether a toggle changed anything.

**Architecture:** Extract pure, testable logic (grouping features by role, toggling a role's block state, summarizing a feature's role coverage) into `src/lib/access/featureControls.ts`. Extract the shared Supabase-write + "Saved" confirmation flow into a small hook. Build three focused components in `src/components/admin/`, each consuming the same `useFeatureControls()` context so they stay in sync. The page becomes a thin shell composing the three.

**Tech Stack:** React 19 + TypeScript 5.9 strict, Tailwind CSS 4 (semantic tokens only), vitest + @testing-library/react.

## Global Constraints

- No schema/migration change — same `feature_controls` table (`feature_key`, `enabled`, `disabled_roles`, `note`, `updated_by`, `updated_at`).
- No change to `featureEnabled()` runtime-check logic — MasterAdmin exemption and default-open behavior stay exactly as-is.
- Semantic Tailwind tokens only (`text-text`, `bg-surface`, `border-border`, `text-terracotta`) — never raw colors, except the pre-existing raw hex already used for the toggle track (`bg-[#16a34a]`) and role-switcher accent (`text-[#c96442]`), which match this codebase's established pattern for these exact controls.
- `verbatimModuleSyntax` is on — `import type { ... }` for type-only imports.
- Pages use `export default function`; shared UI components use named exports (per `src/components/admin/ManageUsersTab.tsx`).
- Tests colocate as `<name>.test.ts` next to source.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Pure logic — grouping, toggling, and summary helpers

**Files:**
- Modify: `src/lib/access/featureControls.ts`
- Test: `src/lib/access/featureControls.test.ts`

**Interfaces:**
- Consumes: `ACCESS_MAP`, `type AccessPath` from `../../constants/access` (already imported in this file); `type Role, FeatureControl` from `../../types` (already imported).
- Produces (all exported from `src/lib/access/featureControls.ts`, consumed by later tasks):
  - `FEATURE_GROUPS: { label: string; paths: AccessPath[] }[]`
  - `blankControl(path: string): FeatureControl`
  - `featuresForRole(role: Role, groups: { label: string; paths: AccessPath[] }[]): { label: string; paths: AccessPath[] }[]`
  - `toggleRoleBlock(control: FeatureControl, role: Role): FeatureControl`
  - `interface FeatureRoleSummary { totalEligible: number; enabledCount: number; blockedRoles: Role[]; globallyKilled: boolean }`
  - `featureRoleSummary(path: AccessPath, control: FeatureControl | undefined): FeatureRoleSummary`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/access/featureControls.test.ts` (the file already has a `control()` fixture helper at the top — reuse it):

```typescript
import { featuresForRole, toggleRoleBlock, featureRoleSummary, blankControl } from './featureControls';
import type { AccessPath } from '../../constants/access';

describe('featuresForRole', () => {
  it('filters groups to only paths the role is eligible for', () => {
    const groups = [{ label: 'Test', paths: ['/pms/committee', '/data'] as AccessPath[] }];
    expect(featuresForRole('EmpoweredCommittee', groups)).toEqual([
      { label: 'Test', paths: ['/pms/committee'] },
    ]);
    expect(featuresForRole('HRAdmin', groups)).toEqual([
      { label: 'Test', paths: ['/data'] },
    ]);
  });

  it('drops a group entirely when the role has no eligible paths in it', () => {
    const groups = [{ label: 'Test', paths: ['/pms/committee'] as AccessPath[] }];
    expect(featuresForRole('HRAdmin', groups)).toEqual([]);
  });
});

describe('toggleRoleBlock', () => {
  it('adds the role to disabled_roles when not already blocked', () => {
    const c = blankControl('/data');
    const next = toggleRoleBlock(c, 'HRAdmin');
    expect(next.disabled_roles).toEqual(['HRAdmin']);
  });

  it('removes the role from disabled_roles when already blocked', () => {
    const c = { ...blankControl('/data'), disabled_roles: ['HRAdmin', 'SystemAdmin'] };
    const next = toggleRoleBlock(c, 'HRAdmin');
    expect(next.disabled_roles).toEqual(['SystemAdmin']);
  });

  it('does not mutate the input control', () => {
    const c = blankControl('/data');
    toggleRoleBlock(c, 'HRAdmin');
    expect(c.disabled_roles).toEqual([]);
  });
});

describe('featureRoleSummary', () => {
  it('counts eligible roles excluding MasterAdmin, with none blocked by default', () => {
    // /data is DATA_ADMINS = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] — 2 eligible after excluding MasterAdmin
    expect(featureRoleSummary('/data' as AccessPath, undefined)).toEqual({
      totalEligible: 2,
      enabledCount: 2,
      blockedRoles: [],
      globallyKilled: false,
    });
  });

  it('reflects a per-role block', () => {
    const c = { ...blankControl('/data'), disabled_roles: ['HRAdmin'] };
    expect(featureRoleSummary('/data' as AccessPath, c)).toEqual({
      totalEligible: 2,
      enabledCount: 1,
      blockedRoles: ['HRAdmin'],
      globallyKilled: false,
    });
  });

  it('treats a global kill as blocking every eligible role', () => {
    const c = { ...blankControl('/data'), enabled: false };
    expect(featureRoleSummary('/data' as AccessPath, c)).toEqual({
      totalEligible: 2,
      enabledCount: 0,
      blockedRoles: ['HRAdmin', 'SystemAdmin'],
      globallyKilled: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/access/featureControls.test.ts`
Expected: FAIL — `featuresForRole`, `toggleRoleBlock`, `featureRoleSummary`, `blankControl` are not exported from `./featureControls`.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/access/featureControls.ts` (after the existing `featureEnabled` function):

```typescript
// Grouping used by the Feature Controls admin panels — mirrors the sidebar
// sections, with workflow sub-paths listed under their parent area.
export const FEATURE_GROUPS: { label: string; paths: AccessPath[] }[] = [
  { label: 'Overview', paths: ['/ask', '/intelligence', '/explore', '/calendar'] },
  { label: 'Unified Human Resource', paths: ['/staff', '/staff/analytics', '/staff/project', '/phd', '/divisions', '/recruitment'] },
  { label: 'Research Ops', paths: ['/projects', '/proposals', '/reports', '/reports/new', '/facilities', '/partnerships', '/rnd-monitor'] },
  { label: 'Governance', paths: ['/committees', '/helpdesk', '/pms', '/pms/cycles', '/pms/evaluation-committees', '/pms/reports/new', '/pms/assign', '/pms/committee', '/pms/audit'] },
  { label: 'Data Ops', paths: ['/data', '/irins-sync'] },
];

export function blankControl(path: string): FeatureControl {
  return {
    feature_key: path,
    enabled: true,
    disabled_roles: [],
    note: null,
    updated_by: null,
    updated_at: '',
  };
}

/** Filters each group's paths to only those the role is eligible for
 * (present in ACCESS_MAP[path]); drops a group entirely if it ends up empty. */
export function featuresForRole(
  role: Role,
  groups: { label: string; paths: AccessPath[] }[],
): { label: string; paths: AccessPath[] }[] {
  return groups
    .map((g) => ({ label: g.label, paths: g.paths.filter((p) => (ACCESS_MAP[p] as Role[]).includes(role)) }))
    .filter((g) => g.paths.length > 0);
}

/** Pure state transform: returns the next FeatureControl after toggling
 * whether `role` is blocked. Does not mutate the input. */
export function toggleRoleBlock(control: FeatureControl, role: Role): FeatureControl {
  const disabled_roles = control.disabled_roles.includes(role)
    ? control.disabled_roles.filter((r) => r !== role)
    : [...control.disabled_roles, role];
  return { ...control, disabled_roles };
}

export interface FeatureRoleSummary {
  totalEligible: number;
  enabledCount: number;
  blockedRoles: Role[];
  globallyKilled: boolean;
}

/** Summarizes how exposed a feature currently is across its eligible roles
 * (ACCESS_MAP[path] minus MasterAdmin, which is always exempt). */
export function featureRoleSummary(
  path: AccessPath,
  control: FeatureControl | undefined,
): FeatureRoleSummary {
  const eligibleRoles = (ACCESS_MAP[path] as Role[]).filter((r) => r !== 'MasterAdmin');
  const c = control ?? blankControl(path);
  const blockedRoles = c.enabled ? eligibleRoles.filter((r) => c.disabled_roles.includes(r)) : eligibleRoles;
  return {
    totalEligible: eligibleRoles.length,
    enabledCount: eligibleRoles.length - blockedRoles.length,
    blockedRoles,
    globallyKilled: !c.enabled,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/access/featureControls.test.ts`
Expected: all tests pass (existing 7 + 9 new = 16).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/access/featureControls.ts src/lib/access/featureControls.test.ts
git commit -m "feat(access): pure helpers for role-first feature control grouping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared save/confirmation hook

**Files:**
- Create: `src/hooks/useFeatureControlEditor.ts`

**Interfaces:**
- Consumes: `useAuth()` from `../contexts/AuthContext` (for `user.id`); `useFeatureControls()` from `../contexts/FeatureControlContext` (for `refresh()`); `useToast()` from `../contexts/ToastContext` (for `push(message, 'error')`); `supabase` from `../utils/supabaseClient`; `type FeatureControl` from `../types`.
- Produces: `useFeatureControlEditor(): { saving: string | null; savedFlash: string | null; save: (next: FeatureControl) => Promise<void> }` — consumed by Task 3 and Task 5.

This is thin Supabase-write glue (upsert + toast + refresh), matching the untested `save()` function already in the current `src/pages/admin/FeatureControls.tsx` — no dedicated test file, consistent with how that logic is currently handled in this codebase.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useFeatureControlEditor.ts`:

```typescript
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureControls } from '../contexts/FeatureControlContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../utils/supabaseClient';
import type { FeatureControl } from '../types';

const SAVED_FLASH_MS = 1500;

/** Shared save flow for the Feature Controls admin panels: upserts a
 * feature_controls row, refreshes the shared context on success, and
 * exposes a short-lived "saved" flag per feature so the UI can confirm
 * a toggle actually took effect. */
export function useFeatureControlEditor() {
  const { user } = useAuth();
  const { refresh } = useFeatureControls();
  const { push } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const save = async (next: FeatureControl) => {
    if (!supabase || !user) return;
    setSaving(next.feature_key);
    const { error } = await supabase.from('feature_controls').upsert({
      feature_key: next.feature_key,
      enabled: next.enabled,
      disabled_roles: next.disabled_roles,
      note: next.note,
      updated_by: user.id,
    });
    setSaving(null);
    if (error) {
      push(error.message, 'error');
      return;
    }
    await refresh();
    setSavedFlash(next.feature_key);
    setTimeout(() => {
      setSavedFlash((cur) => (cur === next.feature_key ? null : cur));
    }, SAVED_FLASH_MS);
  };

  return { saving, savedFlash, save };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFeatureControlEditor.ts
git commit -m "feat(admin): shared save+confirmation hook for feature control panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Role Editor panel

**Files:**
- Create: `src/components/admin/RoleFeatureEditor.tsx`

**Interfaces:**
- Consumes: `FEATURE_GROUPS`, `blankControl`, `featuresForRole`, `toggleRoleBlock` from `../../lib/access/featureControls` (Task 1); `useFeatureControlEditor` from `../../hooks/useFeatureControlEditor` (Task 2); `useFeatureControls` from `../../contexts/FeatureControlContext`; `ALL_ROLES`, `FEATURE_LABELS` from `../../constants/access`; `Card`, `Badge` from `../ui/Cards`; `type Role` from `../../types`.
- Produces: named export `RoleFeatureEditor` (no props) — consumed by Task 6's page shell.

- [ ] **Step 1: Write the component**

Create `src/components/admin/RoleFeatureEditor.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { useFeatureControlEditor } from '../../hooks/useFeatureControlEditor';
import { Card, Badge } from '../ui/Cards';
import { ALL_ROLES, FEATURE_LABELS } from '../../constants/access';
import { FEATURE_GROUPS, blankControl, featuresForRole, toggleRoleBlock } from '../../lib/access/featureControls';
import type { Role } from '../../types';

// MasterAdmin is exempt from every control (see featureEnabled) — nothing
// to configure for it, so it's not a selectable role here.
const SELECTABLE_ROLES: Role[] = ALL_ROLES.filter((r) => r !== 'MasterAdmin');

export function RoleFeatureEditor() {
  const { controls } = useFeatureControls();
  const { saving, savedFlash, save } = useFeatureControlEditor();
  const [role, setRole] = useState<Role>(SELECTABLE_ROLES[0]);

  const byKey = useMemo(() => new Map(controls.map((c) => [c.feature_key, c])), [controls]);
  const groups = useMemo(() => featuresForRole(role, FEATURE_GROUPS), [role]);

  const toggle = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    void save(toggleRoleBlock(cur, role));
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Role Editor</h2>
          <p className="text-xs text-text-muted mt-0.5">Pick a role, then switch its features on or off.</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm" htmlFor="role-editor-select">
          <span className="text-text-muted font-medium">Role</span>
          <select
            id="role-editor-select"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
          >
            {SELECTABLE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>

      {groups.length === 0 && (
        <div className="px-6 py-8 text-sm text-text-muted">No controllable features for this role.</div>
      )}

      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-6 py-2 bg-surface-hover">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{group.label}</h3>
          </div>
          <div className="divide-y divide-border">
            {group.paths.map((path) => {
              const control = byKey.get(path) ?? blankControl(path);
              const blocked = control.disabled_roles.includes(role);
              const killed = !control.enabled;
              const on = control.enabled && !blocked;
              return (
                <div key={path} className="px-6 py-3 flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${FEATURE_LABELS[path]} for ${role}`}
                    disabled={saving === path || killed}
                    onClick={() => toggle(path)}
                    className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-40 ${
                      on ? 'bg-[#16a34a]' : 'bg-surface-hover border border-border'
                    }`}
                  >
                    <span
                      className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
                        on ? 'left-[22px]' : 'left-[3px]'
                      }`}
                    />
                  </button>
                  <span className="text-sm font-semibold text-text flex-1">{FEATURE_LABELS[path]}</span>
                  {killed ? (
                    <Badge variant="danger">Off for everyone</Badge>
                  ) : (
                    <Badge variant={on ? 'success' : 'danger'}>{on ? 'ON' : 'OFF'}</Badge>
                  )}
                  {savedFlash === path && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Saved</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/admin/RoleFeatureEditor.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/RoleFeatureEditor.tsx
git commit -m "feat(admin): role-first feature editor panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Feature Lookup panel (read-only)

**Files:**
- Create: `src/components/admin/FeatureRoleLookup.tsx`

**Interfaces:**
- Consumes: `FEATURE_GROUPS`, `featureRoleSummary` from `../../lib/access/featureControls` (Task 1); `useFeatureControls` from `../../contexts/FeatureControlContext`; `FEATURE_LABELS`, `type AccessPath` from `../../constants/access`; `Card`, `Badge` from `../ui/Cards`.
- Produces: named export `FeatureRoleLookup` (no props) — consumed by Task 6's page shell.

- [ ] **Step 1: Write the component**

Create `src/components/admin/FeatureRoleLookup.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { Card, Badge } from '../ui/Cards';
import { FEATURE_LABELS, type AccessPath } from '../../constants/access';
import { FEATURE_GROUPS, featureRoleSummary } from '../../lib/access/featureControls';

const ALL_CONTROLLABLE_PATHS: AccessPath[] = FEATURE_GROUPS.flatMap((g) => g.paths);

export function FeatureRoleLookup() {
  const { controls } = useFeatureControls();
  const [path, setPath] = useState<AccessPath>(ALL_CONTROLLABLE_PATHS[0]);

  const control = useMemo(() => controls.find((c) => c.feature_key === path), [controls, path]);
  const summary = useMemo(() => featureRoleSummary(path, control), [path, control]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Feature Lookup</h2>
          <p className="text-xs text-text-muted mt-0.5">Pick a feature to see how exposed it currently is. Read-only.</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm" htmlFor="feature-lookup-select">
          <span className="text-text-muted font-medium">Feature</span>
          <select
            id="feature-lookup-select"
            value={path}
            onChange={(e) => setPath(e.target.value as AccessPath)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
          >
            {FEATURE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.paths.map((p) => (
                  <option key={p} value={p}>{FEATURE_LABELS[p]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="px-6 py-4 space-y-2">
        <p className="text-sm text-text">
          Enabled for <span className="font-semibold">{summary.enabledCount} of {summary.totalEligible}</span> eligible roles
        </p>
        {summary.globallyKilled && <Badge variant="danger">Off for everyone</Badge>}
        {!summary.globallyKilled && summary.blockedRoles.length > 0 && (
          <p className="text-xs text-text-muted">Blocked: {summary.blockedRoles.join(', ')}</p>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/admin/FeatureRoleLookup.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/FeatureRoleLookup.tsx
git commit -m "feat(admin): read-only feature-to-role coverage lookup panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Global Kill Switches panel

**Files:**
- Create: `src/components/admin/GlobalFeatureKillSwitches.tsx`

**Interfaces:**
- Consumes: `FEATURE_GROUPS`, `blankControl` from `../../lib/access/featureControls` (Task 1); `useFeatureControlEditor` from `../../hooks/useFeatureControlEditor` (Task 2); `useFeatureControls` from `../../contexts/FeatureControlContext`; `FEATURE_LABELS` from `../../constants/access`; `Card`, `Badge` from `../ui/Cards`; `RotateCcw` from `lucide-react`.
- Produces: named export `GlobalFeatureKillSwitches` (no props) — consumed by Task 6's page shell.

- [ ] **Step 1: Write the component**

Create `src/components/admin/GlobalFeatureKillSwitches.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { useFeatureControlEditor } from '../../hooks/useFeatureControlEditor';
import { Card, Badge } from '../ui/Cards';
import { FEATURE_LABELS } from '../../constants/access';
import { FEATURE_GROUPS, blankControl } from '../../lib/access/featureControls';

export function GlobalFeatureKillSwitches() {
  const { controls } = useFeatureControls();
  const { saving, savedFlash, save } = useFeatureControlEditor();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const byKey = useMemo(() => new Map(controls.map((c) => [c.feature_key, c])), [controls]);

  const toggle = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    void save({ ...cur, enabled: !cur.enabled });
  };

  const saveNote = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    const note = (notes[path] ?? cur.note ?? '').trim() || null;
    if (note === cur.note) return;
    void save({ ...cur, note });
  };

  const reset = (path: string) => {
    const cur = byKey.get(path);
    if (!cur) return;
    void save({ ...cur, enabled: true, note: null });
    setNotes((n) => ({ ...n, [path]: '' }));
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Global Kill Switches</h2>
        <p className="text-xs text-text-muted mt-0.5">Off here means off for everyone, every role, institute-wide.</p>
      </div>
      <div className="divide-y divide-border">
        {FEATURE_GROUPS.flatMap((g) => g.paths).map((path) => {
          const control = byKey.get(path) ?? blankControl(path);
          const modified = !control.enabled || Boolean(control.note);
          return (
            <div key={path} className="px-6 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  role="switch"
                  aria-checked={control.enabled}
                  aria-label={`${FEATURE_LABELS[path]} enabled institute-wide`}
                  disabled={saving === path}
                  onClick={() => toggle(path)}
                  className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                    control.enabled ? 'bg-[#16a34a]' : 'bg-surface-hover border border-border'
                  }`}
                >
                  <span
                    className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
                      control.enabled ? 'left-[22px]' : 'left-[3px]'
                    }`}
                  />
                </button>
                <span className="text-sm font-semibold text-text">{FEATURE_LABELS[path]}</span>
                <Badge variant={control.enabled ? 'success' : 'danger'}>{control.enabled ? 'ON' : 'OFF'}</Badge>
                {savedFlash === path && (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Saved</span>
                )}
                {modified && (
                  <button
                    type="button"
                    onClick={() => reset(path)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-terracotta transition-colors"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
              </div>
              <input
                type="text"
                value={notes[path] ?? control.note ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [path]: e.target.value }))}
                onBlur={() => saveNote(path)}
                placeholder="Reason / note (optional)"
                className="w-full max-w-xl bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-text-muted"
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/admin/GlobalFeatureKillSwitches.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/GlobalFeatureKillSwitches.tsx
git commit -m "feat(admin): institute-wide global kill-switch panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Page shell + integration

**Files:**
- Modify: `src/pages/admin/FeatureControls.tsx` (full rewrite — the file shrinks from ~195 lines to a thin composing shell)

**Interfaces:**
- Consumes: `RoleFeatureEditor` (Task 3), `FeatureRoleLookup` (Task 4), `GlobalFeatureKillSwitches` (Task 5); `UNCONTROLLABLE_PATHS` from `../../lib/access/featureControls`.
- Produces: `export default function FeatureControls()` — unchanged signature, already wired into `src/App.tsx:61,197` (lazy-loaded route `/admin/features`) — no changes needed there.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `src/pages/admin/FeatureControls.tsx` with:

```tsx
import { SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { UNCONTROLLABLE_PATHS } from '../../lib/access/featureControls';
import { RoleFeatureEditor } from '../../components/admin/RoleFeatureEditor';
import { FeatureRoleLookup } from '../../components/admin/FeatureRoleLookup';
import { GlobalFeatureKillSwitches } from '../../components/admin/GlobalFeatureKillSwitches';

export default function FeatureControls() {
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <SlidersHorizontal size={26} className="text-terracotta" /> Feature Controls
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          Switch features off institute-wide or for specific roles. Absent entry = fully enabled.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface px-5 py-3 flex items-start gap-3 text-xs text-text-muted">
        <ShieldCheck size={15} className="text-terracotta shrink-0 mt-0.5" />
        <p>
          MasterAdmin is exempt from every control, and the dashboard + admin pages
          ({UNCONTROLLABLE_PATHS.join(', ')}) cannot be switched off — no self-lockout.
          These switches govern navigation and routes; row-level security on the data remains in force regardless.
        </p>
      </div>

      <RoleFeatureEditor />
      <FeatureRoleLookup />
      <GlobalFeatureKillSwitches />
    </div>
  );
}
```

- [ ] **Step 2: Full health check**

Run: `npx tsc --noEmit && npx eslint src/ && npm test -- --run`
Expected: all clean, all tests passing (no regressions, plus the 9 new tests from Task 1).

- [ ] **Step 3: Manual drive verification**

Start the dev server and open `/#/admin/features` logged in as a MasterAdmin account (e.g. `master@test.local` / `Test@1234` if the seeded test users from the earlier UX-fix branch are applied, or the dev-bypass account which now also carries MasterAdmin).

Check:
- Role Editor: switching the role dropdown changes the visible feature list; toggling a feature shows the "Saved" flash and the badge flips ON/OFF immediately.
- Feature Lookup: switching the feature dropdown updates the "Enabled for N of M" text and blocked-roles list with no lag; nothing in this panel is clickable/editable.
- Global Kill Switches: toggling a feature off there causes that feature's row in the Role Editor (for any role) to show "Off for everyone" and become non-interactive.
- No console errors on any of the above interactions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/FeatureControls.tsx
git commit -m "refactor(admin): compose Feature Controls page from the three new panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage:** Role Editor (Task 3) ✅, Feature Lookup read-only (Task 4) ✅, Global Kill Switches (Task 5) ✅, shared data/no-schema-change (Task 1 pure helpers + Task 2 shared write hook, both reuse the existing `feature_controls` table) ✅, explicit ON/OFF text not color-only (Badge text in Tasks 3 & 5) ✅, "Saved" confirmation flash (Task 2 hook, consumed in Tasks 3 & 5) ✅, disabled/greyed role toggle when globally killed (Task 3, `killed` check) ✅, no separate per-role reset control (Task 3 has none — toggle is the reset, per spec) ✅.

**Type consistency check:** `FeatureRoleSummary` fields (`totalEligible`, `enabledCount`, `blockedRoles`, `globallyKilled`) match between Task 1's definition and Task 4's consumption. `featuresForRole`/`toggleRoleBlock`/`blankControl`/`FEATURE_GROUPS` signatures match between Task 1's export and Tasks 3/4/5's imports. `useFeatureControlEditor()`'s `{ saving, savedFlash, save }` shape matches between Task 2's definition and Tasks 3/5's consumption.

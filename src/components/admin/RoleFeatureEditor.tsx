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

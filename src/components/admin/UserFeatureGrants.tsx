import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { UserPicker } from '../ui/UserPicker';
import { supabase } from '../../utils/supabaseClient';
import { FEATURE_LABELS, type AccessPath } from '../../constants/access';
import { FEATURE_GROUPS, grantableFeatures } from '../../lib/access/featureControls';
import type { DirectoryUser } from '../../hooks/useUserDirectory';
import type { FeatureGrant, Role } from '../../types';
import { friendlyError } from '../../lib/errors';

export function UserFeatureGrants() {
  const { user: me } = useAuth();
  const { refresh } = useFeatureControls();
  const { push } = useToast();
  const [target, setTarget] = useState<DirectoryUser | null>(null);
  const [grants, setGrants] = useState<FeatureGrant[]>([]);
  const [feature, setFeature] = useState<AccessPath | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('feature_grants').select('*').eq('user_id', userId).order('feature_key');
    if (error) push(friendlyError(error), 'error');
    setGrants(error ? [] : (data as FeatureGrant[]));
  }, [push]);

  useEffect(() => {
    if (target) void load(target.userId);
    else setGrants([]);
  }, [target, load]);

  const options = useMemo(
    () => (target ? grantableFeatures(target.roles, FEATURE_GROUPS, new Set(grants.map(g => g.feature_key))) : []),
    [target, grants],
  );

  const afterChange = async (userId: string) => {
    await load(userId);
    if (userId === me?.id) await refresh();
  };

  const add = async () => {
    if (!supabase || !me || !target || !feature) return;
    setBusy(true);
    const { error } = await supabase.from('feature_grants').insert({
      user_id: target.userId, feature_key: feature, note: note.trim() || null, granted_by: me.id,
    });
    setBusy(false);
    if (error) { push(friendlyError(error), 'error'); return; }
    push(`${FEATURE_LABELS[feature]} granted to ${target.name ?? target.email}`, 'success');
    setFeature('');
    setNote('');
    await afterChange(target.userId);
  };

  const revoke = async (g: FeatureGrant) => {
    if (!supabase || !target) return;
    setBusy(true);
    const { error } = await supabase.from('feature_grants')
      .delete().eq('user_id', g.user_id).eq('feature_key', g.feature_key);
    setBusy(false);
    if (error) { push(friendlyError(error), 'error'); return; }
    await afterChange(target.userId);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Extra features for one user</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Open a page a user's role does not include. Data on that page stays limited to what their role may read.
        </p>
      </div>

      <div className="px-6 py-4 space-y-4">
        {target ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-text">{target.name ?? target.email}</span>
            {target.roles.map((r: Role) => <Badge key={r} variant="neutral">{r}</Badge>)}
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="ml-auto p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover"
              aria-label="Choose another user"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <UserPicker onSelect={setTarget} placeholder="Find a user by name or email…" />
        )}

        {target && (
          <>
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Granted</h3>
              {grants.length === 0 ? (
                <p className="text-sm text-text-muted">No extra features. This user sees only what their roles give.</p>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-lg">
                  {grants.map(g => (
                    <li key={g.feature_key} className="px-3 py-2 flex items-center gap-3">
                      <span className="text-sm font-medium text-text flex-1">
                        {FEATURE_LABELS[g.feature_key as AccessPath] ?? g.feature_key}
                        {g.note && <span className="block text-xs text-text-muted">{g.note}</span>}
                      </span>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void revoke(g)}>
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <label className="sr-only" htmlFor="grant-feature">Feature</label>
              <select
                id="grant-feature"
                value={feature}
                onChange={e => setFeature(e.target.value as AccessPath | '')}
                className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text sm:w-64"
              >
                <option value="">Choose a feature…</option>
                {options.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.paths.map(p => <option key={p} value={p}>{FEATURE_LABELS[p]}</option>)}
                  </optgroup>
                ))}
              </select>
              <label className="sr-only" htmlFor="grant-note">Reason</label>
              <input
                id="grant-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Reason (optional)"
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
              />
              <Button size="sm" disabled={busy || !feature} onClick={() => void add()}>
                <UserPlus size={14} /> Grant
              </Button>
            </div>
            {options.length === 0 && (
              <p className="text-xs text-text-muted">
                Their roles already include every feature that can be granted.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

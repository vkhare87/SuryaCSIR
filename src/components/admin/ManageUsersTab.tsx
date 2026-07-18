import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Search, ShieldQuestion, ChevronDown } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { Card } from '../ui/Cards';
import { EmptyState } from '../ui/EmptyState';
import type { Role } from '../../types';

const ALL_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin', 'Student',
  'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee',
];

interface ManagedUser {
  user_id: string;
  email: string | null;
  active_role: Role | null;
  roles: Role[];
  division: string | null;
}

interface Draft {
  roles: Role[];
  active: Role;
  division: string;
}

export function ManageUsersTab() {
  const { staff, divisions } = useData();
  const { push } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    // user_roles has no admin-select RLS policy by design (see
    // 20260712000002_auth_rbac.sql) — this RPC is the sanctioned way to
    // read other users' role assignments.
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) {
      setLoadError(error.message);
      push(error.message, 'error');
      setUsers([]);
      setLoading(false);
      return;
    }
    const rows: ManagedUser[] = ((data as {
      user_id: string; email: string | null; active_role: Role | null;
      roles: Role[] | null; division_code: string | null;
    }[]) ?? []).map((r) => ({
      user_id: r.user_id,
      email: r.email,
      active_role: r.active_role,
      roles: r.roles ?? [],
      division: r.division_code,
    }));
    setUsers(rows);
    setLoadError(null);
    setLoading(false);
  }, [push]);

  useEffect(() => { void load(); }, [load]);

  const matchStaff = (email: string | null) =>
    email ? staff.find((s) => (s.Email || '').toLowerCase() === email.toLowerCase()) : undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const m = matchStaff(u.email);
      return (u.email ?? '').toLowerCase().includes(q) || (m?.Name ?? '').toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, staff]);

  const openEditor = (u: ManagedUser) => {
    if (expanded === u.user_id) { setExpanded(null); return; }
    setExpanded(u.user_id);
    setDraft((d) => ({
      ...d,
      [u.user_id]: {
        roles: u.roles,
        active: (u.active_role && u.roles.includes(u.active_role)) ? u.active_role : u.roles[0],
        division: u.division ?? '',
      },
    }));
  };

  const toggleRole = (id: string, role: Role) =>
    setDraft((d) => {
      const cur = d[id];
      if (!cur) return d;
      const roles = cur.roles.includes(role) ? cur.roles.filter((r) => r !== role) : [...cur.roles, role];
      const active = roles.includes(cur.active) ? cur.active : (roles[0] ?? cur.active);
      return { ...d, [id]: { ...cur, roles, active } };
    });

  const save = async (u: ManagedUser) => {
    if (!supabase) return;
    const d = draft[u.user_id];
    if (!d || d.roles.length === 0) { push('Select at least one role', 'warning'); return; }
    setSaving(u.user_id);
    const { error } = await supabase.rpc('admin_set_user_roles', {
      p_user_id: u.user_id,
      p_roles: d.roles,
      p_active_role: d.active,
      p_division: d.division || null,
    });
    setSaving(null);
    if (error) { push(error.message, 'error'); return; }
    push('Roles updated', 'success');
    setExpanded(null);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : loadError ? (
        <div className="space-y-3">
          <Card><EmptyState variant="error" icon={ShieldQuestion} title="Couldn't load users" description={loadError} /></Card>
          <div className="flex justify-center">
            <button onClick={() => void load()} className="text-sm text-brand-blue hover:underline">
              Retry
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No users"
            description={search.trim() ? "No registered users match your search." : "No registered users found."}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => {
            const m = matchStaff(u.email);
            const isOpen = expanded === u.user_id;
            const d = draft[u.user_id];
            return (
              <Card key={u.user_id} className="space-y-3">
                <button onClick={() => openEditor(u)} className="w-full flex items-start justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <div className="font-semibold text-text truncate">{u.email ?? '(no email)'}</div>
                    <div className="text-xs text-text-muted mt-0.5 inline-flex items-center gap-1">
                      {m ? (
                        <span>{m.Name} · {m.Designation} · {m.Division}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><ShieldQuestion size={12} /> No staff match</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.roles.length === 0 && <span className="text-xs text-text-muted">No roles</span>}
                      {u.roles.map((r) => (
                        <span key={r} className={`text-xs rounded-full px-2 py-0.5 ${r === u.active_role ? 'bg-[#c96442] text-white' : 'bg-surface-hover text-text-muted'}`}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && d && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">Roles</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ALL_ROLES.map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm text-text">
                            <input type="checkbox" checked={d.roles.includes(r)} onChange={() => toggleRole(u.user_id, r)} />
                            {r}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm text-text-muted">
                        Active role
                        <select
                          value={d.active}
                          onChange={(e) => setDraft((dd) => ({ ...dd, [u.user_id]: { ...d, active: e.target.value as Role } }))}
                          className="ml-2 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
                        >
                          {d.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                      <label className="text-sm text-text-muted">
                        Division
                        <select
                          value={d.division}
                          onChange={(e) => setDraft((dd) => ({ ...dd, [u.user_id]: { ...d, division: e.target.value } }))}
                          className="ml-2 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
                        >
                          <option value="">No division</option>
                          {divisions.map((dv) => <option key={dv.divCode} value={dv.divCode}>{dv.divCode} - {dv.divName}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => save(u)}
                        disabled={saving === u.user_id}
                        className="px-4 py-2 bg-[#c96442] text-white rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors disabled:opacity-50"
                      >
                        {saving === u.user_id ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        onClick={() => setExpanded(null)}
                        className="px-4 py-2 bg-surface border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

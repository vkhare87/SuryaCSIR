import { useEffect, useState, useCallback } from 'react';
import { UserCheck, ShieldQuestion } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { ManageUsersTab } from '../components/admin/ManageUsersTab';
import type { AccessRequest, Role } from '../types';

type Tab = 'pending' | 'users';

export default function AccessRequests() {
  const { staff, divisions } = useData();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('pending');
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
        <h1 className="text-2xl font-[500] text-text font-serif">Access &amp; Roles</h1>
        <p className="text-text-muted mt-1">Grant access to new users and manage existing role assignments</p>
      </div>

      <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 ${tab === 'pending' ? 'bg-surface-hover text-text font-medium' : 'bg-surface text-text-muted hover:text-text'}`}
        >
          Pending Requests
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 border-l border-border ${tab === 'users' ? 'bg-surface-hover text-text font-medium' : 'bg-surface text-text-muted hover:text-text'}`}
        >
          Manage Users
        </button>
      </div>

      {tab === 'users' ? (
        <ManageUsersTab />
      ) : loading ? (
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
                    Approve &amp; grant
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

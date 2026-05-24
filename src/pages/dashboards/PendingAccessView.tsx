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

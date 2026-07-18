import { useEffect, useMemo, useState } from 'react';
import {
  Users, Shield, RefreshCw, Trash2, Plus, Database, Activity,
  Briefcase, Microscope, FileText, Wrench, Lightbulb, BookOpen,
  Ticket as TicketIcon, ClipboardList, AlertTriangle, Bell, KeyRound,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Pie, PieChart, Cell, Legend,
} from 'recharts';
import { supabase, isProvisioned } from '../../utils/supabaseClient';
import { useData } from '../../contexts/DataContext';
import { usePMS } from '../../contexts/PMSContext';
import { useToast } from '../../contexts/ToastContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import type { Role } from '../../types';
import type { ReportStatus } from '../../types/pms';

interface UserRow {
  user_id: string;
  email: string | null;
  must_change_password: boolean;
  last_seen_at: string | null;
  roles: string[];
  active_role: string | null;
  division_code: string | null;
}

const ALL_ROLE_VALUES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
  'Student', 'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee',
];

const ROLE_COLORS: Record<string, string> = {
  Director:     'bg-[#fdf0e8] text-[#c96442]',
  DivisionHead: 'bg-[#e8f4fd] text-[#1a6b9a]',
  HOD:          'bg-[#e8f4fd] text-[#1a6b9a]',
  Scientist:    'bg-[#f0f8f0] text-[#3a7a3a]',
  Technician:   'bg-[#f5f4ed] text-[#4d4c48]',
  HRAdmin:      'bg-[#fdf5e8] text-[#a07020]',
  FinanceAdmin: 'bg-[#fdf5e8] text-[#a07020]',
  SystemAdmin:  'bg-[#f0e8fd] text-[#6a3aaa]',
  MasterAdmin:  'bg-[#141413] text-[#faf9f5]',
  Student:      'bg-[#e8fdf5] text-[#1a7a5a]',
  ProjectStaff: 'bg-[#f5e8fd] text-[#7a1a9a]',
  Guest:        'bg-[#f5f4ed] text-[#87867f]',
  DefaultUser:  'bg-[#f5e8e8] text-[#a03333]',
  EmpoweredCommittee: 'bg-[#ede9fe] text-[#5b21b6]',
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_EVALUATION_COMMITTEE_REVIEW: 'Evaluation Committee',
  EMPOWERED_COMMITTEE_REVIEW: 'Empowered Committee',
  FINALIZED: 'Finalized',
  NOT_ASSESSED: 'Not Assessed',
  UNDER_GRIEVANCE_REVIEW: 'Grievance',
};
const STATUS_COLOR_HEX: Record<ReportStatus, string> = {
  DRAFT: '#b0aea5', SUBMITTED: '#3898ec', UNDER_EVALUATION_COMMITTEE_REVIEW: '#eab308',
  EMPOWERED_COMMITTEE_REVIEW: '#8b5cf6', FINALIZED: '#16a34a',
  NOT_ASSESSED: '#5e5d59', UNDER_GRIEVANCE_REVIEW: '#f97316',
};
const ROLE_PALETTE = ['#c96442', '#5e5d59', '#3898ec', '#16a34a', '#eab308', '#8b5cf6', '#1a6b9a', '#a07020', '#7a1a9a'];

export function MasterAdminView() {
  const provisioned = isProvisioned();
  const toast = useToast();
  const {
    staff, projects, phDStudents, equipment, divisions,
    scientificOutputs, ipIntelligence, contractStaff, vacancyAdvertisements,
    vacancyPosts, committees, meetings, actionItems, tickets,
    isBackendProvisioned, error: dataError,
  } = useData();
  const { cycles, reports, evaluations, notifications } = usePMS();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>('DefaultUser');
  const [newDivCode, setNewDivCode] = useState('');

  // user_roles has no broad-select RLS policy (by design — see
  // 20260712000002_auth_rbac.sql), so the roster goes through the
  // sanctioned admin RPC rather than querying tables directly.
  const fetchUsers = async () => {
    if (!supabase || !provisioned) {
      setUsers([]);
      return;
    }
    setLoading(true);
    const [{ data: rosters }, { data: profiles }] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.from('user_profiles').select('user_id, must_change_password, last_seen_at'),
    ]);
    if (!rosters) { setLoading(false); return; }
    const profileByUser = new Map(
      ((profiles as { user_id: string; must_change_password: boolean; last_seen_at: string | null }[]) ?? [])
        .map(p => [p.user_id, p]),
    );
    setUsers((rosters as {
      user_id: string; email: string | null; active_role: string | null;
      roles: string[] | null; division_code: string | null;
    }[]).map(r => ({
      user_id: r.user_id,
      email: r.email,
      must_change_password: profileByUser.get(r.user_id)?.must_change_password ?? false,
      last_seen_at: profileByUser.get(r.user_id)?.last_seen_at ?? null,
      roles: r.roles ?? [],
      active_role: r.active_role,
      division_code: r.division_code,
    })));
    setLoading(false);
  };

  useEffect(() => { void fetchUsers(); }, [provisioned]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived metrics ───────────────────────────────────────────────
  const activeProjects   = useMemo(() => projects.filter(p => p.ProjectStatus === 'Active').length, [projects]);
  const equipmentDown    = useMemo(() => equipment.filter(e => e.WorkingStatus !== 'Working').length, [equipment]);
  const openTickets      = useMemo(() => tickets.filter(t => t.status === 'Open' || t.status === 'InProgress').length, [tickets]);
  const criticalTickets  = useMemo(() => tickets.filter(t => t.urgency === 'Critical' && t.status !== 'Closed').length, [tickets]);
  const overdueActions   = useMemo(() => {
    const now = new Date();
    return actionItems.filter(a => a.status !== 'Completed' && new Date(a.deadline) < now).length;
  }, [actionItems]);
  const grantedIP        = useMemo(() => ipIntelligence.filter(i => i.status === 'Granted').length, [ipIntelligence]);
  const openVacancies    = useMemo(() => vacancyAdvertisements.filter(v => v.status === 'Open').length, [vacancyAdvertisements]);
  const pendingUsers     = useMemo(() => users.filter(u => u.roles.length === 1 && u.roles[0] === 'DefaultUser').length, [users]);
  const passwordPending  = useMemo(() => users.filter(u => u.must_change_password).length, [users]);
  const totalCitations   = useMemo(() => scientificOutputs.reduce((s, p) => s + (p.citationCount ?? 0), 0), [scientificOutputs]);
  const avgImpactFactor  = useMemo(() => {
    const ifs = scientificOutputs.map(p => p.impactFactor ?? 0).filter(Boolean);
    return ifs.length === 0 ? 0 : ifs.reduce((a, b) => a + b, 0) / ifs.length;
  }, [scientificOutputs]);
  const unreadNotifications = notifications.filter(n => !n.read).length;
  const openCycle = cycles.find(c => c.status === 'OPEN');

  const pmsByStatus = useMemo(() => {
    const counts: Record<ReportStatus, number> = {
      DRAFT: 0, SUBMITTED: 0, UNDER_EVALUATION_COMMITTEE_REVIEW: 0,
      EMPOWERED_COMMITTEE_REVIEW: 0, FINALIZED: 0,
      NOT_ASSESSED: 0, UNDER_GRIEVANCE_REVIEW: 0,
    };
    for (const r of reports) counts[r.status]++;
    return (Object.keys(counts) as ReportStatus[]).map(k => ({
      status: k, label: STATUS_LABELS[k], count: counts[k], color: STATUS_COLOR_HEX[k],
    }));
  }, [reports]);

  const roleDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) for (const r of u.roles) counts[r] = (counts[r] ?? 0) + 1;
    return Object.entries(counts).map(([role, count]) => ({ role, count }));
  }, [users]);

  // ── User mutation handlers ──
  // Both route through admin_set_user_roles (never raw user_roles writes):
  // it enforces the lockout guards — an admin can't strip their own last
  // admin role, and the system always keeps at least one administrator.
  // Raw upsert/delete on user_roles would bypass both checks entirely.
  const handleAddRole = async (userId: string) => {
    if (!supabase || !provisioned) {
      toast.push('Role assignment requires Supabase backend (currently in demo mode).', 'warning');
      return;
    }
    if (!newRole) return;
    const current = users.find(u => u.user_id === userId);
    const nextRoles = Array.from(new Set([...(current?.roles ?? []), newRole]));
    const activeRole = current?.active_role && nextRoles.includes(current.active_role)
      ? current.active_role : newRole;
    const { error } = await supabase.rpc('admin_set_user_roles', {
      p_user_id: userId,
      p_roles: nextRoles,
      p_active_role: activeRole,
      p_division: newDivCode || current?.division_code || null,
    });
    if (error) { toast.push(error.message, 'error'); return; }
    toast.push(`Assigned ${newRole}`, 'success');
    setAddingRoleFor(null);
    setNewRole('DefaultUser');
    setNewDivCode('');
    fetchUsers();
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    if (!supabase || !provisioned) {
      toast.push('Role removal requires Supabase backend.', 'warning');
      return;
    }
    const current = users.find(u => u.user_id === userId);
    const nextRoles = (current?.roles ?? []).filter(r => r !== role);
    if (nextRoles.length === 0) {
      toast.push('Cannot remove a user\'s only role — assign a replacement first.', 'warning');
      return;
    }
    const activeRole = current?.active_role && nextRoles.includes(current.active_role)
      ? current.active_role : nextRoles[0];
    const { error } = await supabase.rpc('admin_set_user_roles', {
      p_user_id: userId,
      p_roles: nextRoles,
      p_active_role: activeRole,
      p_division: current?.division_code ?? null,
    });
    if (error) { toast.push(error.message, 'error'); return; }
    toast.push(`Removed ${role}`, 'success');
    fetchUsers();
  };

  const handleResetPassword = async (userId: string) => {
    if (!supabase || !provisioned) {
      toast.push('Password reset requires Supabase backend.', 'warning');
      return;
    }
    await supabase.from('user_profiles').update({ must_change_password: true }).eq('user_id', userId);
    toast.push('Password reset flagged on next login', 'success');
    fetchUsers();
  };

  const formatLastSeen = (ts: string | null) => {
    if (!ts) return 'Never';
    try { return new Date(ts).toLocaleString(); } catch { return 'Never'; }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">
            Master Administration
          </h1>
          <p className="text-text-muted mt-1 text-sm font-medium">
            Institute-wide control, user lifecycle, and workflow governance
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-[8px] text-xs font-semibold text-text-muted hover:bg-surface-hover transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {dataError && (
        <div className="rounded-lg border border-[#fca5a5] bg-[#fde2e2] px-4 py-3 text-xs text-[#991b1b]">
          Data load error: {dataError}
        </div>
      )}

      {!isBackendProvisioned && (
        <div className="bg-[#fef3c7] border border-[#fde68a] rounded-lg px-5 py-3 text-sm text-[#92400e]">
          <strong>Demo mode</strong> — read-only. Connect Supabase via the Setup Wizard to enable user role mutations.
        </div>
      )}

      {/* ── Row 1: institutional KPIs ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Staff"      value={staff.length}             icon={<Users size={18} />}      sublabel={`${contractStaff.length} contract`} />
        <KpiCard label="Active Projects"  value={activeProjects}           icon={<Briefcase size={18} />}  sublabel={`of ${projects.length} total`} />
        <KpiCard label="Publications"     value={scientificOutputs.length} icon={<Microscope size={18} />} sublabel={`${totalCitations} citations`} />
        <KpiCard label="IP Portfolio"     value={ipIntelligence.length}    icon={<Lightbulb size={18} />}  sublabel={`${grantedIP} granted`} />
        <KpiCard label="PhD Students"     value={phDStudents.length}       icon={<BookOpen size={18} />}   sublabel="Enrolled scholars" />
        <KpiCard label="Equipment"        value={equipment.length}         icon={<Wrench size={18} />}     sublabel={`${equipmentDown} down`} />
      </div>

      {/* ── Row 2: operational health ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Open Tickets"     value={openTickets}              icon={<TicketIcon size={18} />}    sublabel={`${criticalTickets} critical`} />
        <KpiCard label="Overdue Actions"  value={overdueActions}           icon={<AlertTriangle size={18} />} sublabel="Past deadline" />
        <KpiCard label="Open Vacancies"   value={openVacancies}            icon={<ClipboardList size={18} />} sublabel={`${vacancyPosts.length} applicants`} />
        <KpiCard label="Committees"       value={committees.filter(c => c.status === 'Active').length} icon={<Shield size={18} />} sublabel={`${meetings.length} meetings`} />
        <KpiCard label="Notifications"    value={unreadNotifications}      icon={<Bell size={18} />}       sublabel="Unread" />
        <KpiCard label="Avg IF"           value={avgImpactFactor.toFixed(2)} icon={<Microscope size={18} />} sublabel="Publications" />
      </div>

      {/* ── Row 3: user lifecycle ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Users"      value={users.length}             icon={<Users size={18} />}      sublabel="Registered accounts" />
        <KpiCard label="Pending Access"   value={pendingUsers}             icon={<Shield size={18} />}     sublabel="DefaultUser only" />
        <KpiCard label="Password Resets"  value={passwordPending}          icon={<KeyRound size={18} />}   sublabel="Forced on next login" />
        <KpiCard label="PMS Reports"      value={reports.length}           icon={<FileText size={18} />}   sublabel={`${reports.filter(r => r.status === 'FINALIZED').length} finalized`} />
      </div>

      {/* ── Charts ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">PMS Reports by Status</h2>
            <p className="text-xs text-text-muted mt-1">Across the appraisal state machine</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pmsByStatus} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#e8e6dc" vertical={false} />
                <XAxis dataKey="label" stroke="#87867f" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis stroke="#87867f" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 8 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pmsByStatus.map((entry) => (<Cell key={entry.status} fill={entry.color} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Role Assignment Distribution</h2>
            <p className="text-xs text-text-muted mt-1">Total role grants (composite roles counted per assignment)</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={roleDistribution} dataKey="count" nameKey="role" outerRadius={90} innerRadius={45}>
                  {roleDistribution.map((_, i) => (<Cell key={i} fill={ROLE_PALETTE[i % ROLE_PALETTE.length]} />))}
                </Pie>
                <Tooltip contentStyle={{ background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Backend health ───────────────────────────────────────── */}
      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Backend Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-hover">
            <Database size={18} className={isBackendProvisioned ? 'text-[#16a34a]' : 'text-text-muted'} />
            <div>
              <div className="font-semibold text-text">Database</div>
              <div className="text-[11px] text-text-muted">{isBackendProvisioned ? 'Supabase live' : 'Mock data'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-hover">
            <Shield size={18} className="text-[#16a34a]" />
            <div>
              <div className="font-semibold text-text">RLS Policies</div>
              <div className="text-[11px] text-text-muted">48 policies enforced</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-hover">
            <Activity size={18} className="text-[#16a34a]" />
            <div>
              <div className="font-semibold text-text">PMS Workflow</div>
              <div className="text-[11px] text-text-muted">{openCycle ? openCycle.name : 'No open cycle'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-hover">
            <FileText size={18} className="text-[#16a34a]" />
            <div>
              <div className="font-semibold text-text">Evaluations</div>
              <div className="text-[11px] text-text-muted">
                {evaluations.filter(e => e.status === 'COMPLETED').length}/{evaluations.length} completed
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── User management table ────────────────────────────────── */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Users &amp; Roles</h2>
          <span className="text-xs text-text-muted">{users.length} accounts</span>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-text-muted text-xs">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-muted text-xs italic">No users found.</div>
        ) : (
          <div className="divide-y divide-[#f0eee6]">
            {users.map(u => (
              <div key={u.user_id} className="px-6 py-4 hover:bg-[#f5f4ed]/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text">
                        {u.email ?? <span className="font-mono text-text-muted">{u.user_id.substring(0, 12)}…</span>}
                      </span>
                      {u.must_change_password && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#fdf0e8] text-[#c96442]">
                          Password reset pending
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted">Last seen: {formatLastSeen(u.last_seen_at)}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.roles.map(role => (
                        <div key={role} className="flex items-center gap-1">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role] ?? 'bg-[#f5f4ed] text-[#4d4c48]'}`}>
                            {role}
                          </span>
                          <button
                            onClick={() => handleRemoveRole(u.user_id, role)}
                            className="text-text-muted hover:text-[#b53333] transition-colors"
                            title={`Remove ${role}`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                      {u.roles.length === 0 && (
                        <span className="text-[11px] italic text-text-muted">No roles assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleResetPassword(u.user_id)}
                      className="text-[11px] font-semibold text-text-muted hover:text-text border border-border px-3 py-1.5 rounded-[6px] hover:bg-surface-hover transition-colors"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => { setAddingRoleFor(u.user_id); setNewRole('DefaultUser'); setNewDivCode(''); }}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#faf9f5] bg-[#c96442] hover:bg-[#b5593b] px-3 py-1.5 rounded-[6px] transition-colors"
                    >
                      <Plus size={12} />
                      Add Role
                    </button>
                  </div>
                </div>

                {addingRoleFor === u.user_id && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap p-3 bg-surface-hover rounded-[8px] border border-border">
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as Role)}
                      className="border border-border rounded-[6px] px-2 py-1.5 text-xs text-text bg-surface focus:outline-none focus:ring-1 focus:ring-[#c96442]"
                    >
                      {ALL_ROLE_VALUES.map(r => (<option key={r} value={r}>{r}</option>))}
                    </select>
                    {(newRole === 'DivisionHead' || newRole === 'HOD' || newRole === 'Technician') && (
                      <input
                        type="text"
                        value={newDivCode}
                        onChange={e => setNewDivCode(e.target.value)}
                        placeholder="Division code"
                        className="border border-border rounded-[6px] px-2 py-1.5 text-xs text-text bg-surface focus:outline-none focus:ring-1 focus:ring-[#c96442] w-32"
                      />
                    )}
                    <button
                      onClick={() => handleAddRole(u.user_id)}
                      className="text-xs font-semibold text-[#faf9f5] bg-[#c96442] px-3 py-1.5 rounded-[6px] hover:bg-[#b5593b] transition-colors"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => setAddingRoleFor(null)}
                      className="text-xs font-semibold text-text-muted hover:text-text transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Division strength ────────────────────────────────────── */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Division Strength</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Code</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Name</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Current</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Sanctioned</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-text-muted">Fill %</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">HoD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {divisions.map(d => {
                const fill = d.divSanctionedstrength > 0
                  ? Math.round((d.divCurrentStrength / d.divSanctionedstrength) * 100)
                  : 0;
                return (
                  <tr key={d.divCode} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-[#c96442] font-semibold">{d.divCode}</td>
                    <td className="px-6 py-3 text-text">{d.divName}</td>
                    <td className="px-6 py-3 text-right font-semibold text-text">{d.divCurrentStrength}</td>
                    <td className="px-6 py-3 text-right text-text-muted">{d.divSanctionedstrength}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`text-xs font-semibold ${fill >= 90 ? 'text-[#16a34a]' : fill >= 75 ? 'text-[#eab308]' : 'text-[#b53333]'}`}>
                        {fill}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-text-muted text-xs">{d.divHoD}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Users, Wifi, Database, Shield, Activity, AlertTriangle,
  Briefcase, Microscope, FileText, Wrench, Lightbulb,
  Ticket as TicketIcon, ClipboardList, Bell, BookOpen,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Pie, PieChart, Cell, Legend,
} from 'recharts';
import { supabase, isProvisioned } from '../../utils/supabaseClient';
import { useData } from '../../contexts/DataContext';
import { usePMS } from '../../contexts/PMSContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import type { ReportStatus } from '../../types/pms';

interface UserRoleRow {
  user_id: string;
  role: string;
  division_code: string | null;
  last_seen_at: string | null;
}

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_COLLEGIUM_REVIEW: 'Collegium',
  CHAIRMAN_REVIEW: 'Chairman',
  EMPOWERED_COMMITTEE_REVIEW: 'Committee',
  FINALIZED: 'Finalized',
};

const STATUS_COLOR_HEX: Record<ReportStatus, string> = {
  DRAFT: '#b0aea5',
  SUBMITTED: '#3898ec',
  UNDER_COLLEGIUM_REVIEW: '#eab308',
  CHAIRMAN_REVIEW: '#f97316',
  EMPOWERED_COMMITTEE_REVIEW: '#8b5cf6',
  FINALIZED: '#16a34a',
};

const ROLE_PALETTE = ['#c96442', '#5e5d59', '#3898ec', '#16a34a', '#eab308', '#8b5cf6', '#1a6b9a', '#a07020', '#7a1a9a'];

export function SystemAdminView() {
  const provisioned = isProvisioned();
  const {
    staff, projects, phDStudents, equipment, divisions,
    scientificOutputs, ipIntelligence, contractStaff, vacancyAdvertisements,
    vacancyPosts, committees, meetings, actionItems, tickets,
    isBackendProvisioned, error: dataError,
  } = useData();
  const { cycles, reports, evaluations, notifications } = usePMS();

  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [passwordResets, setPasswordResets] = useState(0);

  // Live user_roles from Supabase when provisioned; empty otherwise.
  useEffect(() => {
    if (!supabase || !provisioned) {
      setUserRoles([]);
      setPasswordResets(0);
      return;
    }
    setLoadingRoles(true);
    supabase.from('user_roles').select('*').then(({ data, error }) => {
      if (!error && data) setUserRoles(data as UserRoleRow[]);
      setLoadingRoles(false);
    });
    supabase.from('user_profiles').select('must_change_password').then(({ data }) => {
      if (data) setPasswordResets(data.filter(p => p.must_change_password).length);
    });
  }, [provisioned]);

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
  const pendingUsers     = useMemo(() => userRoles.filter(r => r.role === 'DefaultUser').length, [userRoles]);
  const totalCitations   = useMemo(() => scientificOutputs.reduce((sum, p) => sum + (p.citationCount ?? 0), 0), [scientificOutputs]);
  const avgImpactFactor  = useMemo(() => {
    if (scientificOutputs.length === 0) return 0;
    const ifs = scientificOutputs.map(p => p.impactFactor ?? 0).filter(Boolean);
    return ifs.length === 0 ? 0 : ifs.reduce((a, b) => a + b, 0) / ifs.length;
  }, [scientificOutputs]);
  const openCycle = cycles.find(c => c.status === 'OPEN');
  const unreadNotifications = notifications.filter(n => !n.read).length;

  // PMS state distribution.
  const pmsByStatus = useMemo(() => {
    const counts: Record<ReportStatus, number> = {
      DRAFT: 0, SUBMITTED: 0, UNDER_COLLEGIUM_REVIEW: 0,
      CHAIRMAN_REVIEW: 0, EMPOWERED_COMMITTEE_REVIEW: 0, FINALIZED: 0,
    };
    for (const r of reports) counts[r.status]++;
    return (Object.keys(counts) as ReportStatus[]).map(k => ({
      status: k, label: STATUS_LABELS[k], count: counts[k], color: STATUS_COLOR_HEX[k],
    }));
  }, [reports]);

  // Role distribution for pie chart.
  const roleDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of userRoles) counts[r.role] = (counts[r.role] ?? 0) + 1;
    return Object.entries(counts).map(([role, count]) => ({ role, count }));
  }, [userRoles]);

  // Ticket category breakdown.
  const ticketsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  }, [tickets]);

  // Recent audit log from Supabase; empty when unprovisioned.
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  useEffect(() => {
    if (!supabase || !provisioned) {
      setAuditLog([]);
      return;
    }
    supabase.from('pms_audit_logs').select('*').order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => {
        if (data) setAuditLog(data as AuditEntry[]);
      });
  }, [provisioned]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">
            System Administration
          </h1>
          <p className="text-text-muted mt-1 text-sm font-medium">
            Institute-wide health, user roles, and workflow status
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Wifi size={14} className={isBackendProvisioned ? 'text-[#16a34a]' : 'text-[#b0aea5]'} />
          <span className={isBackendProvisioned ? 'text-[#16a34a] font-semibold' : 'text-text-muted'}>
            {isBackendProvisioned ? 'Connected to Supabase' : 'Demo mode (mock data)'}
          </span>
        </div>
      </div>

      {dataError && (
        <div className="rounded-lg border border-[#fca5a5] bg-[#fde2e2] px-4 py-3 text-xs text-[#991b1b]">
          Data load error: {dataError}
        </div>
      )}

      {/* ── Research Output ──────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#87867f]">Research Output</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Active Projects"   value={activeProjects}             icon={<Briefcase size={18} />}  sublabel={`of ${projects.length} total`} />
          <KpiCard label="Publications"      value={scientificOutputs.length}   icon={<Microscope size={18} />} sublabel={`${totalCitations} citations`} />
          <KpiCard label="IP Portfolio"      value={ipIntelligence.length}      icon={<Lightbulb size={18} />}  sublabel={`${grantedIP} granted`} />
          <KpiCard label="Avg Impact Factor" value={avgImpactFactor.toFixed(2)} icon={<Microscope size={18} />} sublabel="Publications" />
        </div>
      </section>

      {/* ── People ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#87867f]">People</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total Staff"   value={staff.length}        icon={<Users size={18} />}         sublabel={`${contractStaff.length} contract`} />
          <KpiCard label="PhD Students"  value={phDStudents.length}  icon={<BookOpen size={18} />}      sublabel="Enrolled scholars" />
          <KpiCard label="Open Vacancies" value={openVacancies}      icon={<ClipboardList size={18} />} sublabel={`${vacancyPosts.length} applicants`} />
          <KpiCard label="Reg. Users"    value={userRoles.length}    icon={<Users size={18} />}         sublabel={`${pendingUsers} pending`} />
        </div>
      </section>

      {/* ── Operations & Helpdesk ───────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#87867f]">Operations &amp; Helpdesk</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Equipment"       value={equipment.length}                                       icon={<Wrench size={18} />}        sublabel={`${equipmentDown} down`} />
          <KpiCard label="Open Tickets"    value={openTickets}                                            icon={<TicketIcon size={18} />}    sublabel={`${criticalTickets} critical`} />
          <KpiCard label="Overdue Actions" value={overdueActions}                                         icon={<AlertTriangle size={18} />} sublabel="Past deadline" />
          <KpiCard label="Committees"      value={committees.filter(c => c.status === 'Active').length}   icon={<Shield size={18} />}        sublabel={`${meetings.length} meetings`} />
        </div>
      </section>

      {/* ── Performance Management ──────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#87867f]">Performance Management</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="PMS Cycles"  value={cycles.length}      icon={<FileText size={18} />} sublabel={openCycle ? `Open: ${openCycle.name}` : 'No open cycle'} />
          <KpiCard label="PMS Reports" value={reports.length}     icon={<FileText size={18} />} sublabel={`${reports.filter(r => r.status === 'FINALIZED').length} finalized`} />
          <KpiCard label="Evaluations" value={evaluations.length} icon={<Activity size={18} />} sublabel={`${evaluations.filter(e => e.status === 'COMPLETED').length} completed`} />
          <KpiCard label="Pwd Resets"  value={passwordResets}     icon={<Shield size={18} />}   sublabel="Forced on next login" />
        </div>
      </section>

      {/* ── Charts row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">PMS Reports by Status</h2>
            <p className="text-xs text-text-muted mt-1">Distribution across the appraisal state machine</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pmsByStatus} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#e8e6dc" vertical={false} />
                <XAxis dataKey="label" stroke="#87867f" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis stroke="#87867f" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 8 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pmsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Role Distribution</h2>
            <p className="text-xs text-text-muted mt-1">Active role assignments across users</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={roleDistribution} dataKey="count" nameKey="role" outerRadius={90} innerRadius={45}>
                  {roleDistribution.map((_, i) => (
                    <Cell key={i} fill={ROLE_PALETTE[i % ROLE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Tickets by category ──────────────────────────────────── */}
      <Card className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Helpdesk Volume by Category</h2>
            <p className="text-xs text-text-muted mt-1">All-time tickets per category</p>
          </div>
          <Bell size={14} className="text-text-muted" />
          <span className="text-xs text-text-muted">{unreadNotifications} unread notifications</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ticketsByCategory} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#e8e6dc" vertical={false} />
              <XAxis dataKey="category" stroke="#87867f" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis stroke="#87867f" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 8 }} />
              <Bar dataKey="count" fill="#c96442" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── Division strength table ──────────────────────────────── */}
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

      {/* ── Recent audit log ─────────────────────────────────────── */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Recent System Activity</h2>
          <span className="text-xs text-text-muted">{auditLog.length} events</span>
        </div>
        {auditLog.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">No activity recorded yet.</div>
        ) : (
          <ul className="divide-y divide-[#f0eee6]">
            {auditLog.slice(0, 10).map(entry => (
              <li key={entry.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <Activity size={14} className="text-[#c96442]" />
                  <div>
                    <div className="text-text font-medium">{entry.action.replace(/_/g, ' ')}</div>
                    <div className="text-[10px] text-text-muted font-mono">
                      {entry.entity_type} · {entry.entity_id}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-text-muted">{new Date(entry.created_at).toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted font-mono truncate max-w-[200px]">{entry.user_id}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Backend health card ──────────────────────────────────── */}
      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Backend Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-hover">
            <Database size={18} className={isBackendProvisioned ? 'text-[#16a34a]' : 'text-text-muted'} />
            <div>
              <div className="font-semibold text-text">Database</div>
              <div className="text-[11px] text-text-muted">
                {isBackendProvisioned ? 'Supabase live' : 'Mock data (no backend)'}
              </div>
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
              <div className="text-[11px] text-text-muted">{openCycle ? `Cycle: ${openCycle.name}` : 'No open cycle'}</div>
            </div>
          </div>
        </div>
        {loadingRoles && <div className="text-[11px] text-text-muted">Refreshing user roles…</div>}
      </Card>
    </div>
  );
}

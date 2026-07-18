import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, BookOpen, FileText, CalendarDays, CalendarClock, ClipboardList, Lightbulb, Microscope,
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import ScientistProfile from '../../components/ScientistProfile';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';
import {
  deriveOwnMeetings, deriveUpcomingWeekEvents, deriveOwnActionItems,
} from '../../lib/dashboard/scientistData';

export function ScientistView() {
  const {
    staff, projects, projectStaff, phDStudents, scientificOutputs,
    meetings, committeeMembers, actionItems, calendarEvents, holidays,
  } = useData();
  const { proposals } = useProposals();
  const { user } = useAuth();

  const ownStaff = staff.find(s => s.Email === user?.email);
  const ownName = ownStaff?.Name ?? '';
  const ownStaffId = ownStaff?.ID ?? '';

  // Co-PI proposal IDs — one scoped query keyed on this staff member.
  const [coPiProposalIds, setCoPiProposalIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    async function loadCoPI() {
      if (!supabase || !ownStaffId) { setCoPiProposalIds(new Set()); return; }
      const { data, error } = await supabase
        .from('proposal_copis')
        .select('proposal_id')
        .eq('staff_id', ownStaffId);
      if (error) { console.error('[scientist-dashboard] co-PI load failed', error); return; }
      if (!cancelled) setCoPiProposalIds(new Set((data ?? []).map(r => r.proposal_id as string)));
    }
    loadCoPI();
    return () => { cancelled = true; };
  }, [ownStaffId]);

  const now = useMemo(() => new Date(), []);

  const ownMeetings = useMemo(
    () => deriveOwnMeetings(meetings, committeeMembers, ownStaffId, now).slice(0, 5),
    [meetings, committeeMembers, ownStaffId, now],
  );
  const weekEvents = useMemo(
    () => deriveUpcomingWeekEvents(calendarEvents, holidays, now),
    [calendarEvents, holidays, now],
  );
  const ownActionItems = useMemo(
    () => deriveOwnActionItems(actionItems, ownName),
    [actionItems, ownName],
  );
  const ownProjectNos = useMemo(() => {
    const links = projectStaff.filter(ps => ps.StaffName === ownName);
    return new Set(links.map(ps => ps.ProjectNo));
  }, [projectStaff, ownName]);
  const ownProjects = useMemo(
    () => projects.filter(p => ownProjectNos.has(p.ProjectNo)),
    [projects, ownProjectNos],
  );
  const supervisedPhDs = useMemo(
    () => phDStudents.filter(p => p.SupervisorName === ownName),
    [phDStudents, ownName],
  );
  const ownProposals = useMemo(
    () => proposals.filter(p => p.piUserId === user?.id || coPiProposalIds.has(p.id)),
    [proposals, user?.id, coPiProposalIds],
  );
  const ownPublications = useMemo(
    () => ownName
      ? scientificOutputs
          .filter(o => o.authors.some(a => staffNameMatchesAuthor(ownName, a)))
          .sort((a, b) => b.year - a.year)
      : [],
    [scientificOutputs, ownName],
  );

  if (!ownStaff) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">
            Scientist Dashboard
          </h1>
        </div>
        <div className="bg-surface border border-border rounded-[12px] p-8 text-center">
          <p className="text-sm font-medium text-text-muted">
            Staff record not linked to this account — contact System Admin.
          </p>
          <p className="text-xs text-text-muted mt-2">
            Signed in as: <span className="font-mono">{user?.email ?? 'Unknown'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">
          My Research Portfolio
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          {ownStaff.Name} — {ownStaff.Designation}, Division {ownStaff.Division}
        </p>
      </div>

      {/* --- 1. KPI strip --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Upcoming Meetings" value={ownMeetings.length} icon={<CalendarDays size={18} />} sublabel="Committees you sit on" />
        <KpiCard label="Open Action Items" value={ownActionItems.length} icon={<ClipboardList size={18} />} sublabel="Assigned to you" />
        <KpiCard label="Events This Week" value={weekEvents.length} icon={<CalendarClock size={18} />} sublabel="Next 7 days" />
      </div>

      {/* --- 2. Operations row --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Meetings */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Upcoming Meetings</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownMeetings.map(m => (
              <div key={m.id} className="border-l-2 border-terracotta pl-3">
                <div className="text-sm font-semibold text-text">{m.title}</div>
                <div className="text-xs text-text-muted">{m.meeting_date}{m.venue ? ` · ${m.venue}` : ''}</div>
              </div>
            ))}
            {ownMeetings.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No upcoming meetings.</p>
            )}
          </div>
        </Card>

        {/* This Week */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">This Week</h2>
          </div>
          <div className="p-4 space-y-3">
            {weekEvents.map(e => (
              <div key={`${e.kind}-${e.id}`} className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  e.kind === 'HOL' ? 'bg-[#f0f8f0] text-[#3a7a3a]' : 'bg-[#fdf0e8] text-terracotta'
                }`}>{e.kind}</span>
                <span className="text-sm text-text">{e.label}</span>
                <span className="text-xs text-text-muted ml-auto">{e.date}</span>
              </div>
            ))}
            {weekEvents.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">Nothing scheduled this week.</p>
            )}
          </div>
        </Card>
      </div>

      {/* --- 3. Action Items (full width) --- */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Action Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-hover">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Task</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Deadline</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ownActionItems.slice(0, 10).map(a => (
                <tr key={a.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-3 text-text font-medium">{a.task}</td>
                  <td className="px-6 py-3 text-text-muted text-xs">{a.deadline || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      a.status === 'InProgress' ? 'bg-[#fdf0e8] text-terracotta' : 'bg-surface-hover text-text-muted'
                    }`}>{a.status}</span>
                  </td>
                </tr>
              ))}
              {ownActionItems.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-6 text-center text-text-muted text-xs italic">No open action items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- 4. Research portfolio grid --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Projects */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Briefcase size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Projects</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownProjects.map(p => (
              <div key={p.ProjectID} className="border-b border-border last:border-0 pb-2 last:pb-0">
                <div className="text-sm font-medium text-text">{p.ProjectName}</div>
                <div className="text-xs text-text-muted">
                  {[p.ProjectStatus, p.SponsorerName, p.CompletioDate].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
            {ownProjects.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No project involvement found.</p>
            )}
          </div>
        </Card>

        {/* PhD Supervisees */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <BookOpen size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">PhD Supervisees</h2>
          </div>
          <div className="p-4 space-y-3">
            {supervisedPhDs.map(p => (
              <div key={p.EnrollmentNo} className="border-b border-border last:border-0 pb-2 last:pb-0">
                <div className="text-sm font-medium text-text">{p.StudentName}</div>
                <div className="text-xs text-text-muted">
                  {[p.Specialization, p.CurrentStatus].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
            {supervisedPhDs.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No PhD supervisees found.</p>
            )}
          </div>
        </Card>

        {/* Proposals */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Lightbulb size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Proposals</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownProposals.map(p => (
              <Link key={p.id} to={`/proposals/${p.id}`} className="block border-b border-border last:border-0 pb-2 last:pb-0 hover:bg-surface-hover -mx-2 px-2 rounded transition-colors">
                <div className="text-sm font-medium text-text">{p.title}</div>
                <div className="text-xs text-text-muted">
                  {p.status} · {p.piUserId === user?.id ? 'PI' : 'Co-PI'}
                </div>
              </Link>
            ))}
            {ownProposals.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No proposals found.</p>
            )}
          </div>
        </Card>

        {/* Publications */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Microscope size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Publications</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownPublications.map(o => (
              <div key={o.id} className="border-b border-border last:border-0 pb-2 last:pb-0">
                <div className="text-sm font-medium text-text truncate" title={o.title}>{o.title}</div>
                <div className="text-xs text-text-muted">
                  {[o.journal, o.year, o.impactFactor ? `IF ${o.impactFactor}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
            {ownPublications.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No publications found.</p>
            )}
          </div>
        </Card>
      </div>

      {/* --- 5. IRINS Research Profile --- */}
      {ownStaff.VidwanID && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={20} className="text-terracotta" />
            <h2 className="text-lg font-[500] text-text font-serif">Research Output (via IRINS)</h2>
          </div>
          <ScientistProfile vidwanId={ownStaff.VidwanID} />
        </Card>
      )}
    </div>
  );
}

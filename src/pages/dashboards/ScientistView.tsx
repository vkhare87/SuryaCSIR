import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Building2, Check, CheckCircle2, Clock, FolderKanban, Lightbulb,
  Plus, Search, Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { Card } from '../../components/ui/Cards';
import { DoFirstStrip } from '../../components/home/common/DoFirstStrip';
import { canSnoozeForTomorrow } from '../../lib/home/doNext';
import { timerRingRatio } from '../../lib/home/division';
import {
  deriveOwnActionItems,
  deriveOwnMeetings,
  deriveUpcomingWeekEvents,
} from '../../lib/dashboard/scientistData';

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function ScientistView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    projects, projectStaff, phDStudents, meetings, committeeMembers,
    actionItems, calendarEvents, holidays,
  } = useData();
  const { proposals } = useProposals();
  const {
    ownStaff, ownStaffId, todayIso, actions, doNext, quickWins, groupCounts,
    todayProgress, greeting, snoozeTomorrow, markDoneToday, registerClaimedKeys,
    coPiProposalIds, milestonesByProject, reportTimers: liveReportTimers, onTimeRecord,
  } = useHome();

  const [query, setQuery] = useState('');
  const ownName = ownStaff?.Name ?? '';

  const now = useMemo(() => new Date(), []);
  const ownMeetings = useMemo(
    () => (ownStaffId ? deriveOwnMeetings(meetings, committeeMembers, ownStaffId, now).slice(0, 5) : []),
    [meetings, committeeMembers, ownStaffId, now],
  );
  const ownActionItems = useMemo(
    () => deriveOwnActionItems(actionItems, ownName, ownStaffId).slice(0, 5),
    [actionItems, ownName, ownStaffId],
  );
  const weekEvents = useMemo(
    () => deriveUpcomingWeekEvents(calendarEvents, holidays, now),
    [calendarEvents, holidays, now],
  );

  // Claim items displayed on the left so CommonDesk does not repeat them.
  useEffect(() => {
    const keys: string[] = [];
    if (doNext) keys.push(doNext.id);
    for (const q of quickWins.slice(0, 5)) keys.push(q.id);
    for (const m of ownMeetings) keys.push(`meeting-${m.id}`);
    registerClaimedKeys(keys);
  }, [doNext, quickWins, ownMeetings, registerClaimedKeys]);

  const ownProjects = useMemo(() => {
    if (!ownName) return [];
    const teamNos = new Set(
      projectStaff.filter((ps) => ps.StaffName === ownName).map((ps) => ps.ProjectNo),
    );
    return projects.filter(
      (p) => p.PrincipalInvestigator === ownName || teamNos.has(p.ProjectNo),
    );
  }, [projects, projectStaff, ownName]);

  const supervisedPhDs = useMemo(
    () => (ownName ? phDStudents.filter((s) => s.SupervisorName === ownName) : []),
    [phDStudents, ownName],
  );
  const ownProjectStaff = useMemo(() => {
    const nos = new Set(ownProjects.map((p) => p.ProjectNo));
    return projectStaff.filter((ps) => nos.has(ps.ProjectNo));
  }, [projectStaff, ownProjects]);

  const reportTimers = useMemo(() => {
    if (liveReportTimers && liveReportTimers.length > 0) {
      return liveReportTimers.slice(0, 6).map((rt, idx) => ({
        id: `rt-${idx}-${rt.subject}`,
        label: rt.subject,
        detail: rt.draftReady ? `Draft ready · ${rt.linesLeft} line${rt.linesLeft === 1 ? '' : 's'} left` : `Not started · ${rt.linesLeft} lines left`,
        due: rt.dueDate,
        link: rt.link,
      }));
    }
    return actions
      .filter((a) => a.kind === 'progress-report' || a.kind === 'pms-draft' || a.kind === 'project-closure')
      .slice(0, 6);
  }, [liveReportTimers, actions]);
  const ownProposalsCount = useMemo(
    () => proposals.filter((p) => p.piUserId === user?.id || coPiProposalIds.has(p.id)).length,
    [proposals, user?.id, coPiProposalIds],
  );

  const sevenDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(todayIso, i);
      const count = weekEvents.filter((e) => e.date === iso).length;
      const [yy, mm, dd] = iso.split('-').map(Number);
      const label = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' });
      return { iso, label, count };
    }),
    [todayIso, weekEvents],
  );

  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - todayProgress.pct / 100);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/ask?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Today ring + Fraunces greeting */}
      <section aria-label="Today summary" className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div
            className="relative w-12 h-12 shrink-0 flex items-center justify-center"
            aria-label={`Today progress: ${todayProgress.done} of ${todayProgress.total} complete`}
          >
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
              <circle
                cx="22" cy="22" r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                className="text-border"
              />
              <circle
                cx="22" cy="22" r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringDashOffset}
                className="text-archive-green transition-all"
              />
            </svg>
            <span className="absolute text-[11px] font-mono tabular-nums font-semibold text-text">
              {todayProgress.done}/{todayProgress.total}
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text leading-snug">
              {greeting}
            </h1>
            <p className="text-xs text-text-muted mt-0.5 font-mono tabular-nums">
              {ownProposalsCount} proposal{ownProposalsCount === 1 ? '' : 's'} · {ownProjects.length} project{ownProjects.length === 1 ? '' : 's'}
              {onTimeRecord && onTimeRecord.total_count > 0 ? ` · ${onTimeRecord.on_time_count} of ${onTimeRecord.total_count} reports on time this year` : ''}
            </p>
          </div>
        </div>
      </section>

      {/* 2. Ask SURYA & quick starts */}
      <section aria-label="Ask and start" className="flex flex-wrap items-center gap-2">
        <form onSubmit={onSearchSubmit} className="flex-1 min-w-[220px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask SURYA or search institute knowledge…"
            aria-label="Ask SURYA"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-blue"
          />
        </form>
        <Link
          to="/proposals/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-medium text-text hover:bg-surface-hover"
        >
          <Plus size={14} /> New idea
        </Link>
        <Link
          to="/helpdesk/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-medium text-text hover:bg-surface-hover"
        >
          <Plus size={14} /> Raise a request
        </Link>
      </section>

      {/* SH3: Do first (priorities pinned by seniors) */}
      <DoFirstStrip />

      {/* 3. Do next — single strong terracotta CTA on the page */}
      <section aria-label="Regular work">
        {doNext ? (
          <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-muted font-mono tabular-nums">
                <span className="uppercase tracking-wider font-sans font-semibold">Do this next</span>
                <span>·</span>
                <span>~{doNext.minutes} min</span>
                {doNext.due && (
                  <>
                    <span>·</span>
                    <span className={doNext.due < todayIso ? 'text-danger font-semibold' : ''}>
                      {doNext.due < todayIso ? `Overdue (${doNext.due})` : `Due ${doNext.due}`}
                    </span>
                  </>
                )}
              </div>
              <p className="text-base font-semibold text-text">{doNext.label}</p>
              <p className="text-xs text-text-muted">
                {doNext.detail} — {doNext.consequence}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={doNext.link}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-sm font-semibold transition-colors"
              >
                Open <ArrowRight size={15} />
              </Link>
              {canSnoozeForTomorrow(doNext, todayIso) && (
                <button
                  type="button"
                  onClick={() => snoozeTomorrow(doNext)}
                  className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-text-muted hover:text-text hover:bg-surface-hover"
                >
                  Tomorrow
                </button>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-5 flex items-center gap-3 text-sm text-text-muted">
            <CheckCircle2 size={18} className="text-archive-green shrink-0" />
            <span>You are caught up — nothing urgent is waiting in your regular queue.</span>
          </Card>
        )}
      </section>

      {/* 4. Quick wins + This week */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Quick wins (≤ 2 min)
            </h2>
            <span className="text-xs font-mono tabular-nums text-text-muted">{quickWins.length}</span>
          </div>
          {quickWins.length === 0 ? (
            <p className="text-xs text-text-muted">No quick confirmations waiting right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {quickWins.slice(0, 5).map((item) => (
                <li key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                  <Link to={item.link} className="text-xs font-medium text-text hover:underline truncate">
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => markDoneToday(item.id)}
                    aria-label={`Mark ${item.label} done today`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-[11px] font-medium text-text-muted hover:text-text hover:bg-surface-hover shrink-0"
                  >
                    <Check size={12} /> Done
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              This week · by type
            </h2>
            <span className="text-xs font-mono tabular-nums text-text-muted">
              R {groupCounts.research} · A {groupCounts.admin} · C {groupCounts.committee}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {sevenDays.map((d) => (
              <Link
                key={d.iso}
                to="/calendar"
                className={`rounded-lg py-2 text-xs font-mono tabular-nums border transition-colors ${
                  d.iso === todayIso
                    ? 'border-border bg-surface-hover text-text font-semibold'
                    : 'border-transparent text-text-muted hover:bg-surface-hover'
                }`}
              >
                <div>{d.label}</div>
                <div className="text-[10px] mt-0.5">{d.count > 0 ? `${d.count}●` : '·'}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* 5. Report timers */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Clock size={13} /> Report timers
          </h2>
          <Link to="/reports" className="text-xs text-text-muted hover:text-text hover:underline">
            All reports
          </Link>
        </div>
        {reportTimers.length === 0 ? (
          <p className="text-xs text-text-muted">No reports due right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {reportTimers.map((r) => {
              const ring = timerRingRatio(r.due, todayIso);
              return (
                <Link
                  key={r.id}
                  to={r.link}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text truncate">{r.label}</p>
                    <p className="text-[11px] text-text-muted truncate">{r.detail}</p>
                  </div>
                  <span
                    className={`font-mono tabular-nums text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                      ring.overdue
                        ? 'border-danger/40 text-danger'
                        : 'border-border text-text-muted'
                    }`}
                  >
                    {ring.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* 6. Committees & Committee tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <Building2 size={13} /> Committees coming up
            </h2>
            <Link to="/committees" className="text-xs text-text-muted hover:text-text hover:underline">
              All
            </Link>
          </div>
          {ownMeetings.length === 0 ? (
            <p className="text-xs text-text-muted">No upcoming meetings on your committees.</p>
          ) : (
            <ul className="space-y-2">
              {ownMeetings.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <Link to={`/committees/${m.committee_id}/meetings/${m.id}`} className="text-text hover:underline truncate">
                    {m.title}
                  </Link>
                  <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">
                    {m.meeting_date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Committee tasks on me
          </h2>
          {ownActionItems.length === 0 ? (
            <p className="text-xs text-text-muted">No open committee tasks assigned to you.</p>
          ) : (
            <ul className="space-y-2">
              {ownActionItems.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-text truncate">{item.task}</span>
                  <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">
                    {item.deadline}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 7. My projects (milestone tracks) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <FolderKanban size={13} /> My projects · milestones
          </h2>
          <Link to="/projects" className="text-xs text-text-muted hover:text-text hover:underline">
            All projects
          </Link>
        </div>
        {ownProjects.length === 0 ? (
          <p className="text-xs text-text-muted">No projects linked to your staff profile yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {ownProjects.slice(0, 5).map((p) => {
              const ms = milestonesByProject[p.ProjectID] ?? [];
              const achieved = ms.filter((m) => m.status === 'ACHIEVED').length;
              return (
                <div key={p.ProjectID} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/projects/${encodeURIComponent(p.ProjectID)}`} className="text-xs font-semibold text-text hover:underline truncate block">
                      <span className="font-mono text-text-muted mr-1.5">{p.ProjectNo}</span>
                      {p.ProjectName}
                    </Link>
                    <p className="text-[11px] text-text-muted font-mono tabular-nums mt-0.5">
                      {ms.length > 0 ? `${achieved}/${ms.length} milestones achieved` : p.ProjectStatus}
                    </p>
                  </div>
                  <Link
                    to={`/projects/${encodeURIComponent(p.ProjectID)}`}
                    className="text-xs text-text-muted hover:text-text hover:underline shrink-0"
                  >
                    Open file
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 8. Waiting in offices & My team */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Lightbulb size={13} /> Waiting in offices
          </h2>
          <p className="text-xs text-text-muted">
            Office stage tracking (purchase, bills, hiring) is not connected yet.
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Users size={13} /> My team
          </h2>
          {supervisedPhDs.length === 0 && ownProjectStaff.length === 0 ? (
            <p className="text-xs text-text-muted">No PhD scholars or project staff linked yet.</p>
          ) : (
            <p className="text-xs text-text font-mono tabular-nums">
              {supervisedPhDs.length} PhD scholar{supervisedPhDs.length === 1 ? '' : 's'} · {ownProjectStaff.length} project staff
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

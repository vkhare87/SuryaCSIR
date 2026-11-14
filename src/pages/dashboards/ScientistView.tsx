import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lightbulb, LifeBuoy, Search } from 'lucide-react';
import clsx from 'clsx';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { deriveOwnMeetings, deriveOwnActionItems } from '../../lib/dashboard/scientistData';
import { dueUrgency } from '../../lib/dashboard/myActions';
import type { MyAction } from '../../lib/dashboard/myActions';
import { classify, countByGroup } from '../../lib/home/classify';
import { doNext, quickWins } from '../../lib/home/doNext';
import { greeting } from '../../lib/home/greeting';
import { daysUntil, localIso, weekStrip } from '../../lib/home/today';
import type { DayMark } from '../../lib/home/today';
import { milestonesFor } from '../../lib/home/api';
import type { HomeMilestone } from '../../lib/home/api';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';

const BLOCK_TITLE = 'text-xs font-medium text-text-muted mb-3 flex items-center justify-between gap-2';
const ROW = 'flex items-center gap-3 py-2.5 border-t border-border first:border-t-0';

function dueText(due: string | null, now: Date): { text: string; variant: 'danger' | 'warning' | 'neutral' } | null {
  if (!due) return null;
  const days = daysUntil(due, now);
  if (days < 0) return { text: `${-days} d late`, variant: 'danger' };
  if (days === 0) return { text: 'today', variant: 'warning' };
  return { text: `${days} d`, variant: dueUrgency(due, now) === 'soon' ? 'warning' : 'neutral' };
}

function TodayRing({ done, total }: { done: number; total: number }) {
  const circumference = 151;
  const share = total === 0 ? 1 : done / total;
  return (
    <svg width="60" height="60" viewBox="0 0 58 58" role="img" aria-label={`${done} of ${total} done today`} className="shrink-0">
      <circle cx="29" cy="29" r="24" fill="none" strokeWidth="5" className="stroke-border" />
      <circle
        cx="29" cy="29" r="24" fill="none" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={Math.round(circumference * (1 - share))}
        transform="rotate(-90 29 29)" className="stroke-archive-green"
      />
      <text x="29" y="33" textAnchor="middle" className="fill-text font-mono text-[13px]">{done}/{total}</text>
    </svg>
  );
}

function MilestoneTrack({ milestones, today }: { milestones: HomeMilestone[]; today: string }) {
  const live = milestones.filter(m => m.status !== 'DROPPED');
  if (live.length === 0) return <p className="text-xs text-text-muted">No milestones on file.</p>;
  return (
    <div className="flex items-center" role="img"
      aria-label={`${live.filter(m => m.status === 'ACHIEVED').length} of ${live.length} milestones achieved`}>
      {live.map((m, i) => {
        const late = (m.status === 'PLANNED' || m.status === 'PROPOSED') && m.targetDate < today;
        return (
          <div key={m.id} className="flex items-center flex-1 last:flex-none" title={`${m.title} · ${m.targetDate} · ${m.status.toLowerCase()}`}>
            <span className={clsx('h-3.5 w-3.5 rounded-full border-2 shrink-0',
              m.status === 'ACHIEVED' && 'bg-archive-green border-archive-green',
              m.status === 'REPORTED' && 'bg-turmeric border-turmeric',
              late && 'border-danger',
              !late && m.status !== 'ACHIEVED' && m.status !== 'REPORTED' && 'border-text-muted')} />
            {i < live.length - 1 && <span className="h-0.5 flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function ScientistView() {
  const { projects, projectStaff, phDStudents, meetings, committeeMembers, actionItems, calendarEvents, holidays } = useData();
  const { staffId, ownStaff, staffResolved, actions, doneCount } = useHome();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [milestones, setMilestones] = useState<HomeMilestone[]>([]);

  const now = useMemo(() => new Date(), []);
  const today = localIso(now);
  const ownName = ownStaff?.Name ?? '';

  // --- 1. What needs me ---
  const next = useMemo(() => doNext(actions), [actions]);
  const wins = useMemo(() => quickWins(actions).filter(a => a.id !== next?.id), [actions, next]);
  const overdue = useMemo(() => actions.filter(a => a.due !== null && a.due < today).length, [actions, today]);
  const groups = useMemo(() => countByGroup(actions), [actions]);
  const sentence = useMemo(
    () => greeting({ name: ownName, hour: now.getHours(), left: actions.length, overdue }),
    [ownName, now, actions.length, overdue],
  );

  // --- 2. Committees ---
  const ownMeetings = useMemo(
    () => (staffId ? deriveOwnMeetings(meetings, committeeMembers, staffId, now).slice(0, 4) : []),
    [meetings, committeeMembers, staffId, now],
  );
  const committeeTasks = useMemo(() => deriveOwnActionItems(actionItems, ownName), [actionItems, ownName]);

  // --- 3. This week ---
  const week = useMemo(() => {
    const marks: { date: string; mark: DayMark }[] = [
      ...actions.filter(a => a.due).map(a => ({ date: a.due as string, mark: 'deadline' as const })),
      ...ownMeetings.map(m => ({ date: m.meeting_date, mark: 'meeting' as const })),
      ...calendarEvents.map(e => ({ date: e.event_date, mark: 'event' as const })),
      ...holidays.map(h => ({ date: h.holiday_date, mark: 'holiday' as const })),
    ];
    return weekStrip(marks, now);
  }, [actions, ownMeetings, calendarEvents, holidays, now]);

  // --- 4. Projects and team ---
  const ownProjects = useMemo(() => {
    if (!staffId) return [];
    const memberOf = new Set(projectStaff.filter(ps => ownName && ps.StaffName === ownName).map(ps => ps.ProjectNo));
    return projects
      .filter(p => p.piStaffId === staffId || memberOf.has(p.ProjectNo))
      .filter(p => !/complet|closed/i.test(p.ProjectStatus ?? ''));
  }, [projects, projectStaff, staffId, ownName]);
  const ownProjectIds = useMemo(() => ownProjects.map(p => p.ProjectID), [ownProjects]);
  const ownProjectKey = ownProjectIds.join('|');
  useEffect(() => {
    let cancelled = false;
    milestonesFor(ownProjectIds).then((m) => { if (!cancelled) setMilestones(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined ids, not the array identity
  }, [ownProjectKey]);

  const team = useMemo(() => {
    const led = new Set(ownProjects.filter(p => p.piStaffId === staffId).map(p => p.ProjectNo));
    const staffRows = projectStaff
      .filter(ps => led.has(ps.ProjectNo) && ps.StaffName !== ownName)
      .map(ps => ({ key: `ps-${ps.id}`, name: ps.StaffName, detail: `${ps.Designation} · ${ps.ProjectNo}`, until: ps.DateOfProjectDuration }));
    const students = phDStudents
      .filter(s => ownName && staffNameMatchesAuthor(ownName, s.SupervisorName))
      .map(s => ({ key: `phd-${s.EnrollmentNo}`, name: s.StudentName, detail: `PhD · ${s.CurrentStatus}`, until: '' }));
    return [...staffRows, ...students];
  }, [ownProjects, projectStaff, phDStudents, staffId, ownName]);

  const ask = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    navigate(q ? `/ask?q=${encodeURIComponent(q)}` : '/ask');
  };

  const actionRow = (a: MyAction) => {
    const due = dueText(a.due, now);
    return (
      <Link key={a.id} to={a.link} className={clsx(ROW, 'group')}>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text truncate group-hover:underline" title={a.label}>{a.label}</p>
          <p className="text-xs text-text-muted truncate" title={a.detail}>{a.detail}</p>
        </div>
        {due && <Badge variant={due.variant} className="font-mono normal-case shrink-0">{due.text}</Badge>}
      </Link>
    );
  };

  const total = actions.length + doneCount;

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Today ring and greeting --- */}
      <Card className="p-5 flex items-center gap-4">
        <TodayRing done={doneCount} total={total} />
        <div className="min-w-0">
          <h1 className="font-serif text-xl sm:text-2xl leading-snug text-text">{sentence}</h1>
          <p className="text-xs text-text-muted mt-1">
            {ownStaff
              ? `${ownStaff.Designation} · Division ${ownStaff.Division}`
              : staffResolved
                ? 'This account is not linked to a staff record. Ask the System Admin to link it; project, committee and team blocks need it.'
                : ' '}
          </p>
        </div>
      </Card>

      {/* --- 2. Ask and start --- */}
      <div className="flex flex-wrap gap-2">
        <form onSubmit={ask} className="flex-1 min-w-[220px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            value={question} onChange={e => setQuestion(e.target.value)}
            aria-label="Ask or search" placeholder="Ask SURYA: which of my reports are due?"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-surface-raised text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60"
          />
        </form>
        <Link to="/proposals/new"><Button variant="secondary" type="button"><Lightbulb size={15} className="mr-1.5" aria-hidden="true" />New idea</Button></Link>
        <Link to="/helpdesk/new"><Button variant="secondary" type="button"><LifeBuoy size={15} className="mr-1.5" aria-hidden="true" />Raise a request</Button></Link>
      </div>

      {/* --- 3. Do this next --- */}
      {next && (
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Do this next</span><span className="font-mono">about {classify(next).minutes} min</span></p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-base font-medium text-text">{next.label}</p>
              <p className="text-sm text-text-muted">{next.detail}</p>
            </div>
            {(() => { const due = dueText(next.due, now); return due && <Badge variant={due.variant} className="font-mono normal-case">{due.text}</Badge>; })()}
            <Link to={next.link}><Button type="button">Open</Button></Link>
          </div>
        </Card>
      )}

      {/* --- 4. Quick wins and this week --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Quick wins · two minutes each</span><span className="font-mono">{wins.length}</span></p>
          {wins.length === 0
            ? <p className="text-sm text-text-muted">No two-minute items today.</p>
            : wins.slice(0, 5).map(actionRow)}
        </Card>
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>This week</span><Link to="/calendar" className="hover:underline">Calendar</Link></p>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map(d => {
              const n = d.marks.deadline + d.marks.meeting + d.marks.event;
              return (
                <div key={d.iso} className={clsx('rounded-lg border py-1.5 text-center', d.isToday ? 'border-text' : 'border-border')}
                  title={`${d.iso}: ${d.marks.deadline} due, ${d.marks.meeting} meetings, ${d.marks.event} events${d.marks.holiday ? ', holiday' : ''}`}>
                  <div className="text-[11px] text-text-muted">{d.letter}</div>
                  <div className="font-mono text-sm text-text">{d.dayOfMonth}</div>
                  <div className={clsx('font-mono text-[11px]', d.marks.deadline > 0 ? 'text-badge-warning-fg' : 'text-text-muted')}>
                    {d.marks.holiday > 0 ? 'hol' : n > 0 ? n : '·'}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Open tasks by type: research <span className="font-mono">{groups.research}</span> · administration <span className="font-mono">{groups.admin}</span> · committee <span className="font-mono">{groups.committee}</span>
          </p>
        </Card>
      </div>

      {/* --- 5. Everything else that is open --- */}
      {actions.length > 1 && (
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Also open</span><Link to="/work" className="hover:underline">See all <span className="font-mono">{actions.length}</span></Link></p>
          {actions.filter(a => a.id !== next?.id && !wins.includes(a)).slice(0, 5).map(actionRow)}
        </Card>
      )}

      {/* --- 6. Committees --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Committees coming up</span><span className="font-mono">{ownMeetings.length}</span></p>
          {ownMeetings.length === 0
            ? <p className="text-sm text-text-muted">No meeting is scheduled for your committees.</p>
            : ownMeetings.map(m => (
              <Link key={m.id} to={`/committees/${m.committee_id}/meetings/${m.id}`} className={clsx(ROW, 'group')}>
                <span className="font-mono text-xs text-text-muted w-20 shrink-0">{m.meeting_date}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text truncate group-hover:underline">{m.title}</p>
                  {m.venue && <p className="text-xs text-text-muted truncate">{m.venue}</p>}
                </div>
              </Link>
            ))}
        </Card>
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Committee tasks on me</span><span className="font-mono">{committeeTasks.length}</span></p>
          {committeeTasks.length === 0
            ? <p className="text-sm text-text-muted">No open committee task.</p>
            : committeeTasks.slice(0, 5).map(t => {
              const due = dueText(t.deadline || null, now);
              return (
                <Link key={t.id} to="/committees" className={clsx(ROW, 'group')}>
                  <p className="flex-1 min-w-0 text-sm text-text truncate group-hover:underline" title={t.task}>{t.task}</p>
                  {due && <Badge variant={due.variant} className="font-mono normal-case shrink-0">{due.text}</Badge>}
                </Link>
              );
            })}
        </Card>
      </div>

      {/* --- 7. My projects --- */}
      <Card className="p-5">
        <p className={BLOCK_TITLE}><span>My projects · milestones</span><span className="font-mono">{ownProjects.length}</span></p>
        {ownProjects.length === 0
          ? <p className="text-sm text-text-muted">No running project is linked to you.</p>
          : ownProjects.slice(0, 6).map(p => {
            const ms = milestones.filter(m => m.projectId === p.ProjectID);
            const late = ms.filter(m => (m.status === 'PLANNED' || m.status === 'PROPOSED') && m.targetDate < today).length;
            return (
              <div key={p.ProjectID} className={clsx(ROW, 'flex-wrap')}>
                <Link to={`/projects/${encodeURIComponent(p.ProjectID)}`} className="w-full sm:w-64 min-w-0 group">
                  <p className="text-sm text-text truncate group-hover:underline" title={p.ProjectName}>
                    <span className="font-mono text-xs text-text-muted mr-2">{p.ProjectNo}</span>{p.ProjectName}
                  </p>
                </Link>
                <div className="flex-1 min-w-[160px]"><MilestoneTrack milestones={ms} today={today} /></div>
                {late > 0 && <Badge variant="danger" className="font-mono normal-case">{late} late</Badge>}
              </div>
            );
          })}
      </Card>

      {/* --- 8. Blocks that wait on other work --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Waiting in offices</span></p>
          <p className="text-sm text-text-muted">Not connected yet. Purchase, bills and hiring will show here when the office files are linked.</p>
        </Card>
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>My team</span><span className="font-mono">{team.length}</span></p>
          {team.length === 0
            ? <p className="text-sm text-text-muted">No project staff or student is linked to you.</p>
            : team.slice(0, 6).map(t => (
              <div key={t.key} className={ROW}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text truncate">{t.name}</p>
                  <p className="text-xs text-text-muted truncate">{t.detail}</p>
                </div>
                {t.until && <span className="font-mono text-xs text-text-muted shrink-0">to {t.until}</span>}
              </div>
            ))}
        </Card>
      </div>

      <p className="text-xs text-text-muted">
        Your papers, proposals and research profile are on <Link to="/me" className="underline">My profile</Link>.
      </p>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useProjectReports } from '../../contexts/ProjectReportsContext';
import { useClaim, useHome } from '../../contexts/HomeContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { DoFirst, PinButton, PrioritiesAsked } from '../../components/home/Priorities';
import { ActionRow, AskBox, BLOCK_TITLE, HomeGreeting, NotConnected, ROW, dueText } from '../../components/home/parts';
import { deriveOwnMeetings, deriveOwnActionItems } from '../../lib/dashboard/scientistData';
import type { MyAction } from '../../lib/dashboard/myActions';
import { classify, countByGroup } from '../../lib/home/classify';
import { doNext, quickWins } from '../../lib/home/doNext';
import { greeting } from '../../lib/home/greeting';
import { localIso, weekStrip } from '../../lib/home/today';
import type { DayMark } from '../../lib/home/today';
import { deskKey } from '../../lib/home/desk';
import { reportTimers } from '../../lib/home/requests';
import { canSnooze, consequenceLine, nextWorkingDay, onTimeRecord, readSnoozes, snoozedIds, writeSnoozes } from '../../lib/home/nudges';
import type { ReportTimer } from '../../lib/home/requests';
import { milestonesFor } from '../../lib/home/api';
import type { HomeMilestone } from '../../lib/home/api';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';

function TimerRing({ timer }: { timer: ReportTimer }) {
  const c = 113;
  const late = timer.daysLeft < 0;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" className="stroke-border" />
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={Math.round(c * (1 - timer.share))} transform="rotate(-90 22 22)"
        className={late ? 'stroke-danger' : timer.daysLeft <= 7 ? 'stroke-turmeric' : 'stroke-text-muted'} />
      <text x="22" y="26" textAnchor="middle" className={clsx('font-mono text-[11px]', late ? 'fill-danger' : 'fill-text')}>{timer.daysLeft}</text>
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
  const { staffId, ownStaff, staffResolved, actions, doneCount, prioritiesForMe } = useHome();
  const { user } = useAuth();
  const { reports: progressReports } = useProjectReports();
  const [milestones, setMilestones] = useState<HomeMilestone[]>([]);

  const now = useMemo(() => new Date(), []);
  const today = localIso(now);
  const ownName = ownStaff?.Name ?? '';

  // --- 1. What needs me (items put off until tomorrow stay out of these three) ---
  const [snoozes, setSnoozes] = useState<Record<string, string>>(() => (user ? readSnoozes(user.id) : {}));
  const snoozed = useMemo(() => snoozedIds(snoozes, today), [snoozes, today]);
  const visible = useMemo(() => actions.filter(a => !snoozed.has(a.id)), [actions, snoozed]);
  const next = useMemo(() => doNext(visible), [visible]);
  const wins = useMemo(() => quickWins(visible).filter(a => a.id !== next?.id), [visible, next]);
  const putOff = (id: string) => {
    if (!user) return;
    const s = { ...snoozes, [id]: nextWorkingDay(today, holidays.map(h => h.holiday_date)) };
    writeSnoozes(user.id, s, today);
    setSnoozes(s);
  };
  const record = useMemo(() => (user ? onTimeRecord(progressReports, user.id, today) : { sent: 0, onTime: 0 }), [progressReports, user, today]);
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

  // --- 5. One item, one place: tell the common desk what this half shows ---
  const timers = useMemo(() => reportTimers(actions, now), [actions, now]);
  const alsoOpen = useMemo(() => {
    const timed = new Set(timers.map(t => t.action.id));
    return visible.filter(a => a.id !== next?.id && !wins.includes(a) && !timed.has(a.id)).slice(0, 5);
  }, [visible, next, wins, timers]);
  useClaim(useMemo(() => [
    ...(next ? [deskKey.action(next.id)] : []),
    ...wins.slice(0, 5).map(a => deskKey.action(a.id)),
    ...alsoOpen.map(a => deskKey.action(a.id)),
    ...timers.slice(0, 6).map(t => deskKey.action(t.action.id)),
    ...ownMeetings.map(m => deskKey.meeting(m.id)),
  ], [next, wins, alsoOpen, timers, ownMeetings]));

  const actionRow = (a: MyAction) => <ActionRow key={a.id} action={a} now={now} />;

  const total = actions.length + doneCount;

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Today ring and greeting --- */}
      <HomeGreeting
        done={doneCount} total={total} sentence={sentence}
        sub={ownStaff
          ? `${ownStaff.Designation} · Division ${ownStaff.Division}${record.sent > 0 ? ` · ${record.onTime} of ${record.sent} reports sent on time this year` : ''}`
          : staffResolved
            ? 'This account is not linked to a staff record. Ask the System Admin to link it; project, committee and team blocks need it.'
            : ' '}
      />

      <DoFirst now={now} />

      {/* --- 2. Ask and start --- */}
      <AskBox placeholder="Ask SURYA: which of my reports are due?">
        <PinButton />
        <Link to="/proposals/new"><Button variant="secondary" type="button"><Lightbulb size={15} className="mr-1.5" aria-hidden="true" />New idea</Button></Link>
      </AskBox>

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
            {canSnooze(next, today) && <Button type="button" variant="ghost" onClick={() => putOff(next.id)}>Tomorrow</Button>}
            <Link to={next.link}><Button type="button" variant={prioritiesForMe.length > 0 ? 'secondary' : 'primary'}>Open</Button></Link>
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
          <p className={BLOCK_TITLE}><span>This week</span><Link to="/calendar" className="inline-block py-1.5 -my-1.5 hover:underline">Calendar</Link></p>
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

      {/* --- 5. Report timers --- */}
      {timers.length > 0 && (
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Report timers · days left</span><span className="font-mono">{timers.length}</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {timers.slice(0, 6).map(t => (
              <Link key={t.action.id} to={t.action.link} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-hover group">
                <TimerRing timer={t} />
                <div className="min-w-0">
                  <p className="text-sm text-text truncate group-hover:underline" title={t.action.label}>{t.action.label}</p>
                  <p className="text-xs text-text-muted truncate" title={t.action.detail}>
                    {t.daysLeft < 0 ? `${-t.daysLeft} days late` : t.daysLeft === 0 ? 'due today' : `due ${t.action.due}`}
                  </p>
                  {consequenceLine(t.action, t.daysLeft) && <p className="text-xs text-text-muted">{consequenceLine(t.action, t.daysLeft)}</p>}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* --- 6. Everything else that is open --- */}
      {actions.length > 1 && (
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Also open</span><Link to="/work" className="inline-block py-1.5 -my-1.5 hover:underline">See all <span className="font-mono">{actions.length}</span></Link></p>
          {alsoOpen.map(actionRow)}
        </Card>
      )}

      <PrioritiesAsked />

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
        <NotConnected title="Waiting in offices">Purchase, bills and hiring will show here when the office files are linked.</NotConnected>
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
        Your papers, proposals and research profile are on <Link to="/me" className="inline-block py-1.5 underline">My profile</Link>.
      </p>
    </div>
  );
}

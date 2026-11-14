import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useData } from '../../contexts/DataContext';
import { useClaim, useHome } from '../../contexts/HomeContext';
import { Card, Badge } from '../../components/ui/Cards';
import {
  AskBox, BLOCK_TITLE, DecisionQueue, HomeGreeting, ROW, TITLE_LINK, WaitingOnYou, dueText,
} from '../../components/home/parts';
import { DoFirst, PinButton, PrioritiesAsked } from '../../components/home/Priorities';
import { DelegationDial } from '../../components/home/Delegation';
import { AttentionStrip } from '../../components/dashboard/AttentionStrip';
import { ProjectFinanceSection } from '../../components/dashboard/ProjectFinanceSection';
import { ResearchSection } from '../../components/dashboard/ResearchSection';
import { EquipmentOpsSection } from '../../components/dashboard/EquipmentOpsSection';
import { useDirectorThresholds } from '../../hooks/useDirectorThresholds';
import { greeting, waitingLine } from '../../lib/home/greeting';
import { decisionQueue, isDecision } from '../../lib/home/decisions';
import { precheck } from '../../lib/home/prechecks';
import { useProjectReports } from '../../contexts/ProjectReportsContext';
import { deskKey } from '../../lib/home/desk';
import { milestonesFor } from '../../lib/home/api';
import type { HomeMilestone } from '../../lib/home/api';
import { divisionRollup } from '../../lib/home/division';
import { deriveOwnMeetings } from '../../lib/dashboard/scientistData';
import { isActiveProject } from '../../lib/projects/stage';
import { useDivisionStrength } from '../../lib/people/useDivisionStrength';
import { getEquipmentFlags, getInstituteUtilization, DEFAULT_THRESHOLDS } from '../../utils/directorMetrics';

const MAX_ROWS = 5;

// Blocks of the Director's page whose source is a later phase. Each says so until it ships.
const NOT_CONNECTED: { title: string; waitsOn: string }[] = [
  { title: 'Briefing and watch list', waitsOn: 'a summary of critical matters from the last days' },
  { title: 'From CSIR Headquarters', waitsOn: 'letters and questions with a deadline, logged by your office' },
  { title: 'Fund status by head', waitsOn: 'figures from Accounts' },
  { title: 'The next 12 months', waitsOn: 'retirements, contracts, projects and payments by month' },
  { title: 'Purchase plan and stuck in offices', waitsOn: 'figures from Purchase and Accounts' },
  { title: 'Infrastructure', waitsOn: 'the works register' },
];

function Figure({ label, value, note, to }: { label: string; value: string; note: string; to: string }) {
  return (
    <Link to={to} className="block rounded-lg bg-surface-hover p-3 hover:shadow-[var(--shadow-e1)] transition-shadow">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="font-mono text-xl text-text mt-0.5">{value}</p>
      <p className="text-xs text-text-muted">{note}</p>
    </Link>
  );
}

export function DirectorView() {
  const { projects, divisions, equipment, meetings, committeeMembers } = useData();
  const { staffId, ownStaff, actions, doneCount, prioritiesForMe } = useHome();
  const { thresholds } = useDirectorThresholds();
  const { reports: progressReports } = useProjectReports();
  const { rows: strengthRows, totals } = useDivisionStrength();

  const now = useMemo(() => new Date(), []);

  // --- 1. What waits on the Director ---
  const overdue = useMemo(() => actions.filter(a => dueText(a.due, now)?.variant === 'danger').length, [actions, now]);
  const decisions = useMemo(() => decisionQueue(actions, now), [actions, now]);
  const others = useMemo(() => actions.filter(a => !isDecision(a)), [actions]);
  const sentence = useMemo(
    () => greeting({ name: ownStaff?.Name ?? '', hour: now.getHours(), left: actions.length, overdue }) + waitingLine(decisions.length),
    [ownStaff, now, actions.length, overdue, decisions.length],
  );
  const ownMeetings = useMemo(
    () => (staffId ? deriveOwnMeetings(meetings, committeeMembers, staffId, now).slice(0, MAX_ROWS) : []),
    [meetings, committeeMembers, staffId, now],
  );
  useClaim(useMemo(() => [
    ...decisions.slice(0, 6).map(d => deskKey.action(d.action.id)),
    ...others.slice(0, MAX_ROWS + 1).map(a => deskKey.action(a.id)),
    ...ownMeetings.map(m => deskKey.meeting(m.id)),
  ], [decisions, others, ownMeetings]));

  // --- 2. Divisions, by exception ---
  const running = useMemo(() => projects.filter(isActiveProject), [projects]);
  const runningKey = useMemo(() => running.map(p => p.ProjectID).join('|'), [running]);
  const [milestones, setMilestones] = useState<HomeMilestone[]>([]);
  useEffect(() => {
    let cancelled = false;
    milestonesFor(runningKey ? runningKey.split('|') : []).then((m) => { if (!cancelled) setMilestones(m); });
    return () => { cancelled = true; };
  }, [runningKey]);
  const vacantByDivision = useMemo(() => new Map(strengthRows.map(r => [r.division_code, r.vacant])), [strengthRows]);
  const rollup = useMemo(
    () => divisionRollup(projects, milestones, vacantByDivision, now),
    [projects, milestones, vacantByDivision, now],
  );
  const divisionName = useMemo(() => new Map(divisions.map(d => [d.divCode, d.divName])), [divisions]);

  // --- 3. Institute figures, each from a record that can be opened ---
  const utilization = useMemo(() => getInstituteUtilization(running), [running]);
  const down = useMemo(() => getEquipmentFlags(equipment, DEFAULT_THRESHOLDS, now).down.length, [equipment, now]);

  const total = actions.length + doneCount;

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Greeting --- */}
      <HomeGreeting
        done={doneCount} total={total} sentence={sentence}
        sub={<>
          CSIR-AMPRI · <span className="font-mono">{divisions.length}</span> divisions
          {' · '}<span className="font-mono">{running.length}</span> running projects
        </>}
      />

      {/* --- 2. Ask --- */}
      <DoFirst now={now} />

      <DelegationDial />

      <AskBox placeholder="Ask SURYA: who can speak for us on hydrogen storage?"><PinButton /></AskBox>

      {/* --- 3. Waiting on you --- */}
      <DecisionQueue rows={decisions} strong={prioritiesForMe.length === 0}
        check={a => precheck(a, { projects, progressReports, milestones, now })} />
      <WaitingOnYou actions={others} now={now} rows={MAX_ROWS} strong={prioritiesForMe.length === 0 && decisions.length === 0}
        title={decisions.length > 0 ? 'Also on you' : 'Waiting on you'} />

      <PrioritiesAsked />

      {/* --- 4. Divisions and my week --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Divisions · those that need you</span><Link to="/divisions" className={TITLE_LINK}>See all</Link></p>
          {rollup.rows.slice(0, MAX_ROWS + 1).map(r => (
            <Link key={r.code} to="/divisions" className={clsx(ROW, 'group')}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate group-hover:underline">
                  <span className="font-mono text-xs text-text-muted mr-2">{r.code}</span>{divisionName.get(r.code) ?? ''}
                </p>
              </div>
              {r.flagged > 0 && <Badge variant="danger" className="font-mono normal-case shrink-0">{r.flagged} of {r.running} projects</Badge>}
              {(r.vacant ?? 0) > 0 && <Badge variant="warning" className="font-mono normal-case shrink-0">{r.vacant} vacant</Badge>}
            </Link>
          ))}
          <p className={clsx('text-sm text-text-muted', rollup.rows.length > 0 && 'mt-3')}>
            {rollup.rows.length > MAX_ROWS + 1 && <><span className="font-mono">{rollup.rows.length - MAX_ROWS - 1}</span> more {rollup.rows.length - MAX_ROWS - 1 === 1 ? 'needs' : 'need'} a look. </>}
            <span className="font-mono">{rollup.onCourse}</span> {rollup.onCourse === 1 ? 'division is' : 'divisions are'} on course.
          </p>
          <p className="text-xs text-text-muted mt-1">A project counts when it is past its end date, ends in 60 days, has a late milestone, or its recorded spending is far behind its time.</p>
        </Card>

        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>My week · meetings I sit on</span><Link to="/committees" className={TITLE_LINK}>Committees</Link></p>
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
      </div>

      {/* --- 5. Institute at a glance: each figure opens its list --- */}
      <Card className="p-5">
        <p className={BLOCK_TITLE}><span>Institute · each figure opens its list</span></p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Figure to="/projects" label="Running projects" value={String(running.length)} note={`of ${projects.length} on record`} />
          <Figure to="/portfolio" label="Project money used" value={utilization.utilized > 0 ? `${utilization.pct}%` : '—'} note={utilization.utilized > 0 ? 'of sanctioned cost, running projects' : 'no spent amount is recorded'} />
          <Figure to="/staff/posts" label="Posts filled" value={totals.sanctioned > 0 ? `${totals.filled} / ${totals.sanctioned}` : '—'} note={totals.sanctioned > 0 ? `${totals.vacant} vacant` : 'no posts are entered'} />
          <Figure to="/facilities" label="Instruments down" value={String(down)} note={`of ${equipment.length}`} />
        </div>
      </Card>

      {/* --- 6. Blocks that wait on other work --- */}
      <Card className="p-5">
        <p className={BLOCK_TITLE}><span>Not connected yet</span><span className="font-mono">{NOT_CONNECTED.length}</span></p>
        {NOT_CONNECTED.map(b => (
          <div key={b.title} className={ROW}>
            <p className="text-sm text-text w-56 shrink-0">{b.title}</p>
            <p className="text-xs text-text-muted flex-1 min-w-0">Will show {b.waitsOn}.</p>
          </div>
        ))}
      </Card>

      {/* --- 7. Institute figures --- */}
      <h2 className="text-xs font-medium text-text-muted pt-4">Institute figures</h2>
      <AttentionStrip thresholds={thresholds} />
      <ProjectFinanceSection />
      <ResearchSection />
      <EquipmentOpsSection />
    </div>
  );
}

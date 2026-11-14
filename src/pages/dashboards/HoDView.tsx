import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { Card, Badge } from '../../components/ui/Cards';
import {
  AskBox, BLOCK_TITLE, HomeGreeting, NotConnected, ROW, TITLE_LINK, WaitingOnYou, dueText,
} from '../../components/home/parts';
import { ProjectFinanceSection } from '../../components/dashboard/ProjectFinanceSection';
import { ResearchSection } from '../../components/dashboard/ResearchSection';
import { EquipmentOpsSection } from '../../components/dashboard/EquipmentOpsSection';
import { ScientistView } from './ScientistView';
import { greeting } from '../../lib/home/greeting';
import { deskKey } from '../../lib/home/desk';
import { milestonesFor } from '../../lib/home/api';
import type { HomeMilestone } from '../../lib/home/api';
import { projectsByException } from '../../lib/home/division';
import { isActiveProject } from '../../lib/projects/stage';
import { loadWorkload } from '../../lib/people/api';
import type { WorkloadRow } from '../../lib/people/api';
import { useDivisionStrength } from '../../lib/people/useDivisionStrength';
import { yearsUntilRetirement } from '../../lib/staff/retirement';
import { DEFAULT_THRESHOLDS, getEquipmentFlags } from '../../utils/directorMetrics';
import { parseDate, diffInDays } from '../../utils/dateUtils';

type HeadView = 'division' | 'own';
const VIEW_KEY = 'surya_home_head_view';
const MAX_ROWS = 5;
const CONTRACT_HORIZON_DAYS = 60;

function Bar({ label, pct, tone }: { label: string; pct: number | null; tone: 'time' | 'money' }) {
  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      <span className="w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden" aria-hidden="true">
        {pct !== null && <div className={clsx('h-full rounded-full', tone === 'time' ? 'bg-text-muted' : 'bg-archive-green')} style={{ width: `${pct}%` }} />}
      </div>
      <span className="font-mono w-10 text-right">{pct === null ? '—' : `${pct}%`}</span>
    </div>
  );
}

function ViewSwitch({ view, onChange }: { view: HeadView; onChange: (v: HeadView) => void }) {
  const option = (v: HeadView, text: string) => (
    <button
      type="button" aria-pressed={view === v} onClick={() => onChange(v)}
      className={clsx('px-3 py-1.5 text-xs rounded-md transition-colors',
        view === v ? 'bg-surface-raised text-text shadow-[var(--shadow-e1)]' : 'text-text-muted hover:text-text')}
    >{text}</button>
  );
  return (
    <div role="group" aria-label="What this page shows" className="inline-flex rounded-lg bg-surface-hover p-0.5 shrink-0">
      {option('division', 'Division')}{option('own', 'My own work')}
    </div>
  );
}

export function HoDView() {
  const { divisionCode } = useAuth();
  const { staff, projects, projectStaff, equipment } = useData();
  const { ownStaff, actions, doneCount } = useHome();
  const { byDivision } = useDivisionStrength();

  // A view preference only; it grants nothing.
  const [view, setView] = useState<HeadView>(() => (localStorage.getItem(VIEW_KEY) === 'own' ? 'own' : 'division'));
  const changeView = (v: HeadView) => { localStorage.setItem(VIEW_KEY, v); setView(v); };

  const now = useMemo(() => new Date(), []);
  const inDivision = useMemo(() => (code: string | null | undefined) => !divisionCode || code === divisionCode, [divisionCode]);

  // --- 1. What waits on the head ---
  const overdue = useMemo(() => actions.filter(a => dueText(a.due, now)?.variant === 'danger').length, [actions, now]);
  const first = actions[0] ?? null;
  const waiting = useMemo(() => actions.slice(1, MAX_ROWS + 1), [actions]);
  const sentence = useMemo(
    () => greeting({ name: ownStaff?.Name ?? '', hour: now.getHours(), left: actions.length, overdue }),
    [ownStaff, now, actions.length, overdue],
  );
  const shownKeys = useMemo(
    () => (view === 'division' ? [first, ...waiting].filter(a => a !== null).map(a => deskKey.action(a.id)) : null),
    [view, first, waiting],
  );
  // In "My own work" the scientist view makes its own claim.
  useClaimWhen(shownKeys);

  // --- 2. Division projects, by exception ---
  const divisionProjects = useMemo(() => projects.filter(p => inDivision(p.DivisionCode)), [projects, inDivision]);
  const runningIds = useMemo(() => divisionProjects.filter(isActiveProject).map(p => p.ProjectID), [divisionProjects]);
  const runningKey = runningIds.join('|');
  const [milestones, setMilestones] = useState<HomeMilestone[]>([]);
  useEffect(() => {
    let cancelled = false;
    milestonesFor(runningIds).then((m) => { if (!cancelled) setMilestones(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined ids, not the array identity
  }, [runningKey]);
  const exceptions = useMemo(() => projectsByException(divisionProjects, milestones, now), [divisionProjects, milestones, now]);

  // --- 3. People ---
  const divisionStaff = useMemo(() => staff.filter(s => inDivision(s.Division)), [staff, inDivision]);
  const strength = divisionCode ? byDivision.get(divisionCode) : undefined;
  const retiring = useMemo(
    () => divisionStaff.filter((s) => { const y = yearsUntilRetirement(s.DOB, now); return y !== null && y >= 0 && y <= 1; }),
    [divisionStaff, now],
  );
  const contractsEnding = useMemo(() => projectStaff.filter((ps) => {
    if (!inDivision(ps.DivisionCode)) return false;
    const end = parseDate(ps.DateOfProjectDuration);
    if (!end) return false;
    const days = diffInDays(end, now);
    return days >= 0 && days <= CONTRACT_HORIZON_DAYS;
  }), [projectStaff, inDivision, now]);
  const [workload, setWorkload] = useState<WorkloadRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadWorkload().then((w) => { if (!cancelled) setWorkload(w); }, () => { if (!cancelled) setWorkload(null); });
    return () => { cancelled = true; };
  }, []);
  const overloaded = useMemo(
    () => (workload ?? []).filter(w => w.overload && inDivision(w.division)),
    [workload, inDivision],
  );

  // --- 4. Instruments ---
  const equipmentFlags = useMemo(
    () => getEquipmentFlags(equipment.filter(e => inDivision(e.Division)), DEFAULT_THRESHOLDS, now),
    [equipment, inDivision, now],
  );

  const switcher = <ViewSwitch view={view} onChange={changeView} />;
  if (view === 'own') {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{switcher}</div>
        <ScientistView />
      </div>
    );
  }

  const total = actions.length + doneCount;

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Greeting --- */}
      <HomeGreeting
        done={doneCount} total={total} sentence={sentence} right={switcher}
        sub={<>
          {divisionCode ? `Division ${divisionCode}` : 'All divisions'} · <span className="font-mono">{divisionStaff.length}</span> staff
          {' · '}<span className="font-mono">{runningIds.length}</span> running projects
        </>}
      />

      {/* --- 2. Ask --- */}
      <AskBox placeholder="Ask SURYA: who in my division has worked on fly ash?" />

      {/* --- 3. Waiting on you --- */}
      <WaitingOnYou actions={actions} now={now} rows={MAX_ROWS} />

      {/* --- 4. Division projects, by exception --- */}
      <Card className="p-5">
        <p className={BLOCK_TITLE}>
          <span>Division projects · those that need you</span>
          <span className="font-mono">{exceptions.flagged.length} of {runningIds.length}</span>
        </p>
        {exceptions.flagged.slice(0, MAX_ROWS).map(({ project: p, reading }) => (
          <Link key={p.ProjectID} to={`/projects/${encodeURIComponent(p.ProjectID)}`} className={clsx(ROW, 'flex-wrap group')}>
            <div className="w-full sm:w-72 min-w-0">
              <p className="text-sm text-text truncate group-hover:underline" title={p.ProjectName}>
                <span className="font-mono text-xs text-text-muted mr-2">{p.ProjectNo}</span>{p.ProjectName}
              </p>
              <p className="text-xs text-badge-danger-fg truncate">{reading.reasons.join(' · ')}</p>
            </div>
            <div className="flex-1 min-w-[180px] space-y-1">
              <Bar label="time" pct={reading.timePct} tone="time" />
              <Bar label="money" pct={reading.moneyPct} tone="money" />
            </div>
          </Link>
        ))}
        <p className={clsx('text-sm text-text-muted', exceptions.flagged.length > 0 && 'mt-3')}>
          {runningIds.length === 0
            ? 'No running project in this division. '
            : <><span className="font-mono">{exceptions.onCourse}</span> {exceptions.onCourse === 1 ? 'project is' : exceptions.flagged.length > 0 ? 'others are' : 'projects are'} on course.{' '}</>}
          <Link to="/projects" className="underline inline-block py-1.5 -my-1.5">See all</Link>
        </p>
      </Card>

      {/* --- 5. People and instruments --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>People · my division</span><Link to="/staff" className={TITLE_LINK}>Directory</Link></p>
          <div className={ROW}>
            <p className="flex-1 text-sm text-text">Posts</p>
            {strength
              ? <span className="text-xs text-text-muted"><span className="font-mono">{strength.filled}</span> of <span className="font-mono">{strength.sanctioned}</span> filled · <span className="font-mono">{strength.vacant}</span> vacant</span>
              : <span className="text-xs text-text-muted">No posts are entered for this division.</span>}
          </div>
          <div className={ROW}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text">Retiring within 12 months</p>
              {retiring.length > 0 && <p className="text-xs text-text-muted truncate">{retiring.map(s => s.Name).join(', ')}</p>}
            </div>
            <span className="font-mono text-xs text-text-muted">{retiring.length}</span>
          </div>
          <div className={ROW}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text">Project staff contracts ending in 60 days</p>
              {contractsEnding.length > 0 && <p className="text-xs text-text-muted truncate">{contractsEnding.map(c => c.StaffName).join(', ')}</p>}
            </div>
            <span className="font-mono text-xs text-text-muted">{contractsEnding.length}</span>
          </div>
          <Link to="/staff/planning" className={clsx(ROW, 'group')}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text group-hover:underline">Scientists with a heavy load</p>
              {overloaded.length > 0 && <p className="text-xs text-text-muted truncate">{overloaded.map(w => `${w.name} (${w.active_projects})`).join(', ')}</p>}
            </div>
            <span className="font-mono text-xs text-text-muted">{workload === null ? '—' : overloaded.length}</span>
          </Link>
        </Card>

        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Instruments</span><Link to="/facilities" className={TITLE_LINK}>See all</Link></p>
          {equipmentFlags.down.length === 0 && equipmentFlags.amcExpiring.length === 0 && (
            <p className="text-sm text-text-muted">Every instrument is working and no service contract ends in 60 days.</p>
          )}
          {equipmentFlags.down.slice(0, MAX_ROWS).map(e => (
            <Link key={`down-${e.UInsID}`} to={`/facilities/${encodeURIComponent(e.UInsID)}`} className={clsx(ROW, 'group')}>
              <p className="flex-1 min-w-0 text-sm text-text truncate group-hover:underline" title={e.Name}>{e.Name}</p>
              <Badge variant="danger" className="normal-case shrink-0">down</Badge>
            </Link>
          ))}
          {equipmentFlags.amcExpiring.slice(0, MAX_ROWS).map(e => (
            <Link key={`amc-${e.UInsID}`} to={`/facilities/${encodeURIComponent(e.UInsID)}`} className={clsx(ROW, 'group')}>
              <p className="flex-1 min-w-0 text-sm text-text truncate group-hover:underline" title={e.Name}>{e.Name}</p>
              <Badge variant="warning" className="normal-case shrink-0">service contract ends <span className="font-mono ml-1">{e.amc_end_date}</span></Badge>
            </Link>
          ))}
          {equipmentFlags.down.length > MAX_ROWS && (
            <p className="text-xs text-text-muted mt-2">+<span className="font-mono">{equipmentFlags.down.length - MAX_ROWS}</span> more down</p>
          )}
        </Card>
      </div>

      {/* --- 6. Blocks that wait on other work --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <NotConnected title="Reports that go up from you">Division report drafts will be built here from your scientists' entries.</NotConnected>
        <NotConnected title="Technologies">Readiness level and transfer state of each technology will show here.</NotConnected>
        <NotConnected title="Outside · collaboration and visits">Open threads with partners and coming visits will show here.</NotConnected>
      </div>

      {/* --- 7. Division figures --- */}
      <h2 className="text-xs font-medium text-text-muted pt-4">Division figures</h2>
      <ProjectFinanceSection />
      <ResearchSection />
      <EquipmentOpsSection />
    </div>
  );
}

/** Claims the given keys for the role half; null leaves the claim to a child view. */
function useClaimWhen(keys: string[] | null) {
  const { claim } = useHome();
  const joined = keys === null ? null : keys.join('|');
  useEffect(() => {
    if (joined === null) return;
    claim(joined ? joined.split('|') : []);
    return () => claim([]);
  }, [claim, joined]);
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useData } from '../../contexts/DataContext';
import { useClaim, useHome } from '../../contexts/HomeContext';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import {
  ActionRow, AskBox, BLOCK_TITLE, HomeGreeting, NotConnected, ROW, TITLE_LINK, WaitingOnYou,
} from '../../components/home/parts';
import { countWord } from '../../lib/home/greeting';
import { deskKey } from '../../lib/home/desk';
import { daysUntil } from '../../lib/home/today';
import { phdRoad } from '../../lib/home/people';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';

const NEEDS: { label: string; to: string }[] = [
  { label: 'Book an instrument', to: '/facilities' },
  { label: 'Bonafide letter', to: '/helpdesk/new' },
  { label: 'Leave', to: '/helpdesk/new' },
  { label: 'Hostel or ID card', to: '/helpdesk/new' },
];

function partOfDay(h: number) { return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export function StudentView() {
  const { phDStudents, phdMilestones, scientificOutputs, projects } = useData();
  const { ownStaff, actions, doneCount } = useHome();
  const now = useMemo(() => new Date(), []);

  // Students are matched by name, as phd_students' read policy does, until the record gets its own login link.
  const own = useMemo(
    () => (ownStaff ? phDStudents.find(p => p.StudentName === ownStaff.Name) ?? null : null),
    [phDStudents, ownStaff],
  );
  const road = useMemo(
    () => phdRoad(own ? phdMilestones.filter(m => m.enrollmentNo === own.EnrollmentNo) : []),
    [phdMilestones, own],
  );
  const papers = useMemo(
    () => (own ? scientificOutputs.filter(o => o.authors.some(a => staffNameMatchesAuthor(own.StudentName, a))) : []),
    [scientificOutputs, own],
  );
  const project = useMemo(() => (own?.ProjectNo ? projects.find(p => p.ProjectNo === own.ProjectNo) ?? null : null), [projects, own]);

  useClaim(useMemo(() => actions.slice(0, 10).map(a => deskKey.action(a.id)), [actions]));

  const name = own?.StudentName ?? ownStaff?.Name ?? '';
  const hello = name ? `${partOfDay(now.getHours())}, ${name}.` : `${partOfDay(now.getHours())}.`;
  const passed = road.gates.filter(g => g.done).length;
  const next = road.next;
  const nextDays = next?.dueDate ? daysUntil(next.dueDate, now) : null;
  const sentence = !own
    ? `${hello} Your PhD record is not linked to this account yet.`
    : !next
      ? `${hello} Every step on your road is done.`
      : `${hello} You have passed ${countWord(passed).toLowerCase()} of eight steps. Next is ${next.name.toLowerCase()}${
        nextDays === null ? '.' : nextDays < 0 ? `, ${-nextDays} days past its date.` : `, in ${nextDays} days.`}`;

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Greeting and the road --- */}
      <HomeGreeting
        done={doneCount} total={actions.length + doneCount} sentence={sentence}
        sub={own
          ? <>Enrolment <span className="font-mono">{own.EnrollmentNo}</span> · {own.Specialization || 'PhD'} · supervisor {own.SupervisorName || 'not named'}</>
          : 'Ask your supervisor or the System Admin to link your PhD record.'}
      />
      {own && (
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Road to the thesis</span><span className="font-mono">{passed} of 8</span></p>
          <ol className="grid grid-cols-4 sm:grid-cols-8 gap-1.5" aria-label="PhD steps">
            {road.gates.map(g => (
              <li key={g.name} className="text-center">
                <span aria-hidden="true" className={clsx('block h-1.5 rounded-full',
                  g.done ? 'bg-archive-green' : g === next ? 'bg-turmeric' : 'bg-surface-hover')} />
                <span className={clsx('block text-[11px] mt-1.5 leading-tight', g === next ? 'text-text' : 'text-text-muted')}>{g.name}</span>
                <span className="sr-only">{g.done ? 'done' : g === next ? 'next' : 'not yet'}</span>
                {g.dueDate && !g.done && <span className="block font-mono text-[11px] text-text-muted">{g.dueDate}</span>}
              </li>
            ))}
          </ol>
          <p className="text-xs text-text-muted mt-3">Fellowship: {own.FellowshipDetails || 'not on record'}.{own.ThesisTitle ? ` Thesis: ${own.ThesisTitle}.` : ''}</p>
        </Card>
      )}

      {/* --- 2. Ask --- */}
      <AskBox placeholder="Ask SURYA: what does the synopsis need?" />

      {/* --- 3. This week: what waits on me --- */}
      <WaitingOnYou actions={actions} now={now} rows={4} />

      {/* --- 4. Work record and need something --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>My work record</span><Link to="/me" className={TITLE_LINK}>My profile</Link></p>
          <div className={ROW}>
            <p className="flex-1 text-sm text-text">Papers with my name</p>
            <span className="font-mono text-xs text-text-muted">{papers.length}</span>
          </div>
          {papers.slice(0, 3).map(o => (
            <div key={o.id} className={ROW}>
              <p className="flex-1 min-w-0 text-xs text-text-muted truncate" title={o.title}>{o.title}</p>
              <span className="font-mono text-xs text-text-muted shrink-0">{o.year}</span>
            </div>
          ))}
          <div className={ROW}>
            <p className="flex-1 text-sm text-text">Project</p>
            {project
              ? <Link to={`/projects/${encodeURIComponent(project.ProjectID)}`} className="text-xs text-text-muted truncate hover:underline inline-block py-1.5 -my-1.5">
                  <span className="font-mono mr-1">{project.ProjectNo}</span>{project.ProjectName}
                </Link>
              : <span className="text-xs text-text-muted">none on record</span>}
          </div>
        </Card>
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Need something</span></p>
          <div className="flex flex-wrap gap-2">
            {NEEDS.map(n => <Link key={n.label} to={n.to}><Button variant="secondary" size="sm" type="button">{n.label}</Button></Link>)}
          </div>
          <p className="text-xs text-text-muted mt-3">You see your own road only. No other student's progress is shown here.</p>
        </Card>
      </div>

      {/* --- 5. Blocks that wait on other work --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NotConnected title="Supervisor meetings">What you agreed at each meeting, and its state, will show here.</NotConnected>
        <NotConnected title="Fellowship clock">The fellowship end date against your thesis date will show here.</NotConnected>
      </div>

      {actions.length > 5 && (
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Also open</span></p>
          {actions.slice(5, 10).map(a => <ActionRow key={a.id} action={a} now={now} />)}
        </Card>
      )}
    </div>
  );
}

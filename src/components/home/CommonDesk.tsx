import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LifeBuoy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { useProjectReports } from '../../contexts/ProjectReportsContext';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { deriveOwnMeetings } from '../../lib/dashboard/scientistData';
import { myDay, withoutClaimed } from '../../lib/home/desk';
import { NoticesBlock } from './Notices';
import { REQUEST_KINDS, myRequests, requestLink } from '../../lib/home/requests';
import { localIso } from '../../lib/home/today';

const MAX_ROWS = 5;
const ROW = 'block py-2 border-t border-border first:border-t-0';

function Block({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-text-muted mb-2 flex items-center justify-between gap-2">
        <span>{title}</span>{right}
      </p>
      {children}
    </Card>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-text-muted">{children}</p>;

/** The common half of every home page: the same blocks, in the same place, for every role. */
export function CommonDesk() {
  const { user } = useAuth();
  const { calendarEvents, holidays, meetings, committeeMembers, tickets, contributionRequests } = useData();
  const { proposals } = useProposals();
  const { reports: progressReports } = useProjectReports();
  const [doorOpen, setDoorOpen] = useState(false);
  const { staffId, actions, claimed } = useHome();

  const now = useMemo(() => new Date(), []);
  const today = localIso(now);

  const ownMeetings = useMemo(
    () => (staffId ? deriveOwnMeetings(meetings, committeeMembers, staffId, now) : []),
    [meetings, committeeMembers, staffId, now],
  );
  const day = useMemo(
    () => withoutClaimed(myDay({ events: calendarEvents, holidays, meetings: ownMeetings, actions, now }), claimed),
    [calendarEvents, holidays, ownMeetings, actions, now, claimed],
  );
  const requests = useMemo(
    () => (user ? myRequests({ userId: user.id, tickets, proposals, progressReports, contributions: contributionRequests, now }) : []),
    [user, tickets, proposals, progressReports, contributionRequests, now],
  );
  const committees = useMemo(() => withoutClaimed(
    ownMeetings.map(m => ({ key: `meeting:${m.id}`, meeting: m })), claimed,
  ), [ownMeetings, claimed]);

  return (
    <aside aria-label="Common desk" className="space-y-3">
      <div>
        <Button variant="secondary" type="button" className="w-full" aria-expanded={doorOpen} onClick={() => setDoorOpen(o => !o)}>
          <LifeBuoy size={15} className="mr-1.5" aria-hidden="true" />Raise a request
          <ChevronDown size={14} className={doorOpen ? 'ml-1.5 rotate-180 transition-transform' : 'ml-1.5 transition-transform'} aria-hidden="true" />
        </Button>
        {doorOpen && (
          <Card className="p-2 mt-2">
            <ul aria-label="What do you need">
              {REQUEST_KINDS.map(k => (
                <li key={k.key}>
                  <Link to={requestLink(k)} className="block px-2 py-2 rounded-md text-sm text-text hover:bg-surface-hover">{k.label}</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Block title="My day" right={<Link to="/calendar" className="inline-block py-1.5 -my-1.5 hover:underline">Calendar</Link>}>
        {day.rows.length === 0
          ? <Empty>{day.hidden > 0 ? 'Nothing else today or tomorrow.' : 'Nothing today or tomorrow.'}</Empty>
          : day.rows.slice(0, MAX_ROWS).map((r) => {
            const body = (
              <>
                <p className="text-sm text-text truncate" title={r.title}>{r.title}</p>
                <p className="text-xs text-text-muted truncate">
                  <span className="font-mono">{r.date === today ? 'today' : 'tomorrow'}</span>
                  {' · '}{r.kind === 'due' ? 'due' : r.kind}{r.detail && r.kind !== 'holiday' ? ` · ${r.detail}` : ''}
                </p>
              </>
            );
            return r.link
              ? <Link key={r.key} to={r.link} className={`${ROW} hover:underline`}>{body}</Link>
              : <div key={r.key} className={ROW}>{body}</div>;
          })}
        {day.hidden > 0 && <p className="text-xs text-text-muted mt-2">+<span className="font-mono">{day.hidden}</span> on the left</p>}
      </Block>

      <Block title="My requests" right={<span className="font-mono">{requests.length}</span>}>
        {requests.length === 0
          ? <Empty>You have no open request.</Empty>
          : requests.slice(0, MAX_ROWS).map(r => (
            <Link key={r.key} to={r.link} className={`${ROW} hover:underline`}>
              <p className="text-sm text-text truncate" title={r.title}>{r.title}</p>
              <p className="text-xs text-text-muted truncate">
                {r.holder} · <span className="font-mono">{r.days} d</span>
              </p>
            </Link>
          ))}
      </Block>

      <Block title="Notices">
        <NoticesBlock />
      </Block>

      <Block title="People" right={<Link to="/staff" className="inline-block py-1.5 -my-1.5 hover:underline">Directory</Link>}>
        <Empty>Who is away today is not connected yet.</Empty>
      </Block>

      {committees.rows.length > 0 && (
        <Block title="My committees" right={<Link to="/committees" className="inline-block py-1.5 -my-1.5 hover:underline">See all</Link>}>
          {committees.rows.slice(0, MAX_ROWS).map(({ key, meeting: m }) => (
            <Link key={key} to={`/committees/${m.committee_id}/meetings/${m.id}`} className={`${ROW} hover:underline`}>
              <p className="text-sm text-text truncate" title={m.title}>{m.title}</p>
              <p className="text-xs text-text-muted font-mono">{m.meeting_date}</p>
            </Link>
          ))}
        </Block>
      )}
    </aside>
  );
}

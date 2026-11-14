import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { deriveOwnMeetings } from '../../lib/dashboard/scientistData';
import { currentNotices, myDay, myRequests, withoutClaimed } from '../../lib/home/desk';
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
  const { calendarEvents, holidays, meetings, committeeMembers, tickets } = useData();
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
  const requests = useMemo(() => (user ? myRequests(tickets, user.id, now) : []), [tickets, user, now]);
  const notices = useMemo(() => currentNotices(calendarEvents, now), [calendarEvents, now]);
  const committees = useMemo(() => withoutClaimed(
    ownMeetings.map(m => ({ key: `meeting:${m.id}`, meeting: m })), claimed,
  ), [ownMeetings, claimed]);

  return (
    <aside aria-label="Common desk" className="space-y-3">
      <Link to="/helpdesk/new" className="block">
        <Button variant="secondary" type="button" className="w-full">
          <LifeBuoy size={15} className="mr-1.5" aria-hidden="true" />Raise a request
        </Button>
      </Link>

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

      <Block title="My requests" right={<Link to="/helpdesk" className="inline-block py-1.5 -my-1.5 hover:underline">See all</Link>}>
        {requests.length === 0
          ? <Empty>You have no open request.</Empty>
          : requests.slice(0, MAX_ROWS).map(r => (
            <Link key={r.key} to={r.link} className={`${ROW} hover:underline`}>
              <p className="text-sm text-text truncate" title={r.title}>{r.title}</p>
              <p className="text-xs text-text-muted truncate">
                {r.holder} · <span className="font-mono">{r.days} d</span> · {r.state}
              </p>
            </Link>
          ))}
      </Block>

      <Block title="Notices">
        {notices.length === 0
          ? <Empty>No notices in the last two weeks.</Empty>
          : notices.slice(0, MAX_ROWS).map(n => (
            <Link key={n.id} to="/calendar" className={`${ROW} hover:underline`}>
              <p className="text-sm text-text truncate" title={n.title}>{n.title}</p>
              <p className="text-xs text-text-muted font-mono">{n.event_date}</p>
            </Link>
          ))}
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

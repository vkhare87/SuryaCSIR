import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { useHome } from '../../../contexts/HomeContext';
import { deriveUpcomingWeekEvents } from '../../../lib/dashboard/scientistData';

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function MyDayBlock() {
  const { calendarEvents, holidays } = useData();
  const { todayIso, myDayItems } = useHome();
  const tomorrowIso = useMemo(() => addDaysIso(todayIso, 1), [todayIso]);

  const upcoming = useMemo(() => {
    if (myDayItems && myDayItems.length > 0) {
      return myDayItems.map((item) => ({
        id: `${item.subjectType}-${item.subjectId}`,
        label: item.title,
        date: item.at,
        link: item.link,
      }));
    }
    const [y, m, d] = todayIso.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    return deriveUpcomingWeekEvents(calendarEvents, holidays, start).map((e) => ({
      id: e.id,
      label: e.label,
      date: e.date,
      link: '/calendar',
    }));
  }, [myDayItems, calendarEvents, holidays, todayIso]);

  const todayAndTomorrow = useMemo(
    () => upcoming.filter((e) => e.date === todayIso || e.date === tomorrowIso).slice(0, 5),
    [upcoming, todayIso, tomorrowIso],
  );

  const sevenDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(todayIso, i);
      const count = upcoming.filter((e) => e.date === iso).length;
      const [yy, mm, dd] = iso.split('-').map(Number);
      const label = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' });
      return { iso, label, count };
    }),
    [upcoming, todayIso],
  );

  return (
    <section aria-label="My day" className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <CalendarDays size={13} /> My day
        </h2>
        <Link to="/calendar" className="text-xs text-text-muted hover:text-text hover:underline">
          See all
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {sevenDays.map((d) => (
          <div
            key={d.iso}
            className={`rounded-md py-1 text-[11px] font-mono tabular-nums ${
              d.iso === todayIso ? 'bg-surface-hover font-semibold text-text' : 'text-text-muted'
            }`}
            title={`${d.iso}: ${d.count} item(s)`}
          >
            <div>{d.label}</div>
            <div className="text-[10px]">{d.count > 0 ? d.count : '·'}</div>
          </div>
        ))}
      </div>

      {todayAndTomorrow.length === 0 ? (
        <p className="text-xs text-text-muted">No scheduled events today or tomorrow.</p>
      ) : (
        <ul className="space-y-1.5">
          {todayAndTomorrow.map((ev) => (
            <li key={ev.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-text truncate">{ev.label}</span>
              <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">
                {ev.date === todayIso ? 'Today' : 'Tomorrow'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

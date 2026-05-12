import { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { Card } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  MapPin,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Plus,
} from 'lucide-react';
import clsx from 'clsx';
import type { Meeting, ActionItem } from '../types';

type EventType = 'meeting' | 'action' | 'admin';

interface CalEvent {
  id: string;
  title: string;
  location: string;
  type: EventType;
  date: Date;
  meta: string;
}

const EVENT_COLOR: Record<EventType, string> = {
  meeting: 'bg-[#c96442]',
  action:  'bg-amber-500',
  admin:   'bg-emerald-500',
};

const EVENT_LABEL: Record<EventType, string> = {
  meeting: 'Meeting',
  action:  'Action Item',
  admin:   'Admin',
};

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function meetingToEvent(m: Meeting): CalEvent {
  return {
    id: `m-${m.id}`,
    title: m.title,
    location: m.venue || 'TBD',
    type: 'meeting',
    date: new Date(m.meeting_date),
    meta: m.status,
  };
}

function actionItemToEvent(a: ActionItem): CalEvent {
  return {
    id: `a-${a.id}`,
    title: a.task,
    location: 'Action item',
    type: 'action',
    date: new Date(a.deadline),
    meta: a.status,
  };
}

export default function Calendar() {
  const { meetings, actionItems, isLoading } = useData();
  const today = new Date();
  const isEmpty = meetings.length === 0 && actionItems.length === 0;
  const [calDate, setCalDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());

  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  // Flatten meetings + action items into a single event list.
  const events: CalEvent[] = useMemo(() => {
    const m = meetings.map(meetingToEvent);
    const a = actionItems
      .filter(item => item.status !== 'Completed')
      .map(actionItemToEvent);
    return [...m, ...a];
  }, [meetings, actionItems]);

  // Events keyed by ISO date string for quick lookup.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const prevMonth = () => setCalDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCalDate(new Date(year, month + 1, 1));

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [firstDayOfWeek, daysInMonth]);

  const dayKey = (d: number) => `${year}-${month}-${d}`;
  const dayEvents = eventsByDate.get(dayKey(selectedDay)) ?? [];

  const weekDays = useMemo(() => {
    const base = new Date(year, month, selectedDay || 1);
    const dow = base.getDay();
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((dow + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [year, month, selectedDay]);

  // Upcoming = next 5 events at or after today.
  const upcoming = useMemo(() => {
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return events
      .filter(e => e.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Executive Calendar</h1>
          <p className="text-text-muted mt-1">Meetings &amp; Action Items Timeline</p>
        </div>
        <button className="bg-[#c96442] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors flex items-center gap-2 self-start md:self-auto">
          <Plus size={16} />
          New Event
        </button>
      </div>

      {!isLoading && isEmpty ? (
        <EmptyState
          icon={CalendarDays}
          title="No meetings or action items"
          description="Create a meeting or action item from the Committees workspace."
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text text-sm">
                {MONTH_NAMES[month]} {year}
              </h3>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-1 hover:bg-surface-hover rounded-md text-text-muted transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={nextMonth} className="p-1 hover:bg-surface-hover rounded-md text-text-muted transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
              {DAY_NAMES.map((d, i) => (
                <div key={i} className="text-[10px] font-bold text-text-muted/60 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {calendarCells.map((day, i) => {
                if (!day) return <div key={i} />;
                const isToday = isCurrentMonth && day === today.getDate();
                const isSelected = day === selectedDay;
                const hasEvent = eventsByDate.has(dayKey(day));
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    className={clsx(
                      'relative py-1.5 text-xs rounded-md cursor-pointer transition-colors',
                      isToday && !isSelected && 'text-[#c96442] font-semibold',
                      isSelected ? 'bg-[#c96442] text-white font-bold' : 'hover:bg-surface-hover text-text'
                    )}
                  >
                    {day}
                    {hasEvent && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#c96442]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3 text-[10px] text-text-muted">
              {Object.entries(EVENT_COLOR).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={clsx('w-2 h-2 rounded-full', color)} />
                  {EVENT_LABEL[type as EventType]}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-text mb-4 text-sm">Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="text-xs text-text-muted">Nothing scheduled.</p>
            ) : (
              <div className="space-y-4">
                {upcoming.map(e => (
                  <div key={e.id} className={clsx('border-l-2 pl-3', EVENT_COLOR[e.type].replace('bg-', 'border-'))}>
                    <p className="text-xs font-bold text-text truncate" title={e.title}>{e.title}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{EVENT_LABEL[e.type]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Main schedule */}
        <div className="lg:col-span-3">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-surface-hover flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon size={18} className="text-[#c96442]" />
                <h3 className="font-bold text-text">
                  {viewMode === 'day'
                    ? `${MONTH_NAMES[month]} ${selectedDay}, ${year}`
                    : `Week of ${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </h3>
              </div>
              <div className="flex gap-1 bg-surface border border-border p-1 rounded-md">
                <button
                  onClick={() => setViewMode('day')}
                  className={clsx(
                    'px-3 py-1 text-[10px] font-bold rounded transition-colors',
                    viewMode === 'day' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'
                  )}
                >
                  Day
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={clsx(
                    'px-3 py-1 text-[10px] font-bold rounded transition-colors',
                    viewMode === 'week' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'
                  )}
                >
                  Week
                </button>
              </div>
            </div>

            {viewMode === 'day' ? (
              <div className="p-2 min-h-[320px]">
                {dayEvents.length > 0 ? dayEvents.map(event => (
                  <div
                    key={event.id}
                    className="group relative pl-4 py-4 border-b border-border last:border-0 hover:bg-surface-hover transition-colors rounded-xl mx-2"
                  >
                    <div className={clsx('absolute left-0 top-2 bottom-2 w-1 rounded-full', EVENT_COLOR[event.type])} />
                    <div className="flex items-start justify-between pl-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx('w-2 h-2 rounded-full', EVENT_COLOR[event.type])} />
                          <h4 className="font-bold text-text truncate" title={event.title}>{event.title}</h4>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-text-muted">
                          <div className="flex items-center gap-1">
                            <MapPin size={12} />
                            {event.location}
                          </div>
                          <div className="text-[10px] uppercase">{EVENT_LABEL[event.type]} · {event.meta}</div>
                        </div>
                      </div>
                      <button className="text-text-muted p-1 hover:bg-surface rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center h-48 text-text-muted text-sm">
                    <CalendarIcon size={32} className="mb-3 opacity-30" />
                    No events scheduled for this day.
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-8 border-b border-border bg-surface-hover">
                  <div className="p-3" />
                  {weekDays.map((d, i) => {
                    const isToday = d.toDateString() === today.toDateString();
                    return (
                      <div key={i} className="p-3 text-center border-l border-border">
                        <div className="text-[10px] font-bold text-text-muted uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</div>
                        <div className={clsx(
                          'text-lg font-black mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto',
                          isToday ? 'bg-[#c96442] text-white' : 'text-text'
                        )}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 min-h-[300px]">
                  <div className="border-r border-border p-2 text-[10px] font-bold text-text-muted uppercase">
                    All-day
                  </div>
                  {weekDays.map((d, i) => {
                    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                    const dayEvts = eventsByDate.get(key) ?? [];
                    return (
                      <div key={i} className="border-l border-border p-2 space-y-1 min-h-[120px]">
                        {dayEvts.map(e => (
                          <div
                            key={e.id}
                            className={clsx(
                              'rounded-md p-1.5 text-white text-[10px] font-bold shadow-sm',
                              EVENT_COLOR[e.type]
                            )}
                            title={e.title}
                          >
                            <div className="truncate">{e.title}</div>
                            <div className="opacity-80 font-normal">{EVENT_LABEL[e.type]}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>

      </div>
      )}
    </div>
  );
}

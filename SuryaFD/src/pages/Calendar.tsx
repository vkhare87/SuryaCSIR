import { useState, useMemo } from 'react';
import { Card } from '../components/ui/Cards';
import {
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Plus
} from 'lucide-react';
import clsx from 'clsx';

type EventType = 'internal' | 'academic' | 'admin';

interface CalEvent {
  id: number;
  title: string;
  time: string;
  location: string;
  type: EventType;
  date: number; // day-of-month
  duration: string;
}

const EVENT_COLOR: Record<EventType, string> = {
  internal: 'bg-brand-blue',
  academic: 'bg-purple-500',
  admin: 'bg-emerald-500',
};

const EVENT_LABEL_COLOR: Record<EventType, string> = {
  internal: 'text-brand-blue',
  academic: 'text-purple-500',
  admin: 'text-emerald-500',
};

const SAMPLE_EVENTS: CalEvent[] = [
  { id: 1, title: 'Division Weekly Meet', time: '10:00 AM', location: 'Meeting Room A', type: 'internal', date: new Date().getDate(), duration: '1h' },
  { id: 2, title: 'PhD Progress Seminar', time: '2:30 PM', location: 'Conference Hall', type: 'academic', date: new Date().getDate(), duration: '2h' },
  { id: 3, title: 'Budget Review FY26', time: '4:00 PM', location: 'Director Cabin', type: 'admin', date: new Date().getDate(), duration: '1h' },
  { id: 4, title: 'Scientist Assessment Group-IV', time: '9:00 AM', location: 'Board Room', type: 'admin', date: 12, duration: '4h' },
  { id: 5, title: 'Project Audit GAP0111', time: '11:00 AM', location: 'Lab-3', type: 'internal', date: 28, duration: '3h' },
];

const UPCOMING_ASSESSMENTS = [
  { title: 'Scientist Assessment Group-IV', dateStr: 'April 12 – 15', color: 'border-amber-500' },
  { title: 'Project Audit GAP0111', dateStr: 'April 28, 2026', color: 'border-brand-blue' },
];

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Calendar() {
  const today = new Date();
  const [calDate, setCalDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());

  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const prevMonth = () => setCalDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCalDate(new Date(year, month + 1, 1));

  // Build 6-row × 7-col grid
  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [firstDayOfWeek, daysInMonth]);

  // Events for the selected day (when in current month)
  const dayEvents = SAMPLE_EVENTS.filter(e =>
    isCurrentMonth ? e.date === selectedDay : false
  );

  // Week view: show Mon–Sun of the week containing selectedDay
  const weekDays = useMemo(() => {
    const base = new Date(year, month, selectedDay || 1);
    const dow = base.getDay(); // 0 = Sun
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((dow + 6) % 7)); // Mon start
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [year, month, selectedDay]);


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Executive Calendar</h1>
          <p className="text-text-muted mt-1">Schedule &amp; Institutional Assessment Timeline</p>
        </div>
        <button className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue-dark transition-colors flex items-center gap-2 shadow-md self-start md:self-auto">
          <Plus size={16} />
          New Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ── Sidebar ── */}
        <div className="lg:col-span-1 space-y-6">

          {/* Mini Calendar */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text text-sm">
                {MONTH_NAMES[month]} {year}
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={prevMonth}
                  className="p-1 hover:bg-surface-hover rounded-md text-text-muted transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1 hover:bg-surface-hover rounded-md text-text-muted transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
              {DAY_NAMES.map((d, i) => (
                <div key={i} className="text-[10px] font-bold text-text-muted/60 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {calendarCells.map((day, i) => {
                if (!day) return <div key={i} />;
                const isToday = isCurrentMonth && day === today.getDate();
                const isSelected = isCurrentMonth && day === selectedDay;
                const hasEvent = isCurrentMonth && SAMPLE_EVENTS.some(e => e.date === day);
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedDay(day); }}
                    className={clsx(
                      'relative py-1.5 text-xs rounded-md cursor-pointer transition-colors',
                      isToday && !isSelected && 'text-brand-blue font-black',
                      isSelected ? 'bg-brand-blue text-white font-bold' : 'hover:bg-surface-hover text-text'
                    )}
                  >
                    {day}
                    {hasEvent && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-blue" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3 text-[10px] text-text-muted">
              {Object.entries(EVENT_COLOR).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 capitalize">
                  <div className={clsx('w-2 h-2 rounded-full', color)} />
                  {type}
                </div>
              ))}
            </div>
          </Card>

          {/* Upcoming Assessments */}
          <Card>
            <h3 className="font-bold text-text mb-4 text-sm">Upcoming Assessments</h3>
            <div className="space-y-4">
              {UPCOMING_ASSESSMENTS.map((a, i) => (
                <div key={i} className={clsx('border-l-2 pl-3', a.color)}>
                  <p className="text-xs font-bold text-text truncate">{a.title}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{a.dateStr}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Main Schedule View ── */}
        <div className="lg:col-span-3">
          <Card className="p-0 overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-border bg-surface-hover flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon size={18} className="text-brand-blue" />
                <h3 className="font-bold text-text">
                  {viewMode === 'day'
                    ? isCurrentMonth
                      ? `${MONTH_NAMES[month]} ${selectedDay}, ${year}`
                      : `${MONTH_NAMES[month]} ${year}`
                    : `Week of ${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                  }
                </h3>
              </div>
              <div className="flex gap-1 bg-surface border border-border p-1 rounded-md">
                <button
                  onClick={() => setViewMode('day')}
                  className={clsx(
                    'px-3 py-1 text-[10px] font-bold rounded transition-colors',
                    viewMode === 'day' ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text'
                  )}
                >
                  Day
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={clsx(
                    'px-3 py-1 text-[10px] font-bold rounded transition-colors',
                    viewMode === 'week' ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text'
                  )}
                >
                  Week
                </button>
              </div>
            </div>

            {viewMode === 'day' ? (
              /* Day View */
              <div className="p-2 min-h-[320px]">
                {dayEvents.length > 0 ? dayEvents.map(event => (
                  <div
                    key={event.id}
                    className="group relative pl-16 py-6 border-b border-border last:border-0 hover:bg-surface-hover transition-colors rounded-xl mx-2"
                  >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-14 text-center">
                      <span className="text-[10px] font-bold text-text-muted uppercase block">
                        {event.time.split(' ')[1]}
                      </span>
                      <span className="text-sm font-bold text-text">{event.time.split(' ')[0]}</span>
                    </div>
                    <div className={clsx('absolute left-14 top-0 bottom-0 w-0.5', EVENT_COLOR[event.type])} />
                    <div className="flex items-start justify-between pl-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx('w-2 h-2 rounded-full', EVENT_COLOR[event.type])} />
                          <h4 className={clsx('font-bold text-text group-hover:transition-colors', `group-hover:${EVENT_LABEL_COLOR[event.type]}`)}>
                            {event.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-text-muted">
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            Duration: {event.duration}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin size={12} />
                            {event.location}
                          </div>
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
              /* Week View */
              <div className="overflow-x-auto">
                {/* Week header */}
                <div className="grid grid-cols-8 border-b border-border bg-surface-hover">
                  <div className="p-3" />
                  {weekDays.map((d, i) => {
                    const isToday = d.toDateString() === today.toDateString();
                    return (
                      <div key={i} className="p-3 text-center border-l border-border">
                        <div className="text-[10px] font-bold text-text-muted uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</div>
                        <div className={clsx(
                          'text-lg font-black mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto',
                          isToday ? 'bg-brand-blue text-white' : 'text-text'
                        )}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Week body */}
                <div className="grid grid-cols-8 min-h-[300px]">
                  {/* Time column */}
                  <div className="border-r border-border">
                    {['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'].map(t => (
                      <div key={t} className="h-14 border-b border-border/50 px-2 pt-1">
                        <span className="text-[10px] font-bold text-text-muted">{t}</span>
                      </div>
                    ))}
                  </div>
                  {/* Day columns */}
                  {weekDays.map((d, i) => {
                    const dayEvts = SAMPLE_EVENTS.filter(e =>
                      d.getMonth() === month && d.getDate() === e.date
                    );
                    return (
                      <div key={i} className="border-l border-border relative">
                        {Array.from({ length: 9 }).map((_, hi) => (
                          <div key={hi} className="h-14 border-b border-border/30" />
                        ))}
                        {dayEvts.map(e => (
                          <div
                            key={e.id}
                            className={clsx(
                              'absolute left-1 right-1 rounded-lg p-1.5 text-white text-[10px] font-bold shadow-sm',
                              EVENT_COLOR[e.type]
                            )}
                            style={{ top: `${(parseInt(e.time) - 9) * 56 + (e.time.includes('30') ? 28 : 0)}px` }}
                          >
                            <div className="truncate">{e.title}</div>
                            <div className="opacity-80 font-normal">{e.time}</div>
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
    </div>
  );
}

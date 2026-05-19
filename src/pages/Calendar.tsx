import { useState, useMemo, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../utils/supabaseClient';
import { Card } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import clsx from 'clsx';
import { EventCreateModal } from '../components/calendar/EventCreateModal';
import { EventDetailModal } from '../components/calendar/EventDetailModal';
import type { EventFormValues } from '../components/calendar/EventForm';
import { canCreateEvent } from '../lib/calendar/permissions';
import {
  deriveBirthdayEvents,
  deriveRetirementEvents,
  deriveProjectClosingEvents,
} from '../lib/calendar/deriveEvents';
import {
  EVENT_COLOR,
  EVENT_LABEL,
  type CalEvent,
  type CalEventKind,
} from '../lib/calendar/types';
import type { Meeting, ActionItem, CalendarEvent, Holiday } from '../types';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function meetingToEvent(m: Meeting): CalEvent {
  return {
    kind: 'meeting',
    id: `m-${m.id}`,
    title: m.title,
    location: m.venue || 'TBD',
    date: new Date(m.meeting_date),
    meta: m.status,
    source: m,
  };
}

function actionItemToEvent(a: ActionItem): CalEvent {
  return {
    kind: 'action',
    id: `a-${a.id}`,
    title: a.task,
    location: 'Action item',
    date: new Date(a.deadline),
    meta: a.status,
    source: a,
  };
}

function calendarEventToEvent(c: CalendarEvent): CalEvent {
  const subKind: 'custom' | 'pamphlet' | 'announcement' =
    c.event_kind === 'Pamphlet' ? 'pamphlet'
    : c.event_kind === 'Announcement' ? 'announcement'
    : 'custom';
  return {
    kind: subKind,
    id: `ce-${c.id}`,
    title: c.title,
    location: c.location || 'TBD',
    date: new Date(c.event_date),
    meta: c.visibility,
    source: c,
  };
}

function holidayToEvent(h: Holiday): CalEvent {
  return {
    kind: 'holiday',
    id: `h-${h.id}`,
    title: h.name,
    location: '',
    date: new Date(h.holiday_date),
    meta: h.holiday_type,
    source: h,
  };
}

export default function Calendar() {
  const {
    meetings, actionItems, calendarEvents, holidays, projects, staff, divisions,
    isLoading, refreshCalendar,
  } = useData();
  const { user, activeRole } = useAuth();
  const { push: pushToast } = useToast();

  const today = new Date();
  const [calDate, setCalDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());

  const [personal, setPersonal] = useState<boolean>(
    () => localStorage.getItem('surya_calendar_personal') === 'true'
  );
  useEffect(() => {
    localStorage.setItem('surya_calendar_personal', String(personal));
  }, [personal]);

  const [kindFilter, setKindFilter] = useState<Set<CalEventKind>>(new Set());
  function toggleKindFilter(k: CalEventKind) {
    setKindFilter(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);

  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  const events: CalEvent[] = useMemo(() => {
    const m = meetings.map(meetingToEvent);
    const a = actionItems.filter(it => it.status !== 'Completed').map(actionItemToEvent);
    const c = calendarEvents.map(calendarEventToEvent);
    const h = holidays.map(holidayToEvent);

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const pc = deriveProjectClosingEvents(projects, firstOfMonth, lastOfMonth);
    const b = deriveBirthdayEvents(staff, year, month);
    const r = deriveRetirementEvents(staff, year, month);

    const all = [...m, ...c, ...h, ...pc];
    if (personal) {
      all.push(...a, ...b, ...r);
    }
    return all;
  }, [meetings, actionItems, calendarEvents, holidays, projects, staff, year, month, personal]);

  const visibleEvents = useMemo(() => {
    if (kindFilter.size === 0) return events;
    return events.filter(e => !kindFilter.has(e.kind));
  }, [events, kindFilter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visibleEvents) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [visibleEvents]);

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

  const upcoming = useMemo(() => {
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return visibleEvents
      .filter(e => e.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents]);

  const canCreate = activeRole ? canCreateEvent(activeRole) : false;
  const userId = user?.id ?? '';

  async function handleCreate(values: EventFormValues) {
    if (!supabase || !user) return;
    const { error } = await supabase.from('calendar_events').insert({
      title: values.title,
      event_date: values.event_date,
      event_kind: values.event_kind,
      location: values.location,
      teams_url: values.teams_url || null,
      pamphlet_url: values.pamphlet_url || null,
      description: values.description,
      visibility: values.visibility,
      division_code: values.visibility === 'Division' ? values.division_code : null,
      created_by: user.id,
    });
    if (error) {
      pushToast(`Create failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Event created', 'success');
    await refreshCalendar();
  }

  async function handleUpdate(id: string, values: EventFormValues) {
    if (!supabase) return;
    const { error } = await supabase.from('calendar_events').update({
      title: values.title,
      event_date: values.event_date,
      event_kind: values.event_kind,
      location: values.location,
      teams_url: values.teams_url || null,
      pamphlet_url: values.pamphlet_url || null,
      description: values.description,
      visibility: values.visibility,
      division_code: values.visibility === 'Division' ? values.division_code : null,
    }).eq('id', id);
    if (error) {
      pushToast(`Update failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Event updated', 'success');
    await refreshCalendar();
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) {
      pushToast(`Delete failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Event deleted', 'success');
    await refreshCalendar();
  }

  const isEmpty =
    meetings.length === 0 && actionItems.length === 0 &&
    calendarEvents.length === 0 && holidays.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Executive Calendar</h1>
          <p className="text-text-muted mt-1">Institute Events Timeline</p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={personal}
              onChange={(e) => setPersonal(e.target.checked)}
            />
            Personal staff layer
          </label>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
            title={canCreate ? '' : 'Insufficient permissions'}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
              canCreate
                ? 'bg-[#c96442] text-white hover:bg-[#b5593b]'
                : 'bg-surface text-text-muted/50 cursor-not-allowed border border-border'
            )}
          >
            <Plus size={16} />
            New Event
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(EVENT_LABEL) as CalEventKind[]).map(k => {
          const off = kindFilter.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleKindFilter(k)}
              className={clsx(
                'px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5',
                off ? 'border-border text-text-muted/50 line-through' : 'border-border text-text hover:bg-surface-hover'
              )}
            >
              <span className={clsx('w-2 h-2 rounded-full', EVENT_COLOR[k])} />
              {EVENT_LABEL[k]}
            </button>
          );
        })}
      </div>

      {!isLoading && isEmpty ? (
        <EmptyState
          icon={CalendarDays}
          title="No events yet"
          description="Create a calendar event from the New Event button, or have a SystemAdmin add holidays."
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text text-sm">{MONTH_NAMES[month]} {year}</h3>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-1 hover:bg-surface-hover rounded-md text-text-muted">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={nextMonth} className="p-1 hover:bg-surface-hover rounded-md text-text-muted">
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
                const cellEvents = eventsByDate.get(dayKey(day)) ?? [];
                const hasEvent = cellEvents.length > 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    title={hasEvent ? `${cellEvents.length} event(s)` : ''}
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
          </Card>

          <Card>
            <h3 className="font-bold text-text mb-4 text-sm">Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="text-xs text-text-muted">Nothing scheduled.</p>
            ) : (
              <div className="space-y-4">
                {upcoming.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setDetailEvent(e)}
                    className={clsx(
                      'w-full text-left border-l-2 pl-3 hover:bg-surface-hover rounded-md py-1',
                      EVENT_COLOR[e.kind].replace('bg-', 'border-')
                    )}
                  >
                    <p className="text-xs font-bold text-text truncate" title={e.title}>{e.title}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{EVENT_LABEL[e.kind]}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

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
                <button onClick={() => setViewMode('day')} className={clsx('px-3 py-1 text-[10px] font-bold rounded', viewMode === 'day' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text')}>Day</button>
                <button onClick={() => setViewMode('week')} className={clsx('px-3 py-1 text-[10px] font-bold rounded', viewMode === 'week' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text')}>Week</button>
              </div>
            </div>

            {viewMode === 'day' ? (
              <div className="p-2 min-h-[320px]">
                {dayEvents.length > 0 ? dayEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => setDetailEvent(event)}
                    className="group relative w-full text-left pl-4 py-4 border-b border-border last:border-0 hover:bg-surface-hover rounded-xl mx-2"
                  >
                    <div className={clsx('absolute left-0 top-2 bottom-2 w-1 rounded-full', EVENT_COLOR[event.kind])} />
                    <div className="pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx('w-2 h-2 rounded-full', EVENT_COLOR[event.kind])} />
                        <h4 className="font-bold text-text truncate" title={event.title}>{event.title}</h4>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-muted">
                        <div className="flex items-center gap-1"><MapPin size={12} />{event.location || '—'}</div>
                        <div className="text-[10px] uppercase">{EVENT_LABEL[event.kind]} · {event.meta}</div>
                      </div>
                    </div>
                  </button>
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
                        <div className={clsx('text-lg font-black mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto', isToday ? 'bg-[#c96442] text-white' : 'text-text')}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 min-h-[300px]">
                  <div className="border-r border-border p-2 text-[10px] font-bold text-text-muted uppercase">All-day</div>
                  {weekDays.map((d, i) => {
                    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                    const dayEvts = eventsByDate.get(key) ?? [];
                    return (
                      <div key={i} className="border-l border-border p-2 space-y-1 min-h-[120px]">
                        {dayEvts.map(e => (
                          <button
                            key={e.id}
                            onClick={() => setDetailEvent(e)}
                            className={clsx('w-full text-left rounded-md p-1.5 text-white text-[10px] font-bold shadow-sm', EVENT_COLOR[e.kind])}
                            title={e.title}
                          >
                            <div className="truncate">{e.title}</div>
                            <div className="opacity-80 font-normal">{EVENT_LABEL[e.kind]}</div>
                          </button>
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

      <EventCreateModal
        open={createOpen}
        divisions={divisions}
        defaultDivisionCode={user?.divisionCode ?? ''}
        onSubmit={handleCreate}
        onClose={() => setCreateOpen(false)}
      />

      <EventDetailModal
        event={detailEvent}
        open={!!detailEvent}
        divisions={divisions}
        userId={userId}
        activeRole={activeRole ?? 'Guest'}
        onClose={() => setDetailEvent(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}

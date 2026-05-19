import { useState } from 'react';
import { X, MapPin, Calendar as CalendarIcon, Edit2, Trash2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { EventForm, type EventFormValues } from './EventForm';
import { EVENT_COLOR, EVENT_LABEL, type CalEvent } from '../../lib/calendar/types';
import { canEditEvent } from '../../lib/calendar/permissions';
import { formatDate } from '../../utils/dateUtils';
import type { DivisionInfo, Role } from '../../types';

interface EventDetailModalProps {
  event: CalEvent | null;
  open: boolean;
  divisions: DivisionInfo[];
  userId: string;
  activeRole: Role;
  onClose: () => void;
  onUpdate: (id: string, values: EventFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EventDetailModal({
  event,
  open,
  divisions,
  userId,
  activeRole,
  onClose,
  onUpdate,
  onDelete,
}: EventDetailModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!open || !event) return null;

  const isCalendarEvent =
    event.kind === 'custom' ||
    event.kind === 'pamphlet' ||
    event.kind === 'announcement';
  const isHoliday = event.kind === 'holiday';
  const isDerived =
    event.kind === 'birthday' ||
    event.kind === 'retirement' ||
    event.kind === 'project_closing';
  const isMeeting = event.kind === 'meeting';
  const isAction = event.kind === 'action';

  const canEdit = isCalendarEvent && canEditEvent(event.source, userId, activeRole);
  const canEditHoliday = isHoliday && (activeRole === 'SystemAdmin' || activeRole === 'MasterAdmin');

  const sourceLabel = (() => {
    if (event.kind === 'birthday' || event.kind === 'retirement') return 'from Staff Master';
    if (event.kind === 'project_closing') return 'from Project Master';
    return '';
  })();

  const teamsUrl: string | null = (() => {
    if (event.kind === 'meeting') return event.source.teams_url;
    if (event.kind === 'custom' || event.kind === 'pamphlet' || event.kind === 'announcement') return event.source.teams_url;
    return null;
  })();

  const pamphletUrl: string | null = (() => {
    if (event.kind === 'meeting') return event.source.pamphlet_url;
    if (event.kind === 'custom' || event.kind === 'pamphlet' || event.kind === 'announcement') return event.source.pamphlet_url;
    return null;
  })();

  const description: string = (() => {
    if (event.kind === 'custom' || event.kind === 'pamphlet' || event.kind === 'announcement') return event.source.description;
    return '';
  })();

  function handleClose() {
    setMode('view');
    setConfirmingDelete(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={clsx('w-3 h-3 rounded-full', EVENT_COLOR[event.kind])} />
            <h2 className="font-bold text-text">{event.title}</h2>
          </div>
          <button onClick={handleClose} className="text-text-muted hover:bg-surface-hover p-1 rounded-md" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {mode === 'edit' && isCalendarEvent ? (
          <div className="p-4">
            <EventForm
              initial={event.source}
              divisions={divisions}
              submitLabel="Save"
              onSubmit={async (values) => {
                await onUpdate(event.source.id, values);
                handleClose();
              }}
              onCancel={() => setMode('view')}
            />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4 text-sm text-text-muted">
              <span className="flex items-center gap-1"><CalendarIcon size={14} />{formatDate(event.date)}</span>
              {event.location && <span className="flex items-center gap-1"><MapPin size={14} />{event.location}</span>}
            </div>
            <div className="text-xs uppercase font-bold text-text-muted">
              {EVENT_LABEL[event.kind]}
              {sourceLabel && <span className="ml-2 text-text-muted/70 normal-case font-normal">({sourceLabel})</span>}
            </div>

            {teamsUrl && (
              <a
                href={teamsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#c96442] text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#b5593b]"
              >
                <ExternalLink size={14} />
                Join Meeting
              </a>
            )}

            {pamphletUrl && (
              <a
                href={pamphletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-md text-sm text-text hover:bg-surface-hover ml-2"
              >
                <ExternalLink size={14} />
                View Pamphlet
              </a>
            )}

            {description && (
              <div className="text-sm text-text whitespace-pre-line">{description}</div>
            )}

            {isMeeting && (
              <Link
                to={`/committees/${event.source.committee_id}/meetings/${event.source.id}`}
                className="inline-flex items-center gap-2 text-sm text-[#c96442] hover:underline"
                onClick={handleClose}
              >
                Open in Committees <ExternalLink size={12} />
              </Link>
            )}

            {isAction && (
              <Link
                to={`/committees/${event.source.meeting_id ?? ''}`}
                className="inline-flex items-center gap-2 text-sm text-[#c96442] hover:underline"
                onClick={handleClose}
              >
                Open Action Item <ExternalLink size={12} />
              </Link>
            )}

            {(canEdit || canEditHoliday) && (
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                {canEdit && (
                  <button
                    onClick={() => setMode('edit')}
                    className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text px-3 py-1.5 hover:bg-surface-hover rounded-md"
                  >
                    <Edit2 size={14} /> Edit
                  </button>
                )}
                {confirmingDelete ? (
                  <>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="text-sm text-text-muted px-3 py-1.5 hover:bg-surface-hover rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (isCalendarEvent) await onDelete(event.source.id);
                        else if (isHoliday) await onDelete(event.source.id);
                        handleClose();
                      }}
                      className="text-sm bg-rose-500 text-white px-3 py-1.5 rounded-md hover:bg-rose-600"
                    >
                      Confirm Delete
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex items-center gap-1 text-sm text-rose-500 hover:bg-rose-500/10 px-3 py-1.5 rounded-md"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            )}

            {isDerived && (
              <div className="text-xs text-text-muted/60 pt-3 border-t border-border">
                This event is derived from master data. Edit the source record (Staff / Project) to change it.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

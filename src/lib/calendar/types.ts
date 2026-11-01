import type {
  Meeting,
  ActionItem,
  CalendarEvent,
  Holiday,
  ProjectInfo,
  StaffMember,
} from '../../types';

export type CalEventKind =
  | 'meeting'
  | 'action'
  | 'custom'
  | 'pamphlet'
  | 'announcement'
  | 'holiday'
  | 'project_closing'
  | 'birthday'
  | 'retirement';

interface CalEventBase {
  id: string;
  title: string;
  location: string;
  date: Date;
  meta: string;
}

export type CalEvent =
  | (CalEventBase & { kind: 'meeting'; source: Meeting })
  | (CalEventBase & { kind: 'action'; source: ActionItem })
  | (CalEventBase & { kind: 'custom' | 'pamphlet' | 'announcement'; source: CalendarEvent })
  | (CalEventBase & { kind: 'holiday'; source: Holiday })
  | (CalEventBase & { kind: 'project_closing'; source: ProjectInfo })
  | (CalEventBase & { kind: 'birthday'; source: StaffMember })
  | (CalEventBase & { kind: 'retirement'; source: StaffMember; retirementDate: Date });

export const EVENT_COLOR: Record<CalEventKind, string> = {
  meeting: 'bg-terracotta',
  action: 'bg-turmeric',
  custom: 'bg-archive-green',
  pamphlet: 'bg-iron-gall',
  announcement: 'bg-iron-gall',
  holiday: 'bg-badge-danger-fg',
  project_closing: 'bg-coral',
  birthday: 'bg-text-muted',
  retirement: 'bg-stone-gray',
};

// Literal class names: Tailwind only emits classes it can find in the source,
// so a runtime .replace('bg-', 'border-') produced classes that never existed.
export const EVENT_BORDER: Record<CalEventKind, string> = {
  meeting: 'border-terracotta',
  action: 'border-turmeric',
  custom: 'border-archive-green',
  pamphlet: 'border-iron-gall',
  announcement: 'border-iron-gall',
  holiday: 'border-danger',
  project_closing: 'border-coral',
  birthday: 'border-text-muted',
  retirement: 'border-stone-gray',
};

export const EVENT_LABEL: Record<CalEventKind, string> = {
  meeting: 'Meeting',
  action: 'Action Item',
  custom: 'Custom Event',
  pamphlet: 'Pamphlet',
  announcement: 'Announcement',
  holiday: 'Holiday',
  project_closing: 'Project Closing',
  birthday: 'Birthday',
  retirement: 'Retirement',
};

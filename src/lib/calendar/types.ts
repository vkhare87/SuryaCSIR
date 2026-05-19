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

export const PERSONAL_KINDS: CalEventKind[] = ['birthday', 'retirement', 'action'];
export const ORG_KINDS: CalEventKind[] = [
  'meeting',
  'custom',
  'pamphlet',
  'announcement',
  'holiday',
  'project_closing',
];

export const EVENT_COLOR: Record<CalEventKind, string> = {
  meeting: 'bg-[#c96442]',
  action: 'bg-amber-500',
  custom: 'bg-emerald-500',
  pamphlet: 'bg-indigo-500',
  announcement: 'bg-indigo-500',
  holiday: 'bg-rose-500',
  project_closing: 'bg-purple-500',
  birthday: 'bg-pink-400',
  retirement: 'bg-sky-500',
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

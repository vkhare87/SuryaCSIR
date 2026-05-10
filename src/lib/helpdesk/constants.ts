// Helpdesk constants — pure data, no side effects
import type { TicketCategory, TicketUrgency, TicketStatus, TicketEventType } from '../../types';

// --- Urgency Colors ---
// Follows PMS STATUS_COLORS Record pattern (bg/text/label per value)

export const URGENCY_COLORS: Record<TicketUrgency, { bg: string; text: string; label: string }> = {
  Critical: {
    bg: 'bg-red-50 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
    label: 'Critical',
  },
  High: {
    bg: 'bg-orange-50 dark:bg-orange-950',
    text: 'text-orange-700 dark:text-orange-300',
    label: 'High',
  },
  Medium: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    text: 'text-yellow-700 dark:text-yellow-300',
    label: 'Medium',
  },
  Low: {
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
    label: 'Low',
  },
};

// --- Category Configuration ---
// Array of {value, label, icon} — icon values are lucide-react icon names as strings.
// Pages will import and map them to actual lucide components.

export const CATEGORY_CONFIG: readonly {
  value: TicketCategory;
  label: string;
  icon: string;
}[] = [
  { value: 'Infrastructure', label: 'Infrastructure', icon: 'Building2' },
  { value: 'EquipmentIT', label: 'Equipment/IT', icon: 'Monitor' },
  { value: 'Administrative', label: 'Administrative', icon: 'FileText' },
  { value: 'HRGrievance', label: 'HR/Grievance', icon: 'Users' },
  { value: 'Finance', label: 'Finance', icon: 'DollarSign' },
  { value: 'LabResearch', label: 'Lab/Research', icon: 'FlaskConical' },
  { value: 'Library', label: 'Library', icon: 'Library' },
  { value: 'Transport', label: 'Transport', icon: 'Car' },
] as const;

// --- Event Icons ---
// Maps each ticket event_type to its lucide icon name string.

export const EVENT_ICONS: Record<TicketEventType, string> = {
  Created: 'CirclePlus',
  Assigned: 'UserCheck',
  StatusChanged: 'ArrowRightCircle',
  Resolved: 'CircleCheck',
  Closed: 'CircleX',
  Reopened: 'RotateCcw',
};

// --- Sort Orders ---
// Used by sort comparators and filter tab rendering.

export const URGENCY_SORT_ORDER: readonly TicketUrgency[] = [
  'Critical',
  'High',
  'Medium',
  'Low',
] as const;

export const STATUS_SORT_ORDER: readonly TicketStatus[] = [
  'Open',
  'InProgress',
  'Resolved',
  'Closed',
] as const;

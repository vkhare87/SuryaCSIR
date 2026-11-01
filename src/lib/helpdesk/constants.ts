// Helpdesk constants — pure data, no side effects
import type { TicketCategory, TicketUrgency, TicketStatus, TicketEventType } from '../../types';

// --- Urgency Colors ---
// Follows PMS STATUS_COLORS Record pattern (bg/text/label per value)

export const URGENCY_COLORS: Record<TicketUrgency, { bg: string; text: string; label: string }> = {
  Critical: {
    bg: 'bg-badge-danger-bg',
    text: 'text-badge-danger-fg',
    label: 'Critical',
  },
  High: {
    bg: 'bg-badge-warning-bg',
    text: 'text-badge-warning-fg',
    label: 'High',
  },
  Medium: {
    bg: 'bg-turmeric/15',
    text: 'text-text',
    label: 'Medium',
  },
  Low: {
    bg: 'bg-archive-green/15',
    text: 'text-archive-green',
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

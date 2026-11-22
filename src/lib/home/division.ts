import type { Project } from '../../types';
import { timeOfDayGreeting } from './greeting';
import { parseCost } from '../../utils/parseCost';

export interface ProjectAttention {
  attention: boolean;
  reasons: string[];
}

export function needsAttention(project: Project, todayIso: string): ProjectAttention {
  if (project.ProjectStatus !== 'Active') {
    return { attention: false, reasons: [] };
  }
  const reasons: string[] = [];
  if (project.CompletioDate && project.CompletioDate < todayIso) {
    reasons.push('Behind schedule');
  } else if (project.CompletioDate) {
    const [y, m, d] = todayIso.split('-').map(Number);
    const soon = new Date(Date.UTC(y, m - 1, d + 60)).toISOString().slice(0, 10);
    if (project.CompletioDate <= soon) {
      reasons.push('Ending within 60d');
    }
  }
  const sanctioned = parseCost(project.SanctionedCost);
  const utilized = parseCost(project.UtilizedAmount);
  if (sanctioned > 0 && utilized > sanctioned) {
    reasons.push('Over sanctioned cost');
  }
  return { attention: reasons.length > 0, reasons };
}

export function divisionGreeting(
  headName: string | null | undefined,
  divCode: string | null | undefined,
  exceptionCount: number,
  pendingCount: number,
  now: Date = new Date(),
): string {
  const greet = timeOfDayGreeting(now);
  const name = headName?.trim() || 'Head of Division';
  const scope = divCode ? ` in ${divCode}` : '';
  if (pendingCount === 0 && exceptionCount === 0) {
    return `${greet}, ${name}. Everything${scope} is on track today.`;
  }
  return `${greet}, ${name}. ${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting and ${exceptionCount} division exception${exceptionCount === 1 ? '' : 's'}${scope}.`;
}

export function directorGreeting(
  directorName: string | null | undefined,
  divisionExceptions: number,
  pendingDecisions: number,
  now: Date = new Date(),
): string {
  const greet = timeOfDayGreeting(now);
  const name = directorName?.trim() || 'Director';
  if (pendingDecisions === 0 && divisionExceptions === 0) {
    return `${greet}, ${name}. No pending approvals or division exceptions today.`;
  }
  return `${greet}, ${name}. ${pendingDecisions} decision${pendingDecisions === 1 ? '' : 's'} waiting and ${divisionExceptions} division exception${divisionExceptions === 1 ? '' : 's'}.`;
}

export interface TimerRingState {
  daysLeft: number;
  overdue: boolean;
  shareUsed: number;
  label: string;
}

export function timerRingRatio(
  dueDate: string | null,
  todayIso: string,
  windowDays = 30,
): TimerRingState {
  if (!dueDate) {
    return { daysLeft: windowDays, overdue: false, shareUsed: 0, label: 'Open' };
  }
  const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) {
    return { daysLeft: windowDays, overdue: false, shareUsed: 0, label: dueDate };
  }
  const daysLeft = Math.round((dueMs - todayMs) / 86400000);
  if (daysLeft < 0) {
    return { daysLeft, overdue: true, shareUsed: 1, label: `${daysLeft}d` };
  }
  const shareUsed = Math.max(0, Math.min(1, 1 - daysLeft / Math.max(1, windowDays)));
  return { daysLeft, overdue: false, shareUsed, label: `${daysLeft}d` };
}

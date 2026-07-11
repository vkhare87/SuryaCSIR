import type { AppraisalCycle, PMSReport } from '../../types/pms';
import { PMS_DEADLINES, REPRESENTATION_WINDOW_DAYS } from './constants';

export interface CycleDeadlines {
  selfAppraisal: Date;
  ecCompletion: Date;
  empoweredCompletion: Date;
  systemLock: Date;
}

/**
 * Milestones for a financial-year cycle. The reporting year ends Mar 31 of
 * year Y; all milestones (May 15 / Jun 30 / Jul 31 / Nov 30) fall in Y —
 * derived from the cycle's end date.
 */
export function cycleDeadlines(cycle: Pick<AppraisalCycle, 'endDate'>): CycleDeadlines {
  const year = new Date(cycle.endDate).getFullYear();
  const at = (m: { month: number; day: number }) => new Date(year, m.month - 1, m.day, 23, 59, 59, 999);
  return {
    selfAppraisal:       at(PMS_DEADLINES.SELF_APPRAISAL),
    ecCompletion:        at(PMS_DEADLINES.EC_COMPLETION),
    empoweredCompletion: at(PMS_DEADLINES.EMPOWERED_COMPLETION),
    systemLock:          at(PMS_DEADLINES.SYSTEM_LOCK),
  };
}

export function isPastSelfAppraisalDeadline(cycle: Pick<AppraisalCycle, 'endDate'>, now: Date = new Date()): boolean {
  return now.getTime() > cycleDeadlines(cycle).selfAppraisal.getTime();
}

export function isPastECDeadline(cycle: Pick<AppraisalCycle, 'endDate'>, now: Date = new Date()): boolean {
  return now.getTime() > cycleDeadlines(cycle).ecCompletion.getTime();
}

export function isPastEmpoweredDeadline(cycle: Pick<AppraisalCycle, 'endDate'>, now: Date = new Date()): boolean {
  return now.getTime() > cycleDeadlines(cycle).empoweredCompletion.getTime();
}

/** Absolute system-wide lock after Nov 30 — no PMS writes for the cycle. */
export function isSystemLocked(cycle: Pick<AppraisalCycle, 'endDate'>, now: Date = new Date()): boolean {
  return now.getTime() > cycleDeadlines(cycle).systemLock.getTime();
}

/** Representation window: exactly 15 days after electronic score communication. */
export function representationWindowOpen(
  report: Pick<PMSReport, 'status' | 'scoreCommunicatedAt'>,
  now: Date = new Date()
): boolean {
  if (report.status !== 'FINALIZED' || !report.scoreCommunicatedAt) return false;
  const close = new Date(report.scoreCommunicatedAt).getTime() + REPRESENTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= close;
}

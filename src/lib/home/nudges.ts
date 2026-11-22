export interface EscalationConsequence {
  stage: 'NONE' | 'DRAFT_OFFERED' | 'REMINDER_7D' | 'REMINDER_2D' | 'DUE_TODAY' | 'ESCALATED_HOD';
  line: string;
  severity: 'info' | 'warning' | 'critical';
}

/**
 * Pure escalation ladder for scientist report deadlines (SH4).
 * Matches `public.report_nudge_sweep()` in SQL:
 * - 30d before: draft offered
 * - 7d before: reminder
 * - 2d before: reminder
 * - 0d: due today
 * - 7+ days overdue: HoD is told
 */
export function reportEscalationLine(daysUntilDue: number): EscalationConsequence {
  if (daysUntilDue <= -7) {
    return {
      stage: 'ESCALATED_HOD',
      line: '7+ days overdue — your HoD has been notified.',
      severity: 'critical',
    };
  }
  if (daysUntilDue < 0) {
    const remaining = 7 + daysUntilDue;
    return {
      stage: 'DUE_TODAY',
      line: `Overdue — HoD will be told in ${remaining} day${remaining === 1 ? '' : 's'}.`,
      severity: 'critical',
    };
  }
  if (daysUntilDue === 0) {
    return {
      stage: 'DUE_TODAY',
      line: 'Due today — HoD is told at 7 days overdue.',
      severity: 'critical',
    };
  }
  if (daysUntilDue <= 2) {
    return {
      stage: 'REMINDER_2D',
      line: `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — final reminder before due date.`,
      severity: 'warning',
    };
  }
  if (daysUntilDue <= 7) {
    return {
      stage: 'REMINDER_7D',
      line: `Due in ${daysUntilDue} days — reminder sent 2 days before due.`,
      severity: 'warning',
    };
  }
  if (daysUntilDue <= 30) {
    return {
      stage: 'DRAFT_OFFERED',
      line: 'Draft ready — next reminder 7 days before due.',
      severity: 'info',
    };
  }
  return {
    stage: 'NONE',
    line: 'On track — draft offered 30 days before due.',
    severity: 'info',
  };
}

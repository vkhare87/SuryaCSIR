import { describe, it, expect } from 'vitest';
import { reportEscalationLine } from './nudges';

describe('Stage 3 pure helpers (SH4 escalation ladder)', () => {
  it.each([
    [45, 'NONE', 'info'],
    [30, 'DRAFT_OFFERED', 'info'],
    [7, 'REMINDER_7D', 'warning'],
    [2, 'REMINDER_2D', 'warning'],
    [0, 'DUE_TODAY', 'critical'],
    [-3, 'DUE_TODAY', 'critical'],
    [-7, 'ESCALATED_HOD', 'critical'],
    [-14, 'ESCALATED_HOD', 'critical'],
  ] as const)('daysUntilDue=%i yields stage %s (%s)', (days, expectedStage, expectedSeverity) => {
    const res = reportEscalationLine(days);
    expect(res.stage).toBe(expectedStage);
    expect(res.severity).toBe(expectedSeverity);
    expect(res.line.length).toBeGreaterThan(10);
  });
});

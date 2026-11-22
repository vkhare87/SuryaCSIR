export interface PrecheckResult {
  status: 'PASS' | 'FINDING' | 'NOT_CONNECTED';
  summary: string;
}

export interface PrecheckInput {
  amountInr?: number | null;
  tenureYearsUsed?: number | null;
  lateMilestonesCount?: number | null;
  reasonGiven?: boolean;
  readinessScore?: number | null;
  coiComplete?: boolean | null;
  hasScheduleClash?: boolean | null;
  daysLeftInWindow?: number | null;
}

/**
 * Pure deterministic pre-checks for HoD approval rows (HH3).
 * Never emits PASS unless the underlying data was actually supplied.
 */
export function runDecisionPrecheck(kind: string, input: PrecheckInput): PrecheckResult {
  switch (kind) {
    case 'HIRING_EXTENSION':
    case 'RECRUITMENT': {
      if (input.tenureYearsUsed === undefined || input.tenureYearsUsed === null) {
        return { status: 'NOT_CONNECTED', summary: 'Tenure & funds check not connected yet.' };
      }
      if (input.tenureYearsUsed >= 6) {
        return { status: 'FINDING', summary: `Tenure ${input.tenureYearsUsed.toFixed(1)}y approaches/exceeds 6-year cap.` };
      }
      return { status: 'PASS', summary: `Tenure within cap (${input.tenureYearsUsed.toFixed(1)}y used).` };
    }
    case 'PURCHASE_INDENT': {
      if (input.amountInr === undefined || input.amountInr === null) {
        return { status: 'NOT_CONNECTED', summary: 'CPS indent amount not connected yet.' };
      }
      if (input.amountInr > 500000) {
        return { status: 'FINDING', summary: `Amount INR ${input.amountInr.toLocaleString('en-IN')} exceeds ₹5 lakh threshold.` };
      }
      return { status: 'PASS', summary: 'Within ₹5 lakh delegation threshold.' };
    }
    case 'PROGRESS_REPORT': {
      if (input.lateMilestonesCount === undefined || input.lateMilestonesCount === null) {
        return { status: 'NOT_CONNECTED', summary: 'Milestone status not connected yet.' };
      }
      if (input.lateMilestonesCount > 0 && !input.reasonGiven) {
        return { status: 'FINDING', summary: `${input.lateMilestonesCount} late milestone(s) without explanation.` };
      }
      return { status: 'PASS', summary: 'Milestones accounted for.' };
    }
    case 'PROPOSAL':
    case 'DIRECTOR_APPROVAL':
    case 'DIRECTOR_FORWARD': {
      if (input.readinessScore === undefined || input.readinessScore === null) {
        return { status: 'NOT_CONNECTED', summary: 'Proposal readiness check not connected yet.' };
      }
      if (input.readinessScore < 60 || input.coiComplete === false) {
        return { status: 'FINDING', summary: `Readiness ${input.readinessScore}%${input.coiComplete === false ? ' · COI pending' : ''}.` };
      }
      return { status: 'PASS', summary: `Readiness ${input.readinessScore}% and COI complete.` };
    }
    case 'LEAVE_TOUR': {
      if (input.hasScheduleClash === undefined || input.hasScheduleClash === null) {
        return { status: 'NOT_CONNECTED', summary: 'Schedule clash check not connected yet.' };
      }
      if (input.hasScheduleClash) {
        return { status: 'FINDING', summary: 'Clashes with review slot or committee meeting.' };
      }
      return { status: 'PASS', summary: 'No review or meeting clash.' };
    }
    default: {
      if (input.daysLeftInWindow === undefined || input.daysLeftInWindow === null) {
        return { status: 'NOT_CONNECTED', summary: 'Pre-check data not connected yet.' };
      }
      if (input.daysLeftInWindow < 0) {
        return { status: 'FINDING', summary: `Window closed ${Math.abs(input.daysLeftInWindow)}d ago.` };
      }
      return { status: 'PASS', summary: `${input.daysLeftInWindow}d remaining in window.` };
    }
  }
}

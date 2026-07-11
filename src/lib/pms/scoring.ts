import {
  BELOW_THRESHOLD,
  GRADE_BANDS,
  OUTSTANDING_THRESHOLD,
  SCORE_RANGE,
} from './constants';

export function clampScore(score: number): number {
  return Math.round(Math.min(SCORE_RANGE.max, Math.max(SCORE_RANGE.min, score)));
}

/** 2026 scale: whole numbers 0–100 only. */
export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= SCORE_RANGE.min && score <= SCORE_RANGE.max;
}

export function getGrade(score: number): string {
  const band = GRADE_BANDS.find(b => score >= b.min && score <= b.max);
  return band?.label ?? 'Unknown';
}

/** Score >= 90 ("Outstanding") mandates reasons_for_outstanding. */
export function requiresOutstandingReasons(score: number): boolean {
  return score >= OUTSTANDING_THRESHOLD;
}

/** Score <= 75 mandates reasons_below_threshold + suggestions_for_improvement. */
export function requiresBelowThresholdReasons(score: number): boolean {
  return score <= BELOW_THRESHOLD;
}

export function averageScores(scores: number[]): number | null {
  const valid = scores.filter(isValidScore);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

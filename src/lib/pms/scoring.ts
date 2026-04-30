import { SCORE_CATEGORIES, SCORE_RANGE } from './constants';

export function clampScore(score: number): number {
  return Math.min(SCORE_RANGE.max, Math.max(SCORE_RANGE.min, score));
}

export function getScoreCategory(score: number): string {
  const cat = SCORE_CATEGORIES.find(c => score >= c.min && score <= c.max);
  return cat?.label ?? 'Unknown';
}

export function isValidScore(score: number): boolean {
  return score >= SCORE_RANGE.min && score <= SCORE_RANGE.max;
}

export function averageScores(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const valid = scores.filter(isValidScore);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

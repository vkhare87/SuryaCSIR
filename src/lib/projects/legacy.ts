import type { ProjectInfo } from '../../types';
import { projectStage } from './stage';

const isoDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');

/** Financial years from a start to an end date: 2024-04-01 → 2025-09-30 gives 2024-25, 2025-26. */
export function yearsBetween(start: string, end: string): string[] {
  if (!isoDate(start) || !isoDate(end) || end < start) return [];
  const fy = (d: string) => { const y = Number(d.slice(0, 4)); return Number(d.slice(5, 7)) >= 4 ? y : y - 1; };
  const out: string[] = [];
  for (let y = fy(start); y <= fy(end); y++) out.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  return out;
}

/** A running project that predates SURYA and has not been brought in yet (plan §10, step 2). */
export function needsLegacyCompletion(p: Pick<ProjectInfo, 'proposalId' | 'legacyCompletedAt' | 'stage' | 'ProjectStatus'>): boolean {
  return !p.proposalId && !p.legacyCompletedAt
    && ['SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING'].includes(projectStage(p) ?? '');
}

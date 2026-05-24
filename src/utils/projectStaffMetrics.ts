import type { CategoryDatum } from '../components/viz/CategoryBar';
import type { TrendPoint } from '../components/viz/TrendLine';
import { parseDate, diffInDays } from './dateUtils';
import type { ProjectStaff } from '../types';

export function parseDurationEnd(duration: string): Date | null {
  if (!duration) return null;
  const idx = duration.toLowerCase().indexOf(' to ');
  if (idx === -1) return null;
  return parseDate(duration.slice(idx + 4).trim());
}

export function getTenureYears(staff: ProjectStaff[], now: Date = new Date()): number[] {
  const out: number[] = [];
  for (const s of staff) {
    const d = parseDate(s.DateOfJoining);
    if (!d) continue;
    const yrs = diffInDays(now, d) / 365.25;
    if (Number.isFinite(yrs) && yrs >= 0) out.push(yrs);
  }
  return out;
}

export function getAvgTenure(staff: ProjectStaff[], now: Date = new Date()): number {
  const t = getTenureYears(staff, now);
  if (t.length === 0) return 0;
  return Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 10) / 10;
}

export function getContractRunway(staff: ProjectStaff[], now: Date = new Date()): CategoryDatum[] {
  const buckets: Record<string, number> = { '<3mo': 0, '3–6mo': 0, '6–12mo': 0, '>12mo': 0 };
  for (const s of staff) {
    const end = parseDurationEnd(s.DateOfProjectDuration);
    if (!end) continue;
    const months = diffInDays(end, now) / 30.44;
    if (months < 0) continue;
    if (months < 3) buckets['<3mo']++;
    else if (months < 6) buckets['3–6mo']++;
    else if (months < 12) buckets['6–12mo']++;
    else buckets['>12mo']++;
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

function countBy(staff: ProjectStaff[], key: (s: ProjectStaff) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of staff) {
    const k = key(s) || 'Unspecified';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function getHeadcountByProject(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.ProjectNo), ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

export function getHeadcountByPI(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.PIName), ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

export function getDesignationMix(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.Designation), ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value,
  );
}

export function getHiresByCycle(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.RecruitmentCycle), ([label, value]) => ({ label, value })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function getJoiningByYear(staff: ProjectStaff[]): TrendPoint[] {
  const m = new Map<number, number>();
  for (const s of staff) {
    const d = parseDate(s.DateOfJoining);
    if (!d) continue;
    const y = d.getFullYear();
    m.set(y, (m.get(y) ?? 0) + 1);
  }
  return Array.from(m, ([y, value]) => ({ label: String(y), value })).sort((a, b) => a.label.localeCompare(b.label));
}

export function getDivisionMix(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.DivisionCode), ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value,
  );
}

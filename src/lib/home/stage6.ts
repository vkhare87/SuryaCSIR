import type { Project, StaffMember } from '../../types';

export function isThreadIdle(lastContactOn: string, todayIso: string, thresholdDays = 21): boolean {
  const last = Date.parse(lastContactOn);
  const today = Date.parse(todayIso);
  if (Number.isNaN(last) || Number.isNaN(today)) return false;
  const diffDays = Math.floor((today - last) / 86_400_000);
  return diffDays >= thresholdDays;
}

export function fellowshipMonthsRemaining(joinedOn: string, todayIso: string, maxMonths = 60): number | null {
  const start = new Date(joinedOn);
  const today = new Date(todayIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) return null;
  const elapsed = (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + (today.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, maxMonths - Math.max(0, elapsed));
}

export function portfolioHealthScore(projects: Project[], todayIso: string): number {
  const active = projects.filter((p) => p.ProjectStatus === 'Active');
  if (active.length === 0) return 100;
  let score = 0;
  for (const p of active) {
    let item = 100;
    if (p.CompletioDate && p.CompletioDate < todayIso) item -= 40;
    const sanctioned = Number(p.SanctionedCost || 0);
    const utilized = Number(p.UtilizedAmount || 0);
    if (sanctioned > 0 && utilized > sanctioned) item -= 35;
    score += Math.max(0, item);
  }
  return Math.round(score / active.length);
}

export interface DivisionExpertiseRow {
  division: string;
  count: number;
}

export function divisionExpertiseMatrix(staff: StaffMember[]): DivisionExpertiseRow[] {
  const counts = new Map<string, number>();
  for (const s of staff) {
    const div = s.Division || 'Unassigned';
    counts.set(div, (counts.get(div) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([division, count]) => ({ division, count }))
    .sort((a, b) => b.count - a.count);
}

export function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

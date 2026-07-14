import { parseDate } from '../../utils/dateUtils';
import type { DivisionInfo } from '../../types';
import type { DossierData } from './dossier';

export type Staleness = 'fresh' | 'aging' | 'stale' | 'empty';

export interface DivisionFreshness {
  divCode: string;
  divName: string;
  /** 0–100: mean of applicable checks (core sections present, key fields filled). */
  completeness: number;
  /** Most recent year seen across project starts, publications, IP filings. */
  latestRecordYear: number | null;
  staleness: Staleness;
  /** Human-readable failing checks, worst first. */
  gaps: string[];
}

interface Check {
  ratio: number; // 0..1
  gap?: string;  // present when ratio < 1
}

function presence(count: number, label: string): Check {
  return count > 0 ? { ratio: 1 } : { ratio: 0, gap: `no ${label} recorded` };
}

function fieldRatio(filled: number, total: number, label: string): Check {
  if (filled === total) return { ratio: 1 };
  return { ratio: filled / total, gap: `${total - filled}/${total} ${label}` };
}

function bandFor(latestYear: number | null, currentYear: number): Staleness {
  if (latestYear === null) return 'empty';
  if (latestYear >= currentYear - 1) return 'fresh';
  if (latestYear >= currentYear - 3) return 'aging';
  return 'stale';
}

/** Data-health snapshot for one division, derived purely from loaded records.
 * "Freshness" is record-derived (latest year seen), not DB timestamps — a
 * division whose newest publication is from 2021 reads stale even if someone
 * re-saved the row yesterday, which is the honest signal for adoption. */
export function divisionFreshness(
  division: DivisionInfo,
  data: DossierData,
  currentYear: number = new Date().getFullYear(),
): DivisionFreshness {
  const code = division.divCode;
  const staff = data.staff.filter(s => s.Division === code);
  const projects = data.projects.filter(p => p.DivisionCode === code);
  const pubs = data.scientificOutputs.filter(s => s.divisionCode === code);
  const ip = data.ipIntelligence.filter(i => i.divisionCode === code);

  const checks: Check[] = [
    presence(staff.length, 'staff'),
    presence(projects.length, 'projects'),
    presence(pubs.length, 'publications'),
  ];
  if (projects.length > 0) {
    checks.push(fieldRatio(
      projects.filter(p => p.PrincipalInvestigator).length,
      projects.length, 'projects missing PI'));
    checks.push(fieldRatio(
      projects.filter(p => parseDate(p.StartDate) !== null).length,
      projects.length, 'projects missing start date'));
  }
  if (staff.length > 0) {
    checks.push(fieldRatio(
      staff.filter(s => s.Email).length,
      staff.length, 'staff missing email'));
  }

  const years: number[] = [];
  for (const p of projects) {
    const y = parseDate(p.StartDate)?.getFullYear();
    if (y) years.push(y);
  }
  for (const s of pubs) if (s.year) years.push(s.year);
  for (const i of ip) {
    const y = parseDate(i.filingDate)?.getFullYear();
    if (y) years.push(y);
  }
  const latestRecordYear = years.length > 0 ? Math.max(...years) : null;

  const gaps = checks
    .filter(c => c.gap)
    .sort((a, b) => a.ratio - b.ratio)
    .map(c => c.gap as string);

  return {
    divCode: code,
    divName: division.divName,
    completeness: Math.round((checks.reduce((s, c) => s + c.ratio, 0) / checks.length) * 100),
    latestRecordYear,
    staleness: bandFor(latestRecordYear, currentYear),
    gaps,
  };
}

/** All divisions, worst first (lowest completeness, then stalest). */
export function instituteFreshness(
  divisions: DivisionInfo[],
  data: DossierData,
  currentYear?: number,
): DivisionFreshness[] {
  return divisions
    .map(d => divisionFreshness(d, data, currentYear))
    .sort((a, b) => a.completeness - b.completeness
      || (a.latestRecordYear ?? 0) - (b.latestRecordYear ?? 0));
}

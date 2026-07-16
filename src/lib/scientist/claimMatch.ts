import { normalizePersonName } from '../../utils/analytics';
import { parseDate } from '../../utils/dateUtils';
import type { ScientificOutput, IPIntelligence, ProjectInfo } from '../../types';
import type { PMSReportSection } from '../../types/pms';

// Cross-checks a scientist's PMS self-appraisal claims against institutional
// records. This is what makes committee decisions fact-grounded: the evaluator
// sees which self-reported items have a matching record and which do not.
//
// LANGUAGE DISCIPLINE (non-negotiable): a claim with no matching record is
// 'no-matching-record', NEVER "unverified" or "false". The likeliest cause is
// an ingestion gap (the record was never loaded), not misconduct. The UI must
// carry that disclosure. This mirrors the coverage-gap stance in
// divisions/dossier.ts.

export type ClaimStatus = 'corroborated' | 'no-matching-record' | 'new-to-system';

export type ClaimKind = 'publication' | 'project' | 'ip';

export interface ClaimMatch {
  kind: ClaimKind;
  /** The scientist's claimed title/name, verbatim from the self-appraisal. */
  claimTitle: string;
  /** Claimed year if the row carried one (used as a match guard). */
  claimYear: number | null;
  status: ClaimStatus;
  /** For 'corroborated': the id of the matching institutional record. */
  matchedRecordId: string | null;
  /** Human-readable one-line description of the matched record, if any. */
  matchedRecordLabel: string | null;
}

export interface ClaimMatchSummary {
  claims: ClaimMatch[];
  corroborated: number;
  noMatchingRecord: number;
  newToSystem: number;
}

/** Section keys whose `items` rows are cross-checkable, and against what. */
const PUBLICATION_SECTION = 'section_i1';
const PROJECT_SECTION = 'section_i2';
const IP_SECTION = 'section_i3';

function normalizeTitle(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-overlap title match. Both titles reduced to word sets; a match needs
 * a high overlap relative to the shorter title (guards against a 2-word claim
 * matching a 20-word record by coincidence). */
function titlesMatch(a: string, b: string): boolean {
  const ta = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 2));
  const tb = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  const smaller = Math.min(ta.size, tb.size);
  return shared / smaller >= 0.7;
}

function parseYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const direct = parseInt(String(raw).trim(), 10);
  if (!Number.isNaN(direct) && direct > 1900 && direct < 3000) return direct;
  return parseDate(raw)?.getFullYear() ?? null;
}

function getItems(section: PMSReportSection | undefined): Record<string, string>[] {
  const items = section?.data?.items;
  return Array.isArray(items) ? (items as Record<string, string>[]) : [];
}

/** Latest year present across institutional records of a kind — a claim dated
 * after it is 'new-to-system' (data probably not ingested yet) rather than
 * 'no-matching-record'. Null when no records carry a year. */
function latestRecordYear(years: (number | null)[]): number | null {
  const valid = years.filter((y): y is number => y !== null);
  return valid.length ? Math.max(...valid) : null;
}

function classify(
  claimYear: number | null,
  match: { id: string; label: string } | null,
  dataHorizonYear: number | null,
): ClaimMatch['status'] {
  if (match) return 'corroborated';
  if (claimYear !== null && dataHorizonYear !== null && claimYear > dataHorizonYear) {
    return 'new-to-system';
  }
  return 'no-matching-record';
}

/**
 * Cross-check a scientist's self-appraisal sections against their institutional
 * records. `scientistName` scopes records to the appraisee (name-variant
 * tolerant, same basis as getStaffPortfolio) so an evaluator sees only this
 * person's corroboration, not the whole institute's.
 */
export function matchClaims(params: {
  sections: PMSReportSection[];
  scientistName: string;
  scientificOutputs: ScientificOutput[];
  ipIntelligence: IPIntelligence[];
  projects: ProjectInfo[];
}): ClaimMatchSummary {
  const { sections, scientistName, scientificOutputs, ipIntelligence, projects } = params;
  const nameKey = normalizePersonName(scientistName);
  const byKey = new Map(sections.map(s => [s.sectionKey, s]));
  const claims: ClaimMatch[] = [];

  // Scope records to this scientist.
  const ownPubs = scientificOutputs.filter(o =>
    o.authors.some(a => normalizePersonName(a) && personKeyMatch(nameKey, a)));
  const ownIp = ipIntelligence.filter(i =>
    i.inventors.some(v => personKeyMatch(nameKey, v)));
  const ownProjects = projects.filter(p => personKeyMatch(nameKey, p.PrincipalInvestigator));

  const pubHorizon = latestRecordYear(ownPubs.map(o => o.year));
  const ipHorizon = latestRecordYear(ownIp.map(i => parseYear(i.filingDate)));
  const projectHorizon = latestRecordYear(ownProjects.map(p => parseYear(p.StartDate)));

  // Publications (section_i1): {title, journal, year, doi}
  for (const row of getItems(byKey.get(PUBLICATION_SECTION))) {
    const title = (row.title ?? '').trim();
    if (!title) continue;
    const claimYear = parseYear(row.year);
    const rec = ownPubs.find(o => titlesMatch(o.title, title)
      && (claimYear === null || o.year === claimYear));
    claims.push(buildClaim('publication', title, claimYear,
      rec ? { id: rec.id, label: `${rec.title} — ${rec.journal} (${rec.year})` } : null,
      pubHorizon));
  }

  // Projects (section_i2): {title, fundingBody, amount, role}
  for (const row of getItems(byKey.get(PROJECT_SECTION))) {
    const title = (row.title ?? '').trim();
    if (!title) continue;
    const rec = ownProjects.find(p => titlesMatch(p.ProjectName, title));
    claims.push(buildClaim('project', title, null,
      rec ? { id: rec.ProjectID, label: `${rec.ProjectNo} ${rec.ProjectName} — ${rec.ProjectStatus}` } : null,
      projectHorizon));
  }

  // IP (section_i3): {title, filingNo, status, year}
  for (const row of getItems(byKey.get(IP_SECTION))) {
    const title = (row.title ?? '').trim();
    if (!title) continue;
    const claimYear = parseYear(row.year);
    const rec = ownIp.find(i => titlesMatch(i.title, title));
    claims.push(buildClaim('ip', title, claimYear,
      rec ? { id: rec.id, label: `${rec.type} ${rec.status}: ${rec.title}` } : null,
      ipHorizon));
  }

  return {
    claims,
    corroborated: claims.filter(c => c.status === 'corroborated').length,
    noMatchingRecord: claims.filter(c => c.status === 'no-matching-record').length,
    newToSystem: claims.filter(c => c.status === 'new-to-system').length,
  };
}

function buildClaim(
  kind: ClaimKind,
  claimTitle: string,
  claimYear: number | null,
  match: { id: string; label: string } | null,
  horizon: number | null,
): ClaimMatch {
  return {
    kind,
    claimTitle,
    claimYear,
    status: classify(claimYear, match, horizon),
    matchedRecordId: match?.id ?? null,
    matchedRecordLabel: match?.label ?? null,
  };
}

/** Name match against a pre-normalized appraisee key (avoids re-normalizing
 * the appraisee name for every record). */
function personKeyMatch(nameKey: string, candidate: string | null | undefined): boolean {
  const other = normalizePersonName(candidate);
  if (!nameKey || !other) return false;
  return nameKey === other || nameKey.includes(other) || other.includes(nameKey);
}

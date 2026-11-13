import type { ProfileFact, ProfileIssue, ProfileSection, TimelineEntry } from '../../types';

/** Display order and headings of the profile sections. */
export const PROFILE_SECTIONS: { key: ProfileSection; label: string }[] = [
  { key: 'PROJECT', label: 'Projects' },
  { key: 'OUTPUT', label: 'Publications' },
  { key: 'IP', label: 'Patents & IP' },
  { key: 'TECH_TRANSFER', label: 'Technology transfer' },
  { key: 'STUDENT', label: 'PhD students' },
  { key: 'COMMITTEE', label: 'Committees' },
  { key: 'AWP', label: 'Annual work plans' },
  { key: 'LESSON', label: 'Lessons learned' },
  { key: 'EQUIPMENT', label: 'Instruments' },
  { key: 'SERVICE', label: 'Service' },
];

/** Fields a person may change on their own record (update_own_profile). */
export const OWN_PROFILE_FIELDS = ['Expertise', 'CoreArea', 'Ext', 'orcid', 'VidwanID'] as const;
export type OwnProfileField = typeof OWN_PROFILE_FIELDS[number];

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Maps a staff_profile_facts row. */
export function mapFactRow(r: Record<string, unknown>): ProfileFact {
  return {
    section: String(r.section) as ProfileSection,
    recordType: String(r.record_type),
    recordId: String(r.record_id),
    title: String(r.title ?? ''),
    role: str(r.role),
    dateFrom: str(r.date_from),
    dateTo: str(r.date_to),
    amount: num(r.amount),
    link: String(r.link ?? ''),
  };
}

export function mapIssueRow(r: Record<string, unknown>): ProfileIssue {
  return {
    staffId: String(r.staff_id), kind: String(r.kind) as ProfileIssue['kind'],
    recordRef: String(r.record_ref ?? ''), detail: String(r.detail ?? ''),
  };
}

export function mapTimelineRow(r: Record<string, unknown>): TimelineEntry {
  return { at: String(r.at), kind: String(r.kind), summary: String(r.summary ?? ''), source: String(r.source) };
}

/** Facts grouped by section, in display order; empty sections left out. */
export function groupFacts(facts: ProfileFact[]): { key: ProfileSection; label: string; facts: ProfileFact[] }[] {
  return PROFILE_SECTIONS
    .map(s => ({ ...s, facts: facts.filter(f => f.section === s.key) }))
    .filter(s => s.facts.length > 0);
}

/** A record link that leaves SURYA (a DOI) opens in a new tab. */
export const isExternalLink = (link: string) => /^https?:\/\//.test(link);

/** Year span of a fact for display: "2023–2026", "2025", or "". */
export function factYears(f: ProfileFact): string {
  const a = f.dateFrom?.slice(0, 4);
  const b = f.dateTo?.slice(0, 4);
  if (a && b && a !== b) return `${a}–${b}`;
  return a ?? b ?? '';
}

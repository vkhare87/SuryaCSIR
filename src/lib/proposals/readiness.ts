import type { Proposal } from '../../types/proposal';

export type SectionKey = 'idea' | 'plan' | 'team' | 'budget' | 'documents';

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'idea', label: 'Idea' },
  { key: 'plan', label: 'Plan' },
  { key: 'team', label: 'Team' },
  { key: 'budget', label: 'Budget' },
  { key: 'documents', label: 'Documents' },
];

export interface ReadinessItem {
  /** Database column, or 'signed_scan' for the uploaded document. */
  column: string;
  section: SectionKey;
  /** What to do, as the home page and the meter say it. */
  action: string;
}

type Draft = Pick<Proposal,
  | 'title' | 'track' | 'abstract' | 'problemStatement' | 'domainTheme' | 'objectives'
  | 'expectedOutcomes' | 'projectCategory' | 'proposedStartDate' | 'proposedDurationMonths'
  | 'piName' | 'divisionCode' | 'requestedBudget' | 'fundType' | 'sponsorType' | 'sponsorName'>;

const blank = (s: string | null | undefined) => !s || s.trim() === '';

// Same rules, same order as proposal_missing_fields() in
// supabase/migrations/20261110000003_proposal_workspace.sql — change both
// together. scripts/db/proposals.db.test.ts compares the two lists.
const RULES: (ReadinessItem & { missing: (p: Draft) => boolean })[] = [
  { column: 'title',                    section: 'idea',   action: 'Give it a title',              missing: p => blank(p.title) },
  { column: 'track',                    section: 'idea',   action: 'Choose in-house or HQ scheme', missing: p => !p.track },
  { column: 'abstract',                 section: 'idea',   action: 'Write the abstract',           missing: p => blank(p.abstract) },
  { column: 'problem_statement',        section: 'idea',   action: 'State the problem',            missing: p => blank(p.problemStatement) },
  { column: 'domain_theme',             section: 'idea',   action: 'Pick a theme',                 missing: p => blank(p.domainTheme) },
  { column: 'objectives',               section: 'plan',   action: 'Add objectives',               missing: p => blank(p.objectives) },
  { column: 'expected_outcomes',        section: 'plan',   action: 'Add expected outcomes',        missing: p => blank(p.expectedOutcomes) },
  { column: 'project_category',         section: 'plan',   action: 'Pick a category',              missing: p => blank(p.projectCategory) },
  { column: 'proposed_start_date',      section: 'plan',   action: 'Set a start date',             missing: p => blank(p.proposedStartDate) },
  { column: 'proposed_duration_months', section: 'plan',   action: 'Set the duration',             missing: p => !p.proposedDurationMonths },
  { column: 'pi_name',                  section: 'team',   action: 'Name the principal investigator', missing: p => blank(p.piName) },
  { column: 'division_code',            section: 'team',   action: 'Set the division',             missing: p => blank(p.divisionCode) },
  { column: 'requested_budget',         section: 'budget', action: 'Enter the budget',             missing: p => !(p.requestedBudget > 0) },
  { column: 'fund_type',                section: 'budget', action: 'Pick the fund type',           missing: p => blank(p.fundType) },
  { column: 'sponsor_type',             section: 'budget', action: 'Pick the sponsor type',        missing: p => blank(p.sponsorType) },
  { column: 'sponsor_name',             section: 'budget', action: 'Name the sponsor',             missing: p => blank(p.sponsorName) },
];

const SIGNED_SCAN: ReadinessItem = { column: 'signed_scan', section: 'documents', action: 'Upload the signed proposal' };

/** Every column the database requires at submit, in the order the meter lists them. */
export const REQUIRED_COLUMNS = RULES.map(r => r.column);

/** What submission still needs. Empty means the proposal can be submitted. */
export function missingItems(p: Draft, hasSignedScan: boolean): ReadinessItem[] {
  const items: ReadinessItem[] = RULES.filter(r => r.missing(p)).map(({ column, section, action }) => ({ column, section, action }));
  if (!hasSignedScan) items.push(SIGNED_SCAN);
  return items;
}

export type SectionState = 'done' | 'started' | 'empty';

/** Tick, dot or nothing beside a section in the workspace. */
export function sectionState(p: Draft, hasSignedScan: boolean, section: SectionKey): SectionState {
  if (section === 'documents') return hasSignedScan ? 'done' : 'empty';
  const rules = RULES.filter(r => r.section === section);
  const missing = rules.filter(r => r.missing(p)).length;
  if (missing === 0) return 'done';
  return missing < rules.length ? 'started' : 'empty';
}

/** Where a proposal stands, in the words the home page uses. */
export function nextStep(p: Draft & Pick<Proposal, 'status'>): string {
  switch (p.status) {
    case 'DRAFT': {
      const first = missingItems(p, true)[0];
      return first ? first.action : 'Upload the signed proposal and submit';
    }
    case 'REVISION_REQUESTED': return 'Revision asked — open to see what to change';
    case 'SUBMITTED':          return 'Waiting for PME';
    case 'UNDER_REVIEW':       return 'Under review';
    case 'RECOMMENDED':        return 'Recommended — awaiting approval';
    case 'APPROVED':           return 'Approved — sanction order awaited';
    case 'OM_ISSUED':          return 'Sanctioned — project record being created';
    case 'LINKED':             return 'Running as a project';
    case 'REJECTED':           return 'Not approved';
    case 'ARCHIVED':           return 'Archived';
  }
}

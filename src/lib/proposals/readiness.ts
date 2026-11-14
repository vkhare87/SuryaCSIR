import type { Proposal, ProposalBudgetLine, ProposalSection } from '../../types/proposal';

export type SectionKey = ProposalSection;

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'idea', label: 'Idea' },
  { key: 'plan', label: 'Plan' },
  { key: 'team', label: 'Team' },
  { key: 'budget', label: 'Budget' },
  { key: 'documents', label: 'Documents' },
];

export interface ReadinessItem {
  /** Database column, a rule code, or 'signed_scan' for the uploaded document. */
  column: string;
  section: SectionKey;
  /** What to do, as the home page and the meter say it. */
  action: string;
}

type Draft = Pick<Proposal,
  | 'title' | 'track' | 'abstract' | 'problemStatement' | 'domainTheme' | 'objectives'
  | 'expectedOutcomes' | 'categoryCode' | 'projectCategory' | 'proposedStartDate' | 'proposedDurationMonths'
  | 'piName' | 'divisionCode' | 'requestedBudget' | 'fundType' | 'sponsorType' | 'sponsorName'>;

/** What readiness needs to know beyond the proposal row. */
export interface ReadinessContext {
  hasSignedScan: boolean;
  hasQuotation: boolean;
  lines: Pick<ProposalBudgetLine, 'head' | 'amount'>[];
  /** csir_rule('project.major_equipment_threshold_inr'); null = not loaded, the server still checks. */
  equipmentThreshold?: number | null;
}

const NO_CONTEXT: ReadinessContext = { hasSignedScan: false, hasQuotation: false, lines: [] };

const blank = (s: string | null | undefined) => !s || s.trim() === '';

// Same rules, same order as proposal_missing_fields() and proposal_readiness()
// in supabase/migrations/20261111000001_proposal_review_chain.sql — change
// both together. scripts/db/proposals.db.test.ts compares the two.
const FIELD_RULES: (ReadinessItem & { missing: (p: Draft) => boolean })[] = [
  { column: 'title',                    section: 'idea',   action: 'Give it a title',              missing: p => blank(p.title) },
  { column: 'track',                    section: 'idea',   action: 'Choose in-house or HQ scheme', missing: p => !p.track },
  { column: 'abstract',                 section: 'idea',   action: 'Write the abstract',           missing: p => blank(p.abstract) },
  { column: 'problem_statement',        section: 'idea',   action: 'State the problem',            missing: p => blank(p.problemStatement) },
  { column: 'domain_theme',             section: 'idea',   action: 'Pick a theme',                 missing: p => blank(p.domainTheme) },
  { column: 'objectives',               section: 'plan',   action: 'Add objectives',               missing: p => blank(p.objectives) },
  { column: 'expected_outcomes',        section: 'plan',   action: 'Add expected outcomes',        missing: p => blank(p.expectedOutcomes) },
  { column: 'category_code',            section: 'plan',   action: 'Pick the HQ category',         missing: p => p.track === 'HQ' && !p.categoryCode },
  { column: 'project_category',         section: 'plan',   action: 'Pick a category',              missing: p => p.track !== 'HQ' && blank(p.projectCategory) },
  { column: 'proposed_start_date',      section: 'plan',   action: 'Set a start date',             missing: p => blank(p.proposedStartDate) },
  { column: 'proposed_duration_months', section: 'plan',   action: 'Set the duration',             missing: p => !p.proposedDurationMonths },
  { column: 'pi_name',                  section: 'team',   action: 'Name the principal investigator', missing: p => blank(p.piName) },
  { column: 'division_code',            section: 'team',   action: 'Set the division',             missing: p => blank(p.divisionCode) },
  { column: 'requested_budget',         section: 'budget', action: 'Add budget lines',             missing: p => !(p.requestedBudget > 0) },
  { column: 'fund_type',                section: 'budget', action: 'Pick the fund type',           missing: p => blank(p.fundType) },
  { column: 'sponsor_type',             section: 'budget', action: 'Pick the sponsor type',        missing: p => blank(p.sponsorType) },
  { column: 'sponsor_name',             section: 'budget', action: 'Name the sponsor',             missing: p => blank(p.sponsorName) },
];

const CONTEXT_RULES: (ReadinessItem & { missing: (p: Draft, c: ReadinessContext) => boolean })[] = [
  {
    column: 'equipment_quotation', section: 'documents', action: 'Attach a quotation for major equipment',
    missing: (_p, c) => !c.hasQuotation && c.equipmentThreshold != null
      && c.lines.some(l => l.head === 'EQUIPMENT' && l.amount >= c.equipmentThreshold!),
  },
  {
    column: 'works_not_allowed', section: 'budget', action: 'Works & Services is allowed only in MMP and FCP projects',
    missing: (p, c) => p.track === 'HQ' && !['MMP', 'FCP'].includes(p.categoryCode ?? '') && c.lines.some(l => l.head === 'WORKS'),
  },
];

const SIGNED_SCAN: ReadinessItem = { column: 'signed_scan', section: 'documents', action: 'Upload the signed proposal' };

/** Everything submission can ask for, in the order the meter lists it. */
export const REQUIRED_COLUMNS = [...FIELD_RULES, ...CONTEXT_RULES].map(r => r.column);

const strip = ({ column, section, action }: ReadinessItem): ReadinessItem => ({ column, section, action });

/** What submission still needs. Empty means the proposal can be submitted. */
export function missingItems(p: Draft, ctx: ReadinessContext = NO_CONTEXT): ReadinessItem[] {
  const items = [
    ...FIELD_RULES.filter(r => r.missing(p)).map(strip),
    ...CONTEXT_RULES.filter(r => r.missing(p, ctx)).map(strip),
  ];
  if (!ctx.hasSignedScan) items.push(SIGNED_SCAN);
  return items;
}

export type SectionState = 'done' | 'started' | 'empty';

/** Tick, dot or nothing beside a section in the workspace. */
export function sectionState(p: Draft, ctx: ReadinessContext, section: SectionKey): SectionState {
  if (section === 'documents') return missingItems(p, ctx).some(i => i.section === 'documents') ? 'empty' : 'done';
  const rules = FIELD_RULES.filter(r => r.section === section && (r.column !== 'category_code' || p.track === 'HQ')
    && (r.column !== 'project_category' || p.track !== 'HQ'));
  const missing = rules.filter(r => r.missing(p)).length
    + CONTEXT_RULES.filter(r => r.section === section && r.missing(p, ctx)).length;
  if (missing === 0) return 'done';
  return missing < rules.length ? 'started' : 'empty';
}

/** Where a proposal stands, in the words the home page uses. */
export function nextStep(p: Draft & Pick<Proposal, 'status'>): string {
  switch (p.status) {
    case 'DRAFT': {
      const first = missingItems(p, { ...NO_CONTEXT, hasSignedScan: true })[0];
      return first ? first.action : 'Print it, get it signed, upload the scan and submit';
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

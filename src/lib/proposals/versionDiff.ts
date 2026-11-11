import type { Proposal } from '../../types/proposal';

export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

const FIELDS: { label: string; read: (p: Proposal) => string }[] = [
  { label: 'Title',              read: p => p.title },
  { label: 'Short name',         read: p => text(p.acronym) },
  { label: 'Track',              read: p => text(p.track) },
  { label: 'Theme',              read: p => p.domainTheme },
  { label: 'Abstract',           read: p => p.abstract },
  { label: 'Problem statement',  read: p => p.problemStatement },
  { label: 'Objectives',         read: p => p.objectives },
  { label: 'Expected outcomes',  read: p => p.expectedOutcomes },
  { label: 'Category',           read: p => p.projectCategory },
  { label: 'Start date',         read: p => p.proposedStartDate },
  { label: 'Duration (months)',  read: p => (p.proposedDurationMonths ? String(p.proposedDurationMonths) : '') },
  { label: 'Current TRL',        read: p => text(p.currentTrl) },
  { label: 'Target TRL',         read: p => text(p.targetTrl) },
  { label: 'Principal investigator', read: p => p.piName },
  { label: 'Division',           read: p => p.divisionCode },
  { label: 'Co-PIs',             read: p => (p.coPIs ?? []).map(c => c.staffName).sort().join(', ') },
  { label: 'Requested budget',   read: p => (p.requestedBudget ? String(p.requestedBudget) : '') },
  { label: 'Fund type',          read: p => p.fundType },
  { label: 'Sponsor type',       read: p => p.sponsorType },
  { label: 'Sponsor',            read: p => p.sponsorName },
];

/** What differs between two states of a proposal, in the order the workspace shows the fields. */
export function diffProposals(before: Proposal, after: Proposal): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of FIELDS) {
    // text(): a snapshot from an older schema may lack a field altogether.
    const a = text(f.read(before)).trim();
    const b = text(f.read(after)).trim();
    if (a !== b) changes.push({ label: f.label, before: a, after: b });
  }
  return changes;
}

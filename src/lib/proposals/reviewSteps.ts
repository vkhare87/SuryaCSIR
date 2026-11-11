import type { ProposalStatus, ReviewStepKind } from '../../types/proposal';

// Mirrors proposal_step_kinds() / proposal_status_after() in
// 20261111000001_proposal_review_chain.sql.
export const STEP_KINDS: Record<'ULIP' | 'HQ', ReviewStepKind[]> = {
  ULIP: ['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL'],
  HQ: ['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'HQ_SCREENING', 'HQ_EXPERT', 'COMPETENT_AUTHORITY'],
};

export const STEP_INFO: Record<ReviewStepKind, { label: string; who: string; approveLabel: string; scanHint: string }> = {
  PME_VETTING:         { label: 'PME vetting',               who: 'PME',                        approveLabel: 'Vetted — send on',      scanHint: 'Vetting note signed by Head PME' },
  FINANCE:             { label: 'Finance vetting',           who: 'Finance',                    approveLabel: 'Vetted — send on',      scanHint: 'Budget sheet signed by Finance' },
  REVIEW_COMMITTEE:    { label: 'Review committee',          who: 'PME or the scheme leader records it', approveLabel: 'Committee recommends', scanHint: 'Signed minutes of the meeting' },
  DIRECTOR_APPROVAL:   { label: 'Director\'s approval',      who: 'Director, or PME with the signed copy', approveLabel: 'Approved',     scanHint: 'Proposal approved and signed by the Director' },
  DIRECTOR_FORWARD:    { label: 'Director forwards to HQ',   who: 'Director, or PME with the signed copy', approveLabel: 'Forwarded',    scanHint: 'Forwarding letter signed by the Director' },
  HQ_SCREENING:        { label: 'HQ internal screening',     who: 'PME records the outcome',    approveLabel: 'Shortlisted',           scanHint: 'Screening committee minutes or HQ letter' },
  HQ_EXPERT:           { label: 'HQ expert committee',       who: 'PME records the outcome',    approveLabel: 'Recommended',           scanHint: 'Expert committee minutes or HQ letter' },
  COMPETENT_AUTHORITY: { label: 'Competent authority',       who: 'PME records the outcome',    approveLabel: 'Approved',              scanHint: 'Approval letter from the competent authority' },
};

export const STEP_STATUS_AFTER: Record<ReviewStepKind, ProposalStatus> = {
  PME_VETTING: 'UNDER_REVIEW',
  FINANCE: 'UNDER_REVIEW',
  REVIEW_COMMITTEE: 'RECOMMENDED',
  DIRECTOR_FORWARD: 'RECOMMENDED',
  HQ_SCREENING: 'RECOMMENDED',
  HQ_EXPERT: 'RECOMMENDED',
  DIRECTOR_APPROVAL: 'APPROVED',
  COMPETENT_AUTHORITY: 'APPROVED',
};

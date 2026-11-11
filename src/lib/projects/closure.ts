import type { ChangeStepKind, CompletionFields, ObjectivesStatus } from '../../types/projectFile';

export interface CompletionField {
  key: Exclude<keyof CompletionFields, 'objectives_status' | 'trl_target' | 'trl_reached'>;
  label: string;
  /** The question a PI answers; written for a future team reading it. */
  prompt: string;
  required: boolean;
}

// Plan §5.4. Required ones mirror project_completion_missing() in
// 20261112000002 (objectives_reason only when objectives fell short).
export const COMPLETION_FIELDS: CompletionField[] = [
  { key: 'summary', label: 'What the project did', prompt: 'In a paragraph: what was built, tested or found.', required: true },
  { key: 'objectives_reason', label: 'Why the objectives fell short', prompt: 'What stopped them, and what would have helped.', required: false },
  { key: 'what_worked', label: 'What worked', prompt: 'Methods, suppliers, set-ups or decisions worth repeating.', required: true },
  { key: 'what_did_not', label: 'What did not work, and why', prompt: 'Dead ends, failures and their causes — so nobody repeats them.', required: true },
  { key: 'reusable_assets', label: 'Reusable assets and where they are', prompt: 'Equipment, samples, code, data, drawings — and where they are kept.', required: false },
  { key: 'recommendations', label: 'Advice to a future team', prompt: 'What you would tell someone starting similar work.', required: true },
  { key: 'follow_on_ideas', label: 'Follow-on ideas', prompt: 'Ideas worth a new proposal, one per line.', required: false },
];

export const OBJECTIVES_LABELS: Record<ObjectivesStatus, string> = {
  MET: 'Met', PARTLY_MET: 'Partly met', NOT_MET: 'Not met',
};

export const CLOSURE_STEP_LABELS: Partial<Record<ChangeStepKind, string>> = {
  PME_VETTING: 'PME vetting',
  FINANCE: 'Finance (statement)',
  REVIEW_COMMITTEE: 'Review committee recommends',
  RESEARCH_COUNCIL: 'Research Council in-principle',
  DIRECTOR_APPROVAL: 'Director approves closure',
  MONITORING_COMMITTEE: 'Monitoring Committee',
  COMPETENT_AUTHORITY: 'DG, CSIR closure',
};

/** Fields still to fill before submission; same list and order as the database. */
export function completionMissing(f: CompletionFields): (keyof CompletionFields)[] {
  const out: (keyof CompletionFields)[] = [];
  if (!f.summary.trim()) out.push('summary');
  if (!f.objectives_status) out.push('objectives_status');
  if ((f.objectives_status === 'PARTLY_MET' || f.objectives_status === 'NOT_MET') && !f.objectives_reason.trim()) out.push('objectives_reason');
  if (!f.what_worked.trim()) out.push('what_worked');
  if (!f.what_did_not.trim()) out.push('what_did_not');
  if (!f.recommendations.trim()) out.push('recommendations');
  return out;
}

export const fieldLabel = (k: keyof CompletionFields) =>
  k === 'objectives_status' ? 'Were the objectives met?' : COMPLETION_FIELDS.find(f => f.key === k)?.label ?? k;

/** Follow-on ideas, one per line, ready to start as drafts. */
export const followOnIdeas = (text: string) => text.split('\n').map(s => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);

export const EMPTY_COMPLETION: CompletionFields = {
  summary: '', objectives_status: null, objectives_reason: '', what_worked: '', what_did_not: '', reusable_assets: '',
  trl_target: null, trl_reached: null, recommendations: '', follow_on_ideas: '',
};

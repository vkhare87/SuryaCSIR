import type { PhDMilestone, PhDMilestoneName } from '../../types';

export const PHD_MILESTONE_ORDER: PhDMilestoneName[] = [
  'Joining', 'Coursework', 'Comprehensive Exam', 'Registration',
  'Synopsis Submission', 'Thesis Submission', 'Viva Voce', 'Degree Awarded',
];

export interface ScholarProgress {
  completed: number;
  percent: number;
  next: PhDMilestoneName | null;
  overdue: PhDMilestoneName[];
}

/** Progress for ONE scholar's milestone rows. */
export function scholarProgress(milestones: PhDMilestone[], today: Date = new Date()): ScholarProgress {
  const byName = new Map(milestones.map(m => [m.milestone, m]));
  const done = PHD_MILESTONE_ORDER.filter(n => byName.get(n)?.completedDate);
  const next = PHD_MILESTONE_ORDER.find(n => !byName.get(n)?.completedDate) ?? null;
  const overdue = PHD_MILESTONE_ORDER.filter(n => {
    const m = byName.get(n);
    return m && !m.completedDate && m.dueDate && new Date(m.dueDate).getTime() < today.getTime();
  });
  return {
    completed: done.length,
    percent: Math.round((done.length / PHD_MILESTONE_ORDER.length) * 100),
    next, overdue,
  };
}

import type { Role } from '../../types';
import type { PMSEvaluation, PMSReport } from '../../types/pms';
import type { DigestItem } from './dataHealth';

const plural = (n: number) => (n === 1 ? '' : 's');

/**
 * PMS evaluation-pending alerts — the autonomy loop for Scientist 360:
 * evidence is already assembled (EvidencePanel/brief) by the time a committee
 * member opens the queue, so the digest just nominates "this is ready,
 * decide". Pure derivation like the other digest builders: items vanish once
 * the evaluation/decision is recorded, nothing is stored.
 */
export function buildPmsDigest(
  role: Role,
  userId: string,
  evaluations: PMSEvaluation[],
  reports: PMSReport[],
): DigestItem[] {
  const items: DigestItem[] = [];

  const pending = evaluations.filter(e =>
    e.evaluatorId === userId && (e.status === 'PENDING' || e.status === 'IN_PROGRESS'));
  if (pending.length > 0) {
    items.push({
      id: 'pms-evaluations-pending',
      severity: 'warning',
      title: `${pending.length} PMS evaluation${plural(pending.length)} pending — evidence ready`,
      detail: 'Institutional evidence assembled for each report; open to review and score.',
      href: '/pms/evaluate',
    });
  }

  if (role === 'EmpoweredCommittee') {
    const awaiting = reports.filter(r => r.status === 'EMPOWERED_COMMITTEE_REVIEW');
    if (awaiting.length > 0) {
      items.push({
        id: 'pms-committee-decisions-pending',
        severity: 'warning',
        title: `${awaiting.length} report${plural(awaiting.length)} awaiting Empowered Committee decision`,
        detail: 'Evaluation Committee appraisals complete; evidence and trajectory ready to review.',
        href: '/pms/committee',
      });
    }
  }

  return items;
}

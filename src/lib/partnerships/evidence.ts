import { parseDate } from '../../utils/dateUtils';
import type { MoU, ProjectInfo, TechTransfer } from '../../types';

// Attribution is inference, not record: nothing in the data links an output to
// the MOU that enabled it. Matching is deliberately false-positive averse —
// "evidence found" is a renewal signal to verify, "none recorded" is not proof
// the MOU was idle.
export interface MouEvidence {
  linkedProject: ProjectInfo | null;
  sponsoredProjects: ProjectInfo[];
  techTransfers: TechTransfer[];
  total: number;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function orgMatch(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // containment only for names long enough to not false-positive ("GE" ⊂ "GEOLOGY")
  return Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x));
}

function inWindow(dateStr: string, from: Date | null, to: Date | null): boolean {
  if (!from || !to) return true; // unparseable MOU dates: don't silently drop evidence
  const d = parseDate(dateStr);
  if (!d) return true;
  return d >= from && d <= to;
}

/** Realised outputs attributable to an MOU within its validity window. */
export function mouEvidence(
  mou: MoU, projects: ProjectInfo[], transfers: TechTransfer[],
): MouEvidence {
  const from = parseDate(mou.signedDate);
  const to = parseDate(mou.validUntil);

  const linkedProject = mou.linkedProjectNo
    ? projects.find(p => p.ProjectNo === mou.linkedProjectNo) ?? null
    : null;

  const sponsoredProjects = projects.filter(p =>
    p.ProjectNo !== linkedProject?.ProjectNo
    && orgMatch(p.SponsorerName, mou.partnerName)
    && inWindow(p.StartDate, from, to));

  const techTransfers = transfers.filter(t =>
    orgMatch(t.licensee, mou.partnerName)
    && inWindow(t.agreementDate, from, to));

  return {
    linkedProject, sponsoredProjects, techTransfers,
    total: (linkedProject ? 1 : 0) + sponsoredProjects.length + techTransfers.length,
  };
}

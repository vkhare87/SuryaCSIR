import type { ScientistDossier } from './dossier';
import type { ClaimMatch, ClaimStatus } from './claimMatch';
import type { TrajectoryFlag } from './trajectory';

// Deterministic markdown pre-evaluation brief — same style as
// divisions/dossier.ts. Facts and disclosure only; the committee scores. The
// brief NEVER contains, suggests, or implies a score for the scientist.

const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  'corroborated': 'Corroborated',
  'no-matching-record': 'No matching institutional record',
  'new-to-system': 'New to system (dated after last data load)',
};

const FLAG_LABEL: Record<TrajectoryFlag, string> = {
  'output-rising': 'Output rising vs previous year',
  'output-flat': 'Output flat vs previous year',
  'output-declining': 'Output declining vs previous year',
  'new-collaboration-cluster': 'New collaboration cluster forming',
  'supervision-load-up': 'High PhD supervision load',
  'budget-overrun-history': 'Budget overrun in project history',
  'duty-days-below-90-candidate': 'Recorded duty days below 90 — check minimum-duty rule',
};

function claimLines(claims: ClaimMatch[]): string[] {
  if (claims.length === 0) return ['_No cross-checkable claims (publications, projects, IP) in the self-appraisal._', ''];
  return [
    ...claims.map(c => {
      const status = CLAIM_STATUS_LABEL[c.status];
      const evidence = c.matchedRecordLabel ? ` → ${c.matchedRecordLabel}` : '';
      return `- [${status}] ${c.claimTitle}${evidence}`;
    }),
    '',
  ];
}

/**
 * Markdown pre-evaluation brief for one scientist. Assembles corroboration
 * status, trajectory, and track record with an explicit disclosure footer. Fed
 * to the existing markdown/PDF export path.
 */
export function buildScientistBrief(dossier: ScientistDossier): string {
  const d = dossier;
  const m = d.member;
  const out: string[] = [];

  out.push(`# Pre-evaluation brief — ${m.Name}`, '');
  out.push(
    `${m.Designation} · ${m.Division}${m.CoreArea ? ` · ${m.CoreArea}` : ''}`,
    `Generated ${d.dataFreshness}. Evidence assembled from institutional records — the committee assigns the score.`,
    '',
  );

  // Present work
  out.push('## Present work', '');
  out.push(
    `- Active projects: ${d.present.activeProjects.length}`,
    `- PhD supervision: ${d.present.supervisedPhDs.length} as supervisor, ${d.present.coSupervisedPhDs.length} as co-supervisor`,
    `- Instruments managed/operated: ${d.present.assignedEquipment.length}`,
    '',
  );

  // Impact
  out.push('## Impact (lifetime, on record)', '');
  out.push(
    `- Publications: ${d.impact.publications.length} (${d.impact.citationTotal} citations on record)`,
    `- IP: ${d.impact.ipAssets.length} filed, ${d.impact.grantedPatents} granted`,
    `- Technology transfers (division): ${d.impact.techTransfers.length}`,
    '',
  );

  // Self-appraisal claim corroboration
  out.push('## Self-appraisal claims vs institutional records', '');
  if (d.claims) {
    out.push(
      `${d.claims.corroborated} corroborated · ${d.claims.noMatchingRecord} no matching record · ${d.claims.newToSystem} new to system`,
      '',
      ...claimLines(d.claims.claims),
    );
  } else {
    out.push('_No PMS report supplied — claim corroboration not run._', '');
  }

  // Trajectory
  out.push('## Trajectory', '');
  if (d.trajectory.flags.length) {
    out.push(...d.trajectory.flags.map(f => `- ${FLAG_LABEL[f]}`), '');
  } else {
    out.push('_No notable pattern flags._', '');
  }
  if (d.trajectory.series.length) {
    out.push('| Year | Pubs | Projects | IP | Transfers |', '|---|---|---|---|---|');
    for (const y of d.trajectory.series) {
      out.push(`| ${y.year} | ${y.publications} | ${y.projectsStarted} | ${y.ipFiled} | ${y.techTransfers} |`);
    }
    out.push('');
  }

  // Track record
  if (d.history.trackRecord) {
    out.push('## Project track record', '');
    out.push(
      `${d.history.trackRecord.completedCount} completed, ${d.history.trackRecord.extendedCount} extended.`,
      '',
    );
  }

  // Prior PMS cycles
  if (d.history.pmsHistory.length) {
    out.push('## Prior PMS cycles', '');
    out.push(...d.history.pmsHistory.map(h =>
      `- ${h.cycleName}: ${h.status}${h.finalScore !== null ? ` — score ${h.finalScore}${h.grade ? ` (${h.grade})` : ''}` : ''}`), '');
  }

  // Disclosure footer — the honesty guard.
  out.push('---', '');
  out.push('## How to read this brief', '');
  out.push(
    '- **"No matching institutional record" ≠ false.** The likeliest cause is a record that was never loaded into the system, not a fabricated claim. Verify against physical/source records before drawing any conclusion.',
    '- **Joins are name-based.** Publications, patents, projects, and supervision are matched to this person by name (variant-tolerant). A name mismatch can hide real work or attach someone else\'s — treat counts as "on record", not definitive.',
    '- **No score here by design.** This brief presents evidence and patterns only. Scoring is the committee\'s decision under the 2026 guidelines.',
    '',
  );

  return out.join('\n');
}
